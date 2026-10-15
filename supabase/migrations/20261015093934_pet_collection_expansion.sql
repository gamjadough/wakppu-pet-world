-- 0~9번 저장 번호·골드·닉네임·수집 기록은 그대로 유지합니다.
create table wakppu_ranked.pet_catalog (
  id integer primary key check(id between 0 and 14), name text not null,
  rarity_level integer not null check(rarity_level between 0 and 4),
  income numeric not null check(income>=0), click_power integer not null check(click_power>=0),
  personality integer not null check(personality between 0 and 3)
);
alter table wakppu_ranked.pet_catalog enable row level security;
revoke all on wakppu_ranked.pet_catalog from public,anon,authenticated;
create policy catalog_no_direct_read on wakppu_ranked.pet_catalog for select to anon,authenticated using(false);
insert into wakppu_ranked.pet_catalog values
(0,'새싹뿌',0,1.2,0,0),
(1,'돌멩뿌',0,1,1,1),
(2,'물방뿌',1,4,0,2),
(3,'바람뿌',1,3,2,3),
(4,'달빛뿌',2,11,0,0),
(5,'번개뿌',2,8,3,3),
(6,'별무리뿌',3,28,0,2),
(7,'용암뿌',3,20,5,1),
(8,'태양뿌',4,85,0,3),
(9,'우주뿌',4,60,8,0),
(10,'버섯뿌',0,1.1,0,2),
(11,'이슬뿌',1,3.5,1,0),
(12,'서리뿌',2,9,2,1),
(13,'오로라뿌',3,24,3,3),
(14,'은하뿌',4,70,5,2);
alter table wakppu_ranked.players drop constraint players_check;
alter table wakppu_ranked.players add constraint ranked_collection_limits check(cardinality(pets)<=10000 and cardinality(equipped)<=3 and cardinality(discovered)<=15);

create or replace function wakppu_ranked.income(p_pets integer[], p_equipped integer[])
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(c.income * case when exists(
    select 1 from unnest(p_equipped) as other(i)
      join wakppu_ranked.pet_catalog as friend on friend.id=p_pets[other.i+1]
      where friend.id<>c.id and c.personality<>1 and friend.personality<>1
      and (c.personality=2 or friend.personality=2 or c.personality<>friend.personality)
    ) then 1.1 else 1 end),0)
  from unnest(p_equipped) as equipped(i) join wakppu_ranked.pet_catalog c on c.id=p_pets[equipped.i+1];
$$;

