-- 기존 저장이나 플레이어 기록은 수정하지 않는 권한 감사입니다.
do $$
declare bad integer;
begin
  if not (select relrowsecurity from pg_class where oid='wakppu_ranked.players'::regclass) then raise exception 'RLS missing'; end if;
  if has_table_privilege('anon','wakppu_ranked.players','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','wakppu_ranked.players','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Direct table access'; end if;
  if to_regclass('wakppu_ranked.pet_catalog') is not null then
    if not (select relrowsecurity from pg_class where oid='wakppu_ranked.pet_catalog'::regclass)
       or has_table_privilege('anon','wakppu_ranked.pet_catalog','SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','wakppu_ranked.pet_catalog','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Catalog permissions'; end if;
    if has_function_privilege('anon','public.official_action_v2(text,jsonb,bigint,uuid)','EXECUTE') then raise exception 'Anonymous v2 action access'; end if;
  end if;
  if has_function_privilege('anon','public.official_action(text,jsonb,bigint,uuid)','EXECUTE') then raise exception 'Anonymous action access'; end if;
  if not has_function_privilege('authenticated','public.official_action(text,jsonb,bigint,uuid)','EXECUTE') then raise exception 'Authenticated action missing'; end if;
  if not has_function_privilege('anon','public.official_leaderboard()','EXECUTE') then raise exception 'Public board missing'; end if;
  select count(*) into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='wakppu_ranked' or (n.nspname='public' and p.proname in ('official_action','official_action_v2','official_leaderboard')))
    and (not coalesce(p.proconfig @> array['search_path=""'],false)
      or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE'));
  if bad>0 then raise exception 'Unsafe function configuration: %',bad; end if;
  if (select prosecdef from pg_proc where oid='public.official_action(text,jsonb,bigint,uuid)'::regprocedure) then raise exception 'Public definer entry point'; end if;
end $$;
select 'PASS: RLS, denied table writes/reads, explicit execute grants, private definer, empty search_path' as security_audit;
