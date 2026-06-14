-- =====================================================================
--  Streak model v3 — day rolls over at MIDNIGHT (was 6 AM in v2).
--
--  Why: the chat screen groups messages by calendar day (midnight), but
--  v2 anchored the streak "day" at 6 AM. A share sent between 00:00 and
--  06:00 EAT therefore counted toward the PREVIOUS day, so a verse that
--  visibly appears under "today" in chat could silently fill yesterday's
--  slot — breaking a streak the users believed was intact. Aligning the
--  rollover to midnight makes the streak day match what users see.
--
--  Only register_verse_share changes (the day anchor). The 11:00 EAT
--  grace deadline, expiry job, and reminder logic are unchanged.
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

create or replace function register_verse_share(p_friendship uuid, p_sender uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  fr friendships;
  s streaks;
  is_requester boolean;
  this_month text := to_char(now(), 'YYYY-MM');
  -- the streak "day": the calendar day in Addis time (midnight rollover)
  l_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
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
