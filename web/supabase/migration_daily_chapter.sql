-- =====================================================================
--  Gemini-chosen "chapter of the day" (one shared pick per day, not a
--  sequential plan). Run in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists daily_chapter (
  date       date primary key,
  book       int not null,
  chapter    int not null,
  created_at timestamptz default now()
);

alter table daily_chapter enable row level security;

-- readable by all signed-in users; first visitor of the day creates today's pick
drop policy if exists daily_chapter_select on daily_chapter;
create policy daily_chapter_select on daily_chapter
  for select to authenticated using (true);

drop policy if exists daily_chapter_insert on daily_chapter;
create policy daily_chapter_insert on daily_chapter
  for insert to authenticated
  with check (date = current_date);
