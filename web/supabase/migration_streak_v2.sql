-- =====================================================================
--  Streak model v2 — fixed daily schedule with a morning grace window.
--
--  • A streak "day" is anchored at 6:00 AM Africa/Addis_Ababa.
--  • To keep a streak, BOTH friends must share a verse during the day.
--  • After the 6 AM rollover there is a 5-hour grace until 11:00 AM EAT.
--    Miss it and the streak breaks at 11 AM.
--  • A scheduled job marks streaks broken at the deadline, so the
--    "Restore streak" banner actually appears (previously it never did,
--    because broken was only ever set while someone was sharing).
--
--  Run in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Verse-share handler: 6 AM-anchored day, 11 AM grace deadline.
-- ---------------------------------------------------------------------
create or replace function register_verse_share(p_friendship uuid, p_sender uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  fr friendships;
  s streaks;
  is_requester boolean;
  this_month text := to_char(now(), 'YYYY-MM');
  -- the streak "day": the calendar day in Addis time, anchored at 6 AM
  l_today date := ((now() at time zone 'Africa/Addis_Ababa') - interval '6 hours')::date;
  -- 11:00 EAT grace deadline for the CURRENT day (used when a round is opened)
  v_open  timestamptz := ((l_today + 1)::timestamp + time '11:00') at time zone 'Africa/Addis_Ababa';
  -- 11:00 EAT grace deadline for the NEXT day (used once today is complete)
  v_next  timestamptz := ((l_today + 2)::timestamp + time '11:00') at time zone 'Africa/Addis_Ababa';
begin
  select * into fr from friendships where id = p_friendship and status = 'accepted';
  if not found then return; end if;
  is_requester := (p_sender = fr.requester_id);

  select * into s from streaks where friendship_id = p_friendship for update;
  if not found then
    insert into streaks (friendship_id, restore_period) values (p_friendship, this_month)
    returning * into s;
  end if;

  -- monthly refill of restores
  if s.restore_period is distinct from this_month then
    s.restores_remaining := 3;
    s.restore_period := this_month;
  end if;

  -- deadline passed without both sharing? -> broken
  if s.window_deadline is not null
     and now() > s.window_deadline
     and not (s.requester_shared and s.addressee_shared)
     and not s.broken then
    s.broken := true;
    s.broken_at := now();
  end if;

  -- if broken and not restored, this share starts a fresh streak
  if s.broken then
    s.count := 0;
    s.broken := false;
    s.broken_at := null;
    s.window_deadline := null;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- open a round if none active — deadline is today's 11 AM grace
  if s.window_deadline is null then
    s.window_deadline := v_open;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- record this share
  if is_requester then s.requester_shared := true; else s.addressee_shared := true; end if;
  s.last_share_at := now();

  -- both shared -> count it, at most once per day, then arm tomorrow's deadline
  if s.requester_shared and s.addressee_shared then
    if s.last_increment_on is distinct from l_today then
      s.count := s.count + 1;
      if s.count > s.longest then s.longest := s.count; end if;
      s.last_increment_on := l_today;
    end if;
    s.window_deadline := v_next;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  s.updated_at := now();
  update streaks set
    count = s.count, longest = s.longest, window_deadline = s.window_deadline,
    requester_shared = s.requester_shared, addressee_shared = s.addressee_shared,
    last_share_at = s.last_share_at, broken = s.broken, broken_at = s.broken_at,
    restores_remaining = s.restores_remaining, restore_period = s.restore_period,
    last_increment_on = s.last_increment_on, updated_at = s.updated_at
  where friendship_id = p_friendship;
end $$;

-- ---------------------------------------------------------------------
-- 2) Expiry job: mark streaks broken once the 11 AM grace has passed.
--    This is what makes the "Restore streak" banner appear.
-- ---------------------------------------------------------------------
create or replace function expire_streaks()
returns void language sql security definer set search_path = public as $$
  update streaks set broken = true, broken_at = now(), updated_at = now()
  where not broken
    and count > 0
    and window_deadline is not null
    and now() > window_deadline
    and not (requester_shared and addressee_shared);
$$;

-- ---------------------------------------------------------------------
-- 3) Reminder targets — unchanged logic: each user who still must share
--    before the deadline, when it is within the next 5 hours (the grace).
-- ---------------------------------------------------------------------
create or replace function streak_reminder_targets()
returns table(user_id uuid, friend_name text, streak_count int)
language sql security definer set search_path = public as $$
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
-- 4) Reschedule the cron jobs (pg_cron runs in UTC; EAT = UTC+3).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the old every-4-hours reminder with a single morning push at the
-- start of the grace window: 06:00 EAT = 03:00 UTC.
-- IMPORTANT: replace <CRON_SECRET> with the SAME value already in your existing
-- streak-reminder job (your CRON_SECRET). Check it with:  select jobname, command from cron.job;
do $$ begin perform cron.unschedule('streak-reminder'); exception when others then null; end $$;
select cron.schedule('streak-reminder', '0 3 * * *', $cron$
  select net.http_post(
    url := 'https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/push-cron',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
    body := '{"task":"streak"}'::jsonb
  );
$cron$);

-- Expire streaks hourly so a broken streak is flagged promptly (all deadlines
-- are 11 AM EAT, but hourly keeps it robust). Pure SQL — no HTTP needed.
do $$ begin perform cron.unschedule('streak-expire'); exception when others then null; end $$;
select cron.schedule('streak-expire', '0 * * * *', $cron$ select expire_streaks(); $cron$);

-- One-time: flag any already-expired streaks right now.
select expire_streaks();