create or replace function wakppu_ranked.action_v2(p_action text, p_args jsonb, p_revision bigint, p_request uuid, p_catalog_version integer)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s' as $$
declare
  uid uuid := auth.uid(); r wakppu_ranked.players; t timestamptz := clock_timestamp();
  elapsed numeric; i integer; n integer; v integer; tier integer; rarity integer; pet integer; roll double precision;
  prices integer[] := '{0,50,300,1500}'; limits integer[] := '{12,20,30,45}';
  odds numeric[][] := '{{70,22,6,1.8,0.2},{40,35,18,6,1},{20,35,28,14,3},{10,25,35,23,7}}';
  power integer := 1; next_pets integer[] := '{}'; nick text;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_catalog_version is null or p_catalog_version not in (1,2) then raise exception 'INVALID_CATALOG'; end if;
  if p_action is null or p_action not in ('join','get','sync','tap','buy','select','equip','release','nickname')
     or p_args is null or jsonb_typeof(p_args) <> 'object' or octet_length(p_args::text) > 200 then
    raise exception 'INVALID_ACTION';
  end if;
  if p_action = 'nickname' then
    if p_args - 'nickname' <> '{}'::jsonb or jsonb_typeof(p_args->'nickname') is distinct from 'string' then raise exception 'INVALID_NAME'; end if;
  elsif p_action in ('buy','select','equip','release') then
    if p_args - 'index' <> '{}'::jsonb or coalesce(p_args->>'index','') !~ '^[0-9]{1,5}$' then raise exception 'INVALID_INDEX'; end if;
  elsif p_args <> '{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  if p_action = 'join' then
    insert into wakppu_ranked.players(user_id) values(uid) on conflict do nothing;
  end if;
  select * into r from wakppu_ranked.players where user_id = uid for update;
  if not found then raise exception 'JOIN_REQUIRED'; end if;
  if p_catalog_version=1 and (exists(select 1 from unnest(r.pets || r.discovered) as x(id) where id>=10)) then raise exception 'UPDATE_REQUIRED'; end if;
  if p_action in ('join','get') then return wakppu_ranked.snapshot(r); end if;
  if p_request is null or p_revision is null then raise exception 'INVALID_REQUEST'; end if;
  if r.last_request = p_request then
    if r.last_action <> p_action or r.last_args <> p_args or r.last_base <> p_revision then raise exception 'REQUEST_MISMATCH'; end if;
    return wakppu_ranked.snapshot(r);
  end if;
  if r.revision <> p_revision then raise exception 'RANK_CONFLICT'; end if;
  r.last_pet := null;
  -- 서버 시계만 사용합니다. 15초 이상 접속이 끊기면 오프라인 수익을 지급하지 않습니다.
  elapsed := extract(epoch from (t - r.last_seen));
  if elapsed between 0 and 15 then r.gold := least(1e15, r.gold + wakppu_ranked.income(r.pets,r.equipped) * elapsed); end if;
  r.last_seen := t;
  n := cardinality(r.pets);
  if p_action = 'tap' then
    if t < r.next_tap then raise exception 'TOO_FAST'; end if;
    if n >= 10000 then raise exception 'PET_LIMIT'; end if;
    foreach i in array r.equipped loop power := power + (select click_power from wakppu_ranked.pet_catalog where id=r.pets[i+1]); end loop;
    r.cracks := r.cracks + power;
    r.next_tap := t + interval '50 milliseconds';
    if r.cracks >= limits[r.selected+1] then
      tier := r.selected;
      if tier > 0 then
        if r.stock[tier+1] < 1 then raise exception 'NO_BALL'; end if;
        r.stock[tier+1] := r.stock[tier+1] - 1;
      end if;
      roll := random() * 100; rarity := 4;
      for i in 1..5 loop roll := roll - odds[tier+1][i]; if roll < 0 then rarity := i-1; exit; end if; end loop;
      select id into pet from wakppu_ranked.pet_catalog where rarity_level=rarity and (p_catalog_version=2 or id<10) order by random() limit 1;
      r.pets := array_append(r.pets,pet); r.last_pet := pet;
      if not (pet = any(r.discovered)) then r.discovered := array_append(r.discovered,pet); r.achieved_at := t; end if;
      r.cracks := 0; r.next_tap := t + interval '650 milliseconds';
      if tier > 0 and r.stock[tier+1] = 0 then r.selected := 0; end if;
    end if;
  elsif p_action = 'buy' then
    i := (p_args->>'index')::integer;
    if i not between 1 and 3 then raise exception 'INVALID_INDEX'; end if;
    if r.gold < prices[i+1] then raise exception 'NOT_ENOUGH_GOLD'; end if;
    if r.stock[i+1] >= 9999 then raise exception 'STOCK_LIMIT'; end if;
    r.gold := r.gold - prices[i+1]; r.stock[i+1] := r.stock[i+1] + 1;
  elsif p_action = 'select' then
    i := (p_args->>'index')::integer;
    if i not between 0 and 3 then raise exception 'INVALID_INDEX'; end if;
    if i > 0 and r.stock[i+1] = 0 then raise exception 'NO_BALL'; end if;
    if i <> r.selected then r.selected := i; r.cracks := 0; end if;
  elsif p_action = 'equip' then
    i := (p_args->>'index')::integer;
    if i < 0 or i >= n then raise exception 'INVALID_INDEX'; end if;
    if i = any(r.equipped) then r.equipped := array_remove(r.equipped,i);
    else
      if cardinality(r.equipped) = 3 then r.equipped := r.equipped[1:2]; end if;
      r.equipped := array_append(r.equipped,i);
    end if;
  elsif p_action = 'release' then
    i := (p_args->>'index')::integer;
    if i < 0 or i >= n then raise exception 'INVALID_INDEX'; end if;
    if i = any(r.equipped) then raise exception 'UNEQUIP_FIRST'; end if;
    r.gold := least(1e15,r.gold + (select income from wakppu_ranked.pet_catalog where id=r.pets[i+1]));
    for v in 0..n-1 loop
      if v <> i then
        next_pets := array_append(next_pets,r.pets[v+1]);
      end if;
    end loop;
    -- 최근 장착 순서도 유지합니다.
    select coalesce(array_agg(case when e > i then e-1 else e end order by ord),'{}') into r.equipped
      from unnest(r.equipped) with ordinality as x(e,ord);
    r.pets := next_pets;
  elsif p_action = 'nickname' then
    nick := btrim(p_args->>'nickname');
    if nick = '' then r.nickname := null;
    elsif nick !~ '^[가-힣A-Za-z0-9_]{2,12}$' or lower(nick) in ('admin','administrator','관리자','운영자') then raise exception 'INVALID_NAME';
    else r.nickname := nick; end if;
  end if;
  r.revision := r.revision + 1; r.last_request := p_request;
  r.last_action := p_action; r.last_args := p_args; r.last_base := p_revision;
  update wakppu_ranked.players set nickname=r.nickname,gold=r.gold,pets=r.pets,equipped=r.equipped,
    discovered=r.discovered,stock=r.stock,selected=r.selected,cracks=r.cracks,revision=r.revision,
    last_seen=r.last_seen,next_tap=r.next_tap,achieved_at=r.achieved_at,last_request=r.last_request,
    last_action=r.last_action,last_args=r.last_args,last_base=r.last_base,last_pet=r.last_pet where user_id=uid;
  return wakppu_ranked.snapshot(r);
