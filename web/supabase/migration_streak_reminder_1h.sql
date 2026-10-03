-- =====================================================================
--  "1 hour left" streak reminder.
--
--  Notify the friend who HASN'T shared yet, ~1 hour before the streak's
--  deadline. Reuses the existing push-cron edge function (task = "streak")
--  and the existing streak-reminder pg_cron job — we just:
--    • retarget streak_reminder_targets() to a 1-hour window, and
--    • make it fire ONCE per deadline (dedup via reminded_deadline), and
--    • run the cron every 15 min so it can catch that 1-hour mark.
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

-- remember which deadline we already sent a "1h left" reminder for, so the
-- 15-min cron doesn't notify the same person repeatedly
alter table streaks add column if not exists reminded_deadline timestamptz;

-- Same signature the push-cron function already calls, but now:
--   • deadline within the next hour, • that user still hasn't shared,
--   • and we mark the streak so it only fires once per deadline.
create or replace function streak_reminder_targets()
returns table(user_id uuid, friend_name text, streak_count int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    update streaks s
       set reminded_deadline = s.window_deadline
     where not s.broken
       and s.count > 0
       and s.window_deadline is not null
       and s.window_deadline >  now()
       and s.window_deadline <= now() + interval '1 hour'
       and not (s.requester_shared and s.addressee_shared)
       and s.reminded_deadline is distinct from s.window_deadline
    returning s.friendship_id, s.count, s.requester_shared, s.addressee_shared
  )
  -- the requester needs reminding if they haven't shared (name = the addressee)
  select f.requester_id, coalesce(pa.name, pa.username, 'a friend'), d.count
    from due d
    join friendships f on f.id = d.friendship_id
    join profiles   pa on pa.id = f.addressee_id
   where not d.requester_shared
  union all
  -- the addressee needs reminding if they haven't shared (name = the requester)
  select f.addressee_id, coalesce(pr.name, pr.username, 'a friend'), d.count
    from due d
    join friendships f on f.id = d.friendship_id
    join profiles   pr on pr.id = f.requester_id
   where not d.addressee_shared;
end $$;

-- Run the reminder cron every 15 minutes (was once daily at 06:00 EAT).
-- alter_job changes ONLY the schedule, so the job's existing command/secret
-- is left untouched.
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'streak-reminder';
  if jid is not null then
    perform cron.alter_job(jid, schedule => '*/15 * * * *');
  end if;
end $$;
