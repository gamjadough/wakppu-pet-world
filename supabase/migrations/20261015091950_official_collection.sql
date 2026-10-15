-- 기존 game_saves와 분리된 공식 정원. 클라이언트 상태 업로드를 받지 않습니다.
create schema if not exists wakppu_ranked;
revoke all on schema wakppu_ranked from public, anon, authenticated;
grant usage on schema wakppu_ranked to anon, authenticated;

create table wakppu_ranked.players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  gold numeric not null default 0 check (gold between 0 and 1e15),
  pets integer[] not null default '{}',
  equipped integer[] not null default '{}',
  discovered integer[] not null default '{}',
  score integer generated always as (cardinality(discovered)) stored,
  stock integer[] not null default '{0,0,0,0}',
  selected integer not null default 0 check (selected between 0 and 3),
  cracks integer not null default 0 check (cracks >= 0),
  revision bigint not null default 0,
  last_seen timestamptz not null default clock_timestamp(),
  next_tap timestamptz not null default '-infinity',
  achieved_at timestamptz not null default clock_timestamp(),
  last_request uuid, last_action text, last_args jsonb, last_base bigint,
  last_pet integer,
  check (nickname is null or nickname ~ '^[가-힣A-Za-z0-9_]{2,12}$'),
  check (cardinality(pets) <= 10000 and cardinality(equipped) <= 3 and cardinality(discovered) <= 10)
);
alter table wakppu_ranked.players enable row level security;
revoke all on wakppu_ranked.players from public, anon, authenticated;
create policy ranked_owner_read on wakppu_ranked.players for select to authenticated
  using ((select auth.uid()) = user_id);
create unique index ranked_nickname on wakppu_ranked.players (lower(nickname)) where nickname is not null;
create index ranked_scores on wakppu_ranked.players (score desc, achieved_at, user_id) where nickname is not null;

create function wakppu_ranked.income(p_pets integer[], p_equipped integer[])
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  rates numeric[] := '{1.2,1,4,3,11,8,28,20,85,60}';
  traits integer[] := '{0,1,2,3,0,3,2,1,3,0}';
  i integer; j integer; a integer; b integer; friendly boolean; total numeric := 0;
begin
  foreach i in array p_equipped loop
    a := p_pets[i+1]; friendly := false;
    foreach j in array p_equipped loop
      b := p_pets[j+1];
      if a <> b and traits[a+1] <> 1 and traits[b+1] <> 1
         and (traits[a+1] = 2 or traits[b+1] = 2 or traits[a+1] <> traits[b+1]) then friendly := true; end if;
    end loop;
    total := total + rates[a+1] * case when friendly then 1.1 else 1 end;
  end loop;
  return total;
end $$;

create function wakppu_ranked.snapshot(p wakppu_ranked.players)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('revision',p.revision,'gold',p.gold,'pets',p.pets,'equipped',p.equipped,
    'discovered',p.discovered,'stock',p.stock,'selected',p.selected,'cracks',p.cracks,
    'nickname',p.nickname,'income',wakppu_ranked.income(p.pets,p.equipped),'hatched',p.last_pet);
$$;

create function wakppu_ranked.action(p_action text, p_args jsonb, p_revision bigint, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5s' as $$
declare
  uid uuid := auth.uid(); r wakppu_ranked.players; t timestamptz := clock_timestamp();
  elapsed numeric; i integer; n integer; v integer; tier integer; rarity integer; pet integer; roll double precision;
  prices integer[] := '{0,50,300,1500}'; limits integer[] := '{12,20,30,45}';
  powers integer[] := '{0,1,0,2,0,3,0,5,0,8}'; rates numeric[] := '{1.2,1,4,3,11,8,28,20,85,60}';
  odds numeric[][] := '{{70,22,6,1.8,0.2},{40,35,18,6,1},{20,35,28,14,3},{10,25,35,23,7}}';
  power integer := 1; next_pets integer[] := '{}'; nick text;
begin
  if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
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
    foreach i in array r.equipped loop power := power + powers[r.pets[i+1]+1]; end loop;
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
      pet := rarity*2 + floor(random()*2)::integer;
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
    r.gold := least(1e15,r.gold + rates[r.pets[i+1]+1]);
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

create function wakppu_ranked.board()
returns jsonb language sql stable security definer set search_path = '' set statement_timeout = '5s' as $$
  with ranked as (
    select nickname,score,achieved_at,user_id,rank() over(order by score desc) as place
    from wakppu_ranked.players where nickname is not null
  ), top_rows as (
    select * from ranked order by score desc,achieved_at,user_id limit 50
  )
  select jsonb_build_object('top',coalesce((select jsonb_agg(jsonb_build_object('nickname',nickname,
    'count',score,'rank',place,'is_me',coalesce(user_id=auth.uid(),false)) order by score desc,achieved_at,user_id) from top_rows),'[]'::jsonb),
    'me',(select jsonb_build_object('nickname',nickname,'count',score,'rank',place) from ranked where user_id=auth.uid()));
$$;

-- 공개 API는 타입이 정해진 얇은 진입점뿐입니다. 점수나 전체 저장을 입력받지 않습니다.
create function public.official_action(p_action text,p_args jsonb default '{}',p_revision bigint default 0,p_request uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select wakppu_ranked.action(p_action,p_args,p_revision,p_request);
$$;
create function public.official_leaderboard()
returns jsonb language sql security invoker set search_path = '' as $$ select wakppu_ranked.board(); $$;

revoke all on all functions in schema wakppu_ranked from public,anon,authenticated;
grant execute on function wakppu_ranked.action(text,jsonb,bigint,uuid) to authenticated;
grant execute on function wakppu_ranked.board() to anon,authenticated;
revoke all on function public.official_action(text,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.official_leaderboard() from public,anon,authenticated;
grant execute on function public.official_action(text,jsonb,bigint,uuid) to authenticated;
grant execute on function public.official_leaderboard() to anon,authenticated;
