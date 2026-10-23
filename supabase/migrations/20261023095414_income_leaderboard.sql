-- 선택 참여형 개인 저장 랭킹. 획득 과정 검증을 보장하는 공식 경쟁 모드가 아닙니다.
-- 개인 저장 테이블의 정책·쓰기 경로는 변경하지 않습니다.
create schema wakppu_income;
revoke all on schema wakppu_income from public,anon,authenticated;
grant usage on schema wakppu_income to anon,authenticated;
create table wakppu_income.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check (char_length(nickname) between 2 and 16 and nickname = btrim(nickname)
   and nickname ~ '^[가-힣A-Za-z0-9_ -]+$'),
 joined_at timestamptz not null default now()
);
create unique index income_nickname_unique on wakppu_income.profiles(lower(nickname));
alter table wakppu_income.profiles enable row level security;
revoke all on wakppu_income.profiles from public,anon,authenticated;

-- 부정확한 업로드가 조회 전체를 실패시키지 않게, 게임과 같은 유효 범위로 정규화합니다.
-- 최신 저장에서 장착된 최대 3마리만 읽고, 점수·골드 등 클라이언트 제출 수치는 받지 않습니다.
create function wakppu_income.rate(p_state jsonb) returns numeric
language plpgsql stable security invoker set search_path='' as $$
declare
 v_indices integer[] := '{}'; v_ids integer[] := '{}'; v_fighting integer[] := '{}';
 v_rates numeric[] := '{}'; v_personas integer[] := '{}';
 item jsonb; pair jsonb; idx integer; species integer; a integer; b integer; i integer; j integer;
 total numeric := 0; bonus boolean; v_rate numeric; v_persona integer;
begin
 if jsonb_typeof(p_state->'pets') is distinct from 'array'
 or jsonb_typeof(p_state->'equipped') is distinct from 'array' then return 0; end if;
 for item in select value from jsonb_array_elements(p_state->'equipped') limit 10000 loop
  if jsonb_typeof(item)='number' and item::text ~ '^(0|[1-9][0-9]{0,3})$' then
   idx := item::text::integer;
   if not idx = any(v_indices) and idx < least(10000,jsonb_array_length(p_state->'pets')) then
    if jsonb_typeof(p_state->'pets'->idx)='number' and (p_state->'pets'->idx)::text ~ '^(0|[1-9][0-9]?)$' then
     species := (p_state->'pets'->idx)::text::integer;
     if species between 0 and 14 then
      v_indices := array_append(v_indices,idx); v_ids := array_append(v_ids,species);
     end if;
    end if;
   end if;
  end if;
  exit when cardinality(v_indices)=3;
 end loop;
 if cardinality(v_indices)=0 then return 0; end if;
 for i in 1..cardinality(v_ids) loop
  select rate,persona into v_rate,v_persona from (values (0,1.2,0),(1,1,1),(2,4,2),(3,3,3),(4,11,0),(5,8,3),(6,28,2),(7,20,1),(8,85,3),(9,60,0),(10,1.1,2),(11,3.5,0),(12,9,1),(13,24,3),(14,70,2)) as catalog(id,rate,persona) where id=v_ids[i];
  v_rates := array_append(v_rates,v_rate); v_personas := array_append(v_personas,v_persona);
 end loop;
 if jsonb_typeof(p_state->'fights')='array' and jsonb_typeof(p_state->'fightEndsAt')='number'
    and length(p_state->>'fightEndsAt')<=17 then
  if (p_state->>'fightEndsAt')::numeric > extract(epoch from statement_timestamp())*1000 then
   for pair in select value from jsonb_array_elements(p_state->'fights') limit 10000 loop
    if jsonb_typeof(pair)='array' then
     if jsonb_array_length(pair)=2 and (pair->0)::text ~ '^(0|[1-9][0-9]{0,3})$' and (pair->1)::text ~ '^(0|[1-9][0-9]{0,3})$' then
      a := (pair->>0)::integer; b := (pair->>1)::integer;
      if a<>b and a=any(v_indices) and b=any(v_indices) and not a=any(v_fighting) and not b=any(v_fighting)
         and (p_state->'pets'->a)<>(p_state->'pets'->b) then
       v_fighting := v_fighting || array[a,b];
      end if;
     end if;
    end if;
   end loop;
  end if;
 end if;
 for i in 1..cardinality(v_ids) loop
  if v_indices[i]=any(v_fighting) then continue; end if;
  bonus := false;
  for j in 1..cardinality(v_ids) loop
   if i<>j and not v_indices[j]=any(v_fighting) and v_ids[i]<>v_ids[j]
      and v_personas[i]<>1 and v_personas[j]<>1
      and (v_personas[i]=2 or v_personas[j]=2 or v_personas[i]<>v_personas[j]) then bonus:=true; end if;
  end loop;
  total := total + v_rates[i] * case when bonus then 1.1 else 1 end;
 end loop;
 return total;
