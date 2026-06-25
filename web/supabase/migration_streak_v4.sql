-- =====================================================================
--  Streak model v4
--
--  Two fixes on top of v3 (midnight rollover):
--
--  1) SOFTER DEADLINE — the grace deadline moves from 11:00 AM to the
--     END OF THE DAY (midnight EAT). A verse shared any time during the
--     grace day now counts; people were losing streaks by sharing a bit
--     after 11 AM.
--
--  2) PERSISTENT RESTORE — previously the "Restore streak" banner was
--     wiped out the instant either friend sent the next verse (that share
--     reset count->0 and cleared `broken`). Now, when a streak breaks we
--     remember it in `restorable_count` / `restorable_at`, and that stays
--     restorable for 48h regardless of new shares. So a fresh streak can
--     start building while the old one is still one tap away from being
--     restored.
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

-- remember a broken streak so it can be restored within 48h, even after
-- new verses start a fresh streak
alter table streaks add column if not exists restorable_count int;
alter table streaks add column if not exists restorable_at    timestamptz;

-- ---------------------------------------------------------------------
-- 1) verse-share handler: midnight day, END-OF-DAY grace, remember breaks
-- ---------------------------------------------------------------------
create or replace function register_verse_share(p_friendship uuid, p_sender uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  fr friendships;
  s streaks;
  is_requester boolean;
  this_month text := to_char(now(), 'YYYY-MM');
  -- the streak "day": calendar day in Addis time (midnight rollover)
  l_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  -- END-OF-DAY (midnight) grace deadlines, in EAT:
  --   v_open = end of tomorrow      (deadline when a round is opened today)
  --   v_next = end of day-after-tomorrow (deadline once today is complete)
  v_open timestamptz := ((l_today + 2)::timestamp) at time zone 'Africa/Addis_Ababa';
  v_next timestamptz := ((l_today + 3)::timestamp) at time zone 'Africa/Addis_Ababa';
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

  -- deadline passed without both sharing? -> broken (and remember it)
  if s.window_deadline is not null
     and now() > s.window_deadline
     and not (s.requester_shared and s.addressee_shared)
     and not s.broken then
    s.broken := true;
    s.broken_at := now();
    if s.count > 0 then
      s.restorable_count := s.count;
      s.restorable_at := now();
    end if;
  end if;

  -- if broken, this share starts a fresh streak. We DO NOT clear the
  -- restorable_* fields, so the old streak stays restorable for 48h.
  if s.broken then
    s.count := 0;
    s.broken := false;
    s.broken_at := null;
    s.window_deadline := null;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- open a round if none active
  if s.window_deadline is null then
    s.window_deadline := v_open;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- record this share
  if is_requester then s.requester_shared := true; else s.addressee_shared := true; end if;
  s.last_share_at := now();

  -- both shared -> count it (at most once per day), then arm tomorrow's deadline
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
    last_increment_on = s.last_increment_on,
    restorable_count = s.restorable_count, restorable_at = s.restorable_at,
    updated_at = s.updated_at
  where friendship_id = p_friendship;
end $$;

-- ---------------------------------------------------------------------
-- 2) expiry job: mark broken AND remember the streak as restorable
-- ---------------------------------------------------------------------
create or replace function expire_streaks()
returns void language sql security definer set search_path = public as $$
  update streaks set
    broken = true,
    broken_at = now(),
    restorable_count = count,
    restorable_at = now(),
    updated_at = now()
  where not broken
    and count > 0
    and window_deadline is not null
    and now() > window_deadline
    and not (requester_shared and addressee_shared);
$$;

-- ---------------------------------------------------------------------
-- 3) restore: recover a remembered break within 48h (3/month).
--    Works whether or not a fresh streak has already started.
-- ---------------------------------------------------------------------
create or replace function restore_streak(p_friendship uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s streaks;
  this_month text := to_char(now(), 'YYYY-MM');
  caller uuid := auth.uid();
  is_member boolean;
  l_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  select (f.requester_id = caller or f.addressee_id = caller) into is_member
  from friendships f where f.id = p_friendship;
  if not coalesce(is_member, false) then return false; end if;

  select * into s from streaks where friendship_id = p_friendship for update;
  if not found then return false; end if;

  if s.restore_period is distinct from this_month then
    s.restores_remaining := 3;
    s.restore_period := this_month;
  end if;

  -- eligible if there is a remembered break within the last 48h
  if coalesce(s.restorable_count, 0) <= 0 then return false; end if;
  if s.restorable_at is null or now() > s.restorable_at + interval '48 hours' then return false; end if;
  if s.restores_remaining <= 0 then return false; end if;

  update streaks set
    count = greatest(count, s.restorable_count),
    longest = greatest(longest, s.restorable_count),
    broken = false,
    broken_at = null,
    restorable_count = null,
    restorable_at = null,
    restores_remaining = s.restores_remaining - 1,
    restore_period = this_month,
    -- treat today as locked in; keep it alive until end of tomorrow
    last_increment_on = l_today,
    requester_shared = false,
    addressee_shared = false,
    window_deadline = ((l_today + 2)::timestamp) at time zone 'Africa/Addis_Ababa',
    updated_at = now()
  where friendship_id = p_friendship;
  return true;
end $$;
