-- =====================================================================
--  Admin-managed queue of verses for the daily Telegram broadcast.
--  Multi-row + reorderable: the 6 AM job sends the TOP entry (lowest
--  `position`), regardless of manual/AI, then removes it.
--  Run in Supabase SQL Editor (after migration_verse_override.sql).
-- =====================================================================

-- If an older version exists, replace it.
drop table if exists telegram_queue;

create table telegram_queue (
  id       bigint generated always as identity primary key,
  book     int  not null,
  chapter  int  not null,
  verse    int  not null,
  source   text not null default 'manual',                 -- 'manual' | 'ai'
  position double precision not null default extract(epoch from now()), -- lower = sooner; new rows append
  set_by   uuid references profiles(id),
  set_at   timestamptz not null default now()
);

create index telegram_queue_pos on telegram_queue (position);

alter table telegram_queue enable row level security;

-- Admins read/write; the broadcast function reads/writes via the service role.
drop policy if exists tq_select on telegram_queue;
create policy tq_select on telegram_queue for select to authenticated using (true);

drop policy if exists tq_write on telegram_queue;
create policy tq_write on telegram_queue for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