exception when unique_violation then raise exception 'NAME_TAKEN';
end $$;

-- 이전 탭에는 기존 10종만 반환하고, 신규 펫 기록이 있으면 새로고침을 요구합니다.
create or replace function wakppu_ranked.action(p_action text,p_args jsonb,p_revision bigint,p_request uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select wakppu_ranked.action_v2(p_action,p_args,p_revision,p_request,1);
$$;
create function public.official_action_v2(p_action text,p_args jsonb default '{}',p_revision bigint default 0,p_request uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select wakppu_ranked.action_v2(p_action,p_args,p_revision,p_request,2);
$$;
revoke all on function wakppu_ranked.action_v2(text,jsonb,bigint,uuid,integer) from public,anon,authenticated;
revoke all on function public.official_action_v2(text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function wakppu_ranked.action_v2(text,jsonb,bigint,uuid,integer) to authenticated;
grant execute on function public.official_action_v2(text,jsonb,bigint,uuid) to authenticated;
notify pgrst,'reload schema';

-- 새 펫이 포함된 기존 정원 기록을 이전 클라이언트가 축소 저장하지 못하게 합니다.
create or replace function public.save_game(p_state jsonb, p_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); next_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_revision is null or p_revision < 0 or p_state is null
     or jsonb_typeof(p_state) <> 'object'
     or not (p_state @> '{"version":1}'::jsonb)
     or octet_length(p_state::text) > 2000000 then
    raise exception 'Invalid save';
  end if;
  if exists(select 1 from public.game_saves where user_id=owner_id and state @> '{"catalogVersion":2}'::jsonb) and not (p_state @> '{"catalogVersion":2}'::jsonb) then raise exception 'UPDATE_REQUIRED'; end if;
  if p_revision = 0 then
    insert into public.game_saves(user_id, state) values(owner_id, p_state)
      on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.game_saves set state = p_state, revision = revision + 1, updated_at = now()
      where user_id = owner_id and revision = p_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'SAVE_CONFLICT'; end if;
  return next_revision;
end $$;
revoke all on function public.save_game(jsonb, bigint) from public, anon;
grant execute on function public.save_game(jsonb, bigint) to authenticated;
