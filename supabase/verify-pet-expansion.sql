-- 새 확장 스키마 뒤에서 실행하고 전체 트랜잭션을 ROLLBACK합니다.
insert into auth.users(id) values('cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
do $$ begin
 if (select count(*) from wakppu_ranked.pet_catalog)<>15 then raise exception 'FAIL catalog count'; end if;
 if (select count(*) from wakppu_ranked.pet_catalog where id>=10)<>5 then raise exception 'FAIL new species'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-ccccccccccc1',true);
do $$ declare a jsonb; denied boolean:=false;
begin
 a:=public.official_action_v2('join');
 if jsonb_array_length(a->'pets')<>0 then raise exception 'FAIL fresh'; end if;
 perform public.save_game('{"version":1,"catalogVersion":2,"pets":[0,10,14],"gold":500}',0);
 begin perform public.save_game('{"version":1,"pets":[0],"gold":500}',1);
 exception when others then if sqlerrm like '%UPDATE_REQUIRED%' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'FAIL old client guard'; end if;
 denied:=false;
 begin update wakppu_ranked.pet_catalog set income=999999;
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL catalog write'; end if;
end $$;
reset role;
update wakppu_ranked.players set pets=array[10,11,12,13,14],equipped=array[0,1,4],
 discovered=array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],nickname='확장_검증',cracks=0,next_tap='-infinity'
 where user_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
set local role authenticated;
do $$ declare a jsonb; denied boolean:=false;
begin
 a:=public.official_action_v2('get');
 if abs((a->>'income')::numeric-82.06)>.000001 then raise exception 'FAIL new income'; end if;
 a:=public.official_action_v2('tap','{}',0,gen_random_uuid());
 if (a->>'cracks')::integer<>7 then raise exception 'FAIL new click power'; end if;
 if (public.official_leaderboard()->'me'->>'count')::integer<>15 then raise exception 'FAIL expanded score'; end if;
 begin perform public.official_action('get');
 exception when others then if sqlerrm like '%UPDATE_REQUIRED%' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'FAIL old official client guard'; end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;
begin
 begin perform public.official_action_v2('join'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'FAIL anonymous v2'; end if;
end $$;
reset role;
