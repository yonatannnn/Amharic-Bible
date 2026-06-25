-- =====================================================================
--  Streak model v5 — reset the count to 0 the moment the deadline passes.
--
--  Before: when a streak's deadline passed, expire_streaks() flagged it
--  `broken` but kept the old count on screen until someone sent the next
--  verse (register_verse_share did the reset). So a dead streak still
--  showed e.g. "14" for a while.
--
--  Now: expire_streaks() zeroes the count immediately (the hourly job),
--  while remembering the old value in restorable_count so the 48h Restore
--  still works. No behavior change to how a streak counts up — that still
--  requires BOTH friends to share (unchanged).
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

create or replace function expire_streaks()
returns void language sql security definer set search_path = public as $$
  update streaks set
    broken            = true,
    broken_at         = now(),
    restorable_count  = count,   -- RHS sees the OLD count, before it is zeroed
    restorable_at     = now(),
    count             = 0,        -- <- reset to 0 as soon as the deadline passes
    requester_shared  = false,
    addressee_shared  = false,
    window_deadline   = null,
    updated_at        = now()
  where not broken
    and count > 0
    and window_deadline is not null
    and now() > window_deadline
    and not (requester_shared and addressee_shared);
$$;
