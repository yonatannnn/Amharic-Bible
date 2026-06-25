-- =====================================================================
--  Per-user reading plan for the "Today's chapter" card.
--
--  Default mode 'random' = the existing AI/daily_chapter behavior.
--  Mode 'consecutive' = the user picks a starting chapter; from then on
--  the daily chapter advances one chapter per day through the Bible.
--  Stored per user so web and mobile agree. Computed client-side from a
--  fixed 66-book chapter-count table (1189 chapters total).
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists reading_plan (
  user_id       uuid primary key references profiles(id) on delete cascade,
  mode          text not null default 'random' check (mode in ('random','consecutive')),
  start_book    int,           -- 1..66 (Protestant order)
  start_chapter int,           -- 1-based
  start_date    date,          -- the Addis day that maps to (start_book, start_chapter)
  updated_at    timestamptz default now()
);

alter table reading_plan enable row level security;

drop policy if exists reading_plan_rw on reading_plan;
create policy reading_plan_rw on reading_plan for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
