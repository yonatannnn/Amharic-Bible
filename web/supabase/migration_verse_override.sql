-- =====================================================================
--  Admin override for the current verse-of-the-day (no 6h wait).
--  Run in Supabase SQL Editor.
-- =====================================================================

-- 1) Admin flag on profiles.
alter table profiles add column if not exists is_admin boolean not null default false;

-- 2) Single-row override of the current verse, scoped to one 6h window.
create table if not exists daily_verse_override (
  id            int primary key default 1,
  book          int not null,
  chapter       int not null,
  verse         int not null,
  window_index  bigint not null,        -- the 6h window this applies to
  set_by        uuid references profiles(id),
  set_at        timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table daily_verse_override enable row level security;

-- Everyone may read the override; only admins may write it.
drop policy if exists dvo_select on daily_verse_override;
create policy dvo_select on daily_verse_override for select to authenticated using (true);

drop policy if exists dvo_write on daily_verse_override;
create policy dvo_write on daily_verse_override for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- 3) Make yourself an admin (edit the username):
-- update profiles set is_admin = true where username = 'yonatan';
