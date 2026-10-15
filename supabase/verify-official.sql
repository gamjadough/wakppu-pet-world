-- 새 스키마와 함께 BEGIN ... ROLLBACK 안에서 실행합니다. 테스트 계정은 남기지 않습니다.
insert into auth.users(id) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',true);
do $$ declare a jsonb; b jsonb; id uuid := gen_random_uuid(); failed boolean;
begin
  a := public.official_action('join');
  if (a->>'gold')::numeric <> 0 or jsonb_array_length(a->'pets') <> 0 then raise exception 'FAIL fresh state'; end if;
  a := public.official_action('nickname','{"nickname":"검증계정A"}',(a->>'revision')::bigint,id);
  b := public.official_action('nickname','{"nickname":"검증계정A"}',0,id);
  if a <> b then raise exception 'FAIL duplicate'; end if;
  failed := false;
  begin perform public.official_action('sync','{"gold":1000000}',(a->>'revision')::bigint,gen_random_uuid());
  exception when others then if sqlerrm like '%INVALID_ACTION%' then failed:=true; else raise; end if; end;
  if not failed then raise exception 'FAIL tamper'; end if;
  failed:=false;
  begin perform public.official_action('buy','{"index":1}',(a->>'revision')::bigint,gen_random_uuid());
  exception when others then if sqlerrm like '%NOT_ENOUGH_GOLD%' then failed:=true; else raise; end if; end;
  if not failed then raise exception 'FAIL funds'; end if;
  failed:=false;
  begin update wakppu_ranked.players set gold=999999;
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL direct write'; end if;
  failed:=false;
  begin perform public.official_action('tap','{}',0,gen_random_uuid());
  exception when others then if sqlerrm like '%RANK_CONFLICT%' then failed:=true; else raise; end if; end;
  if not failed then raise exception 'FAIL conflict'; end if;
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true);
do $$ declare a jsonb;
begin
  a := public.official_action('join');
  if a->>'nickname' is not null or jsonb_array_length(a->'pets')<>0 then raise exception 'FAIL user isolation'; end if;
  perform public.official_action('nickname','{"nickname":"검증계정B"}',0,gen_random_uuid());
  if (public.official_leaderboard()->'me'->>'count')::integer<>0 then raise exception 'FAIL own rank'; end if;
end $$;
reset role;
-- 부화 임계값 바로 전을 테스트 픽스처로 구성합니다. 테스트 사용자의 행에만 적용됩니다.
update wakppu_ranked.players set cracks=11 where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',true);
do $$ declare a jsonb; b jsonb; id uuid:=gen_random_uuid();
begin
  a:=public.official_action('tap','{}',1,id);
  b:=public.official_action('tap','{}',1,id);
  if jsonb_array_length(a->'pets')<>1 or jsonb_array_length(a->'discovered')<>1 or a<>b then raise exception 'FAIL hatch/replay'; end if;
  if (public.official_leaderboard()->'me'->>'count')::integer<>1 then raise exception 'FAIL score'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare failed boolean:=false; board jsonb;
begin
  begin perform public.official_action('join'); exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FAIL anonymous write'; end if;
  board:=public.official_leaderboard();
  if board->>'me' is not null or board::text like '%user_id%' or board::text like '%email%' then raise exception 'FAIL public fields'; end if;
end $$;
reset role;
select 'PASS: official server auth, tamper, funds, replay, hatch, rank and privacy' as result;
