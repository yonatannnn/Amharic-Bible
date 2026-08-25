-- =====================================================================
--  Scheduled push support: who needs a streak reminder, + pg_cron jobs
--  that call the `push-cron` Edge Function. Run in Supabase SQL Editor.
-- =====================================================================

-- Returns each user who still needs to share a verse before their streak
-- window closes (deadline within the next 5 hours), with the friend's name.
create or replace function streak_reminder_targets()
returns table(user_id uuid, friend_name text, streak_count int)
language sql
security definer
set search_path = public
as $$
  with at_risk as (
    select f.requester_id, f.addressee_id, s.count, s.requester_shared, s.addressee_shared
    from streaks s
    join friendships f on f.id = s.friendship_id
    where s.count > 0
      and not s.broken
      and s.window_deadline is not null
      and s.window_deadline between now() and now() + interval '5 hours'
  )
  select a.requester_id, coalesce(pa.name, pa.username, 'a friend'), a.count
    from at_risk a join profiles pa on pa.id = a.addressee_id
    where not a.requester_shared
  union all
  select a.addressee_id, coalesce(pr.name, pr.username, 'a friend'), a.count
    from at_risk a join profiles pr on pr.id = a.requester_id
    where not a.addressee_shared;
$$;

-- ---------------------------------------------------------------------
--  Scheduling (pg_cron + pg_net). Replace <CRON_SECRET> with the same
--  value you set:  supabase secrets set CRON_SECRET=<CRON_SECRET>
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Streak reminders — every 4 hours (catches windows closing soon).
select cron.schedule('streak-reminder', '0 */4 * * *', $$
  select net.http_post(
    url := 'https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/push-cron',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
    body := '{"task":"streak"}'::jsonb
  );
$$);

-- Verse of the day — 04:00 UTC ≈ 07:00 Addis.
select cron.schedule('daily-verse-push', '0 4 * * *', $$
  select net.http_post(
    url := 'https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/push-cron',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
    body := '{"task":"verse"}'::jsonb
  );
$$);

-- To remove later:  select cron.unschedule('streak-reminder');
--                   select cron.unschedule('daily-verse-push');
