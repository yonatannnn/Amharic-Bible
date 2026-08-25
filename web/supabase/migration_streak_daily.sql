-- =====================================================================
--  Streak update: +1 once per day, the moment both friends have shared
--  a verse that day. Run in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- remember the day the streak last went up (local day)
alter table streaks add column if not exists last_increment_on date;

create or replace function register_verse_share(p_friendship uuid, p_sender uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  fr friendships;
  s streaks;
  is_requester boolean;
  this_month text := to_char(now(), 'YYYY-MM');
  l_today date := (now() at time zone 'Africa/Addis_Ababa')::date;  -- the streak "day"
begin
  select * into fr from friendships where id = p_friendship and status = 'accepted';
  if not found then return; end if;
  is_requester := (p_sender = fr.requester_id);

  -- get or create the streak row (locked)
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

  -- window expired without both sharing? -> broken
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

  -- open a window if none active
  if s.window_deadline is null then
    s.window_deadline := now() + interval '24 hours';
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- record this share
  if is_requester then s.requester_shared := true; else s.addressee_shared := true; end if;
  s.last_share_at := now();

  -- both shared -> count it, but AT MOST ONCE PER DAY
  if s.requester_shared and s.addressee_shared then
    if s.last_increment_on is distinct from l_today then
      s.count := s.count + 1;
      if s.count > s.longest then s.longest := s.count; end if;
      s.last_increment_on := l_today;
    end if;
    -- keep the streak alive for the next day, reset the round
    s.window_deadline := now() + interval '24 hours';
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