end $$;
revoke all on function wakppu_income.rate(jsonb) from public,anon,authenticated;

-- 비공개 스키마의 함수만 개인 저장을 조회하고 공개용 최소 필드만 반환합니다.
create function wakppu_income.board() returns jsonb
language sql stable security definer set search_path='' as $$
 with scores as materialized (
  select p.user_id,p.nickname,s.updated_at,wakppu_income.rate(s.state) as income
  from wakppu_income.profiles p join public.game_saves s using(user_id)
 ), ranked as materialized (
  select *,rank() over(order by income desc) as rank from scores
 ), top_rows as (
  select rank,nickname,income,updated_at,user_id=auth.uid() as is_me
  from ranked order by income desc,lower(nickname),user_id limit 100
 )
 select jsonb_build_object(
 'total',(select count(*) from ranked),
 'top',coalesce((select jsonb_agg(to_jsonb(t) order by t.rank,lower(t.nickname)) from top_rows t),'[]'::jsonb),
 'me',(select jsonb_build_object('rank',rank,'nickname',nickname,'income',income,'updated_at',updated_at) from ranked where user_id=auth.uid())
 );
$$;
revoke all on function wakppu_income.board() from public,anon,authenticated;
grant execute on function wakppu_income.board() to anon,authenticated;
create function public.income_leaderboard() returns jsonb
language sql stable security invoker set search_path='' as $$ select wakppu_income.board() $$;
revoke all on function public.income_leaderboard() from public,anon,authenticated;
grant execute on function public.income_leaderboard() to anon,authenticated;

create function wakppu_income.profile(p_nickname text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); normalized text := btrim(p_nickname);
begin
 if owner_id is null then raise exception 'LOGIN_REQUIRED'; end if;
 if p_nickname is null then
  delete from wakppu_income.profiles where user_id=owner_id;
 else
  if normalized is null or char_length(normalized) not between 2 and 16 or normalized !~ '^[가-힣A-Za-z0-9_ -]+$' then raise exception 'INVALID_NAME'; end if;
  perform 1 from public.game_saves where user_id=owner_id for key share;
  if not found then raise exception 'SAVE_REQUIRED'; end if;
  begin
   insert into wakppu_income.profiles(user_id,nickname) values(owner_id,normalized)
   on conflict(user_id) do update set nickname=excluded.nickname;
  exception when unique_violation then raise exception 'NAME_TAKEN'; end;
 end if;
 return wakppu_income.board();
end $$;
revoke all on function wakppu_income.profile(text) from public,anon,authenticated;
grant execute on function wakppu_income.profile(text) to authenticated;
create function public.set_income_profile(p_nickname text) returns jsonb
language sql security invoker set search_path='' as $$ select wakppu_income.profile(p_nickname) $$;
revoke all on function public.set_income_profile(text) from public,anon,authenticated;
grant execute on function public.set_income_profile(text) to authenticated;
