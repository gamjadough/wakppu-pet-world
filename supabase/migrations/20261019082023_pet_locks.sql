-- 잠금 정보를 모르는 이전 탭이 계정 저장을 덮어쓰지 못하게 합니다.
-- 잠금 해제는 lockVersion=1인 새 클라이언트에서 정상적으로 가능합니다.
create function public.protect_pet_locks()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if jsonb_typeof(old.state->'locked') = 'array' then
    if jsonb_array_length(old.state->'locked') > 0 and not (new.state @> '{"lockVersion":1}'::jsonb) then
      raise exception 'UPDATE_REQUIRED';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_pet_locks() from public,anon,authenticated;
create trigger protect_pet_locks before update of state on public.game_saves
for each row execute function public.protect_pet_locks();
