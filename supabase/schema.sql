-- Supabase SQL Editor에서 실행합니다. 이 저장은 개인 진행 동기화용입니다.
-- 브라우저가 보내는 기록이므로 공식 랭킹의 근거로 사용하지 않습니다.
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint game_save_shape check (
    jsonb_typeof(state) = 'object' and state @> '{"version":1}'::jsonb
    and octet_length(state::text) <= 2000000
  )
);
alter table public.game_saves enable row level security;
revoke all on public.game_saves from anon, authenticated;
grant select on public.game_saves to authenticated;
drop policy if exists "Read own save" on public.game_saves;
create policy "Read own save" on public.game_saves
  for select to authenticated using ((select auth.uid()) = user_id);

-- revisionを比較することで別ブラウザの新しい保存を上書きしません。
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
