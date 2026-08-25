-- =====================================================================
--  Make the Gemini daily-verse pool DB-backed (shared across instances).
--  Run in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- Allow a signed-in user to create *today's* pool row if it doesn't exist yet
-- (the first visitor of the day generates it; everyone else reads it).
drop policy if exists daily_verse_insert on daily_verse_pool;
create policy daily_verse_insert on daily_verse_pool
  for insert to authenticated
  with check (date = current_date);
