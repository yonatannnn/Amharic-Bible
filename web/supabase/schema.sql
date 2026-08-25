-- =====================================================================
--  Amharic Bible — Social Streak App · Supabase schema
--  Paste this whole file into  Supabase → SQL Editor → Run.
--  Safe to re-run (uses if-not-exists / create-or-replace where possible).
-- =====================================================================

-- ---------- enums ----------------------------------------------------
do $$ begin
  create type friendship_status as enum ('pending','accepted','declined','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_type as enum ('verse','text','image');
exception when duplicate_object then null; end $$;

-- ---------- profiles -------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique,                      -- chosen during onboarding (nulls allowed until set)
  name        text,
  avatar_url  text,
  email       text,
  timezone    text default 'Africa/Addis_Ababa',
  created_at  timestamptz default now()
);

-- case-insensitive unique usernames
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

-- ---------- friendships (one row per pair) ---------------------------
create table if not exists friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,
  status        friendship_status not null default 'pending',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on friendships (addressee_id);
create index if not exists friendships_requester_idx on friendships (requester_id);

-- ---------- streaks (one row per friendship) -------------------------
--  Rule: both friends must each share >=1 verse within a rolling 24h
--  window. Completing the round -> count += 1 and a fresh window opens.
create table if not exists streaks (
  friendship_id      uuid primary key references friendships(id) on delete cascade,
  count              int not null default 0,
  longest            int not null default 0,
  window_deadline    timestamptz,             -- both must share before this
  requester_shared   boolean not null default false,  -- in current window
  addressee_shared   boolean not null default false,  -- in current window
  last_share_at      timestamptz,
  broken             boolean not null default false,
  broken_at          timestamptz,
  restores_remaining int not null default 3,
  restore_period     text,                    -- 'YYYY-MM' the 3/month counter applies to
  last_increment_on  date,                    -- the day the streak last went up (once/day)
  updated_at         timestamptz default now()
);

-- ---------- messages (chat) ------------------------------------------
create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references friendships(id) on delete cascade,
  sender_id     uuid not null references profiles(id) on delete cascade,
  type          message_type not null,
  book          int,            -- verse fields
  chapter       int,
  verse_start   int,
  verse_end     int,
  text          text,           -- text / image caption
  image_url     text,
  created_at    timestamptz default now(),
  read_at       timestamptz
);
create index if not exists messages_friendship_idx on messages (friendship_id, created_at);

-- ---------- personal reading progress --------------------------------
create table if not exists reading_progress (
  user_id      uuid not null references profiles(id) on delete cascade,
  date         date not null,
  book         int,
  chapter      int,
  completed_at timestamptz,
  primary key (user_id, date)
);

-- ---------- Gemini daily verse pool (global, 1 row/day) --------------
create table if not exists daily_verse_pool (
  date       date primary key,
  refs       jsonb not null,    -- [{book,chapter,verse}] curated references
  theme      text,
  created_at timestamptz default now()
);

-- ---------- Gemini chapter of the day (global, 1 row/day) ------------
create table if not exists daily_chapter (
  date       date primary key,
  book       int not null,
  chapter    int not null,
  created_at timestamptz default now()
);

-- ---------- push device tokens ---------------------------------------
create table if not exists devices (
  user_id  uuid not null references profiles(id) on delete cascade,
  token    text not null,
  platform text,
  primary key (user_id, token)
);

