-- =====================================================================
--  Extra features: saved verses (bookmarks/highlights) + account deletion
--  Run in  Supabase → SQL Editor  (after schema.sql). Safe to re-run.
-- =====================================================================

do $$ begin
  create type saved_kind as enum ('bookmark', 'highlight');
exception when duplicate_object then null; end $$;

create table if not exists saved_verses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        saved_kind not null,
  book        int not null,
  chapter     int not null,
  verse_start int not null,
  verse_end   int not null,
  color       text,
  created_at  timestamptz default now()
);
create index if not exists saved_verses_user_idx
  on saved_verses (user_id, book, chapter);

alter table saved_verses enable row level security;

drop policy if exists saved_verses_all on saved_verses;
create policy saved_verses_all on saved_verses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Let a user permanently delete their own account (and, via cascades, all data).
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
