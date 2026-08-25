-- =====================================================================
--  Verse history: a persistent log of every reference that has already
--  gone out (Telegram broadcast) or been AI-queued. The generate-verses
--  function feeds this list to Gemini as a "do NOT repeat" exclusion so
--  the daily verses keep being fresh instead of cycling the same popular
--  ones (John 3:16, Psalm 23, …).
--  Run in Supabase SQL Editor.
-- =====================================================================

create table if not exists verse_history (
  id       bigint generated always as identity primary key,
  book     int  not null,
  chapter  int  not null,
  verse    int  not null,
  channel  text not null default 'telegram',   -- 'telegram' | 'ai' | 'app'
  used_at  timestamptz not null default now()
);

create index if not exists verse_history_used on verse_history (used_at desc);

alter table verse_history enable row level security;

-- Admins may read it; all writes happen via the service role (Edge Functions).
drop policy if exists vh_select on verse_history;
create policy vh_select on verse_history for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