-- =====================================================================
--  Profile auto-create on signup
-- =====================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
--  Streak engine — called whenever a `verse` message is inserted
-- =====================================================================
create or replace function register_verse_share(p_friendship uuid, p_sender uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  f friendships;
  s streaks;
  is_requester boolean;
  this_month text := to_char(now(), 'YYYY-MM');
  l_today date := (now() at time zone 'Africa/Addis_Ababa')::date;  -- the streak "day"
begin
  select * into f from friendships where id = p_friendship and status = 'accepted';
  if not found then return; end if;
  is_requester := (p_sender = f.requester_id);

  -- get or create the streak row (lock it)
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

  -- did the previous window expire without both sharing? -> broken
  if s.window_deadline is not null
     and now() > s.window_deadline
     and not (s.requester_shared and s.addressee_shared)
     and not s.broken then
    s.broken := true;
    s.broken_at := now();
  end if;

  -- if broken and not restored, this share starts a fresh streak from 0
  if s.broken then
    s.count := 0;
    s.broken := false;
    s.broken_at := null;
    s.window_deadline := null;
    s.requester_shared := false;
    s.addressee_shared := false;
  end if;

  -- open a window if none is active
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

-- restore a broken streak (max 3 / month, within 48h of breaking)
create or replace function restore_streak(p_friendship uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s streaks;
  this_month text := to_char(now(), 'YYYY-MM');
  caller uuid := auth.uid();
  is_member boolean;
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

  if not s.broken then return false; end if;
  if s.broken_at is null or now() > s.broken_at + interval '48 hours' then return false; end if;
  if s.restores_remaining <= 0 then return false; end if;

  update streaks set
    broken = false, broken_at = null,
    restores_remaining = s.restores_remaining - 1,
    restore_period = this_month,
    window_deadline = now() + interval '24 hours',
    requester_shared = false, addressee_shared = false,
    updated_at = now()
  where friendship_id = p_friendship;
  return true;
end $$;

-- trigger: every verse message advances the streak
create or replace function on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'verse' then
    perform register_verse_share(new.friendship_id, new.sender_id);
  end if;
  return new;
end $$;

drop trigger if exists messages_streak_trigger on messages;
create trigger messages_streak_trigger
  after insert on messages
  for each row execute function on_message_insert();

-- =====================================================================
--  Helper: is the current user part of a friendship?
-- =====================================================================
create or replace function is_friendship_member(fid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from friendships f
    where f.id = fid and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  );
$$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table profiles          enable row level security;
alter table friendships       enable row level security;
alter table streaks           enable row level security;
alter table messages          enable row level security;
alter table reading_progress  enable row level security;
alter table daily_verse_pool  enable row level security;
alter table daily_chapter     enable row level security;
alter table devices           enable row level security;

-- profiles: anyone signed-in can read (needed for username search); edit only your own
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated using (id = auth.uid());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());

-- friendships: see/act only on rows you're part of
drop policy if exists friendships_select on friendships;
create policy friendships_select on friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists friendships_insert on friendships;
create policy friendships_insert on friendships for insert to authenticated
  with check (requester_id = auth.uid());
drop policy if exists friendships_update on friendships;
create policy friendships_update on friendships for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
drop policy if exists friendships_delete on friendships;
create policy friendships_delete on friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- streaks: read only (writes happen through security-definer functions)
drop policy if exists streaks_select on streaks;
create policy streaks_select on streaks for select to authenticated
  using (is_friendship_member(friendship_id));

-- messages: read if member; send as yourself within your friendship
drop policy if exists messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (is_friendship_member(friendship_id));
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_friendship_member(friendship_id));
drop policy if exists messages_update on messages;
create policy messages_update on messages for update to authenticated
  using (is_friendship_member(friendship_id));   -- e.g. marking read

-- reading_progress: your own only
drop policy if exists reading_progress_all on reading_progress;
create policy reading_progress_all on reading_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- daily_verse_pool: readable by all signed-in users; first visitor of the day
-- may create today's row (Gemini-curated references).
drop policy if exists daily_verse_select on daily_verse_pool;
create policy daily_verse_select on daily_verse_pool for select to authenticated using (true);
drop policy if exists daily_verse_insert on daily_verse_pool;
create policy daily_verse_insert on daily_verse_pool for insert to authenticated
  with check (date = current_date);

-- daily_chapter: readable by all; first visitor of the day creates the pick
drop policy if exists daily_chapter_select on daily_chapter;
create policy daily_chapter_select on daily_chapter for select to authenticated using (true);
drop policy if exists daily_chapter_insert on daily_chapter;
create policy daily_chapter_insert on daily_chapter for insert to authenticated
  with check (date = current_date);

-- devices: your own only
drop policy if exists devices_all on devices;
create policy devices_all on devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
--  Realtime: stream new chat messages & streak updates
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table streaks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table friendships;
exception when duplicate_object then null; end $$;
