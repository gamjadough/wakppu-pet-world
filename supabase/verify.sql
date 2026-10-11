-- SQL Editor의 postgres 역할로 실행. 모든 테스트 데이터는 롤백됩니다.
begin;
insert into auth.users(id, aud, role, email) values
 ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'wakppu-test-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'wakppu-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare n bigint;
begin
 n := public.save_game('{"version":1,"gold":25,"pets":[]}', 0);
 if n <> 1 then raise exception 'Initial revision failed'; end if;
 n := public.save_game('{"version":1,"gold":50,"pets":[]}', 1);
 if n <> 2 then raise exception 'Update revision failed'; end if;
 begin
  perform public.save_game('{"version":1,"gold":100}', 1);
  raise exception 'Stale save was accepted';
 exception when others then
  if sqlerrm <> 'SAVE_CONFLICT' then raise; end if;
 end;
 begin
  update public.game_saves set state = '{"version":1}';
  raise exception 'Direct write was accepted';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.game_saves) <> 1 then raise exception 'Own read failed'; end if;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
 if (select count(*) from public.game_saves) <> 0 then raise exception 'Other user save leaked'; end if;
 perform public.save_game('{"version":1,"gold":0}', 0);
 if (select count(*) from public.game_saves) <> 1 then raise exception 'Second user save failed'; end if;
end $$;
set local role anon;
do $$
begin
 begin
  perform * from public.game_saves;
  raise exception 'Anonymous read was accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.save_game('{"version":1}', 0);
  raise exception 'Anonymous write was accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
rollback;
select 'PASS: own save/read, revision conflict, cross-user isolation, direct write and anonymous access denied; test data rolled back' as verification;
