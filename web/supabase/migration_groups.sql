-- =====================================================================
--  Amharic Bible — Groups (verse-sharing group chats)
--  Paste into Supabase → SQL Editor → Run.  Safe to re-run.
--
--  A group is a many-person room. Any member can post `verse` shares
--  (single verse or a range) and `text` messages. Groups have NO streak —
--  they are purely for sharing scripture and discussing it together.
--  Membership is creator-managed: members are added directly by username
--  (no accept/decline step, like a normal group chat).
-- =====================================================================

-- ---------- groups ---------------------------------------------------
create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  created_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz default now()
);

-- ---------- group members (one row per person per group) -------------
create table if not exists group_members (
  group_id     uuid not null references groups(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null default 'member',     -- 'owner' | 'member'
  last_read_at timestamptz,                         -- drives the unread badge
  joined_at    timestamptz default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members (user_id);

-- ---------- group messages (chat) ------------------------------------
--  Reuses the existing message_type enum ('verse','text','image').
create table if not exists group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  type        message_type not null,
  book        int,            -- verse fields
  chapter     int,
  verse_start int,
  verse_end   int,
  text        text,           -- text / image caption
  image_url   text,
  created_at  timestamptz default now()
);
create index if not exists group_messages_group_idx on group_messages (group_id, created_at);

-- =====================================================================
--  Membership helpers (security definer to avoid RLS recursion)
-- =====================================================================
create or replace function is_group_member(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from group_members m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

create or replace function is_group_owner(gid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from groups g
    where g.id = gid and g.created_by = auth.uid()
  );
$$;

-- =====================================================================
--  Create a group with an initial set of members, atomically.
--  Returns the new group id. The caller becomes the owner.
-- =====================================================================
create or replace function create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid    uuid;
  caller uuid := auth.uid();
  m      uuid;
begin
  if caller is null then raise exception 'not authenticated'; end if;

  insert into groups (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Group'), caller)
  returning id into gid;

  insert into group_members (group_id, user_id, role, last_read_at)
  values (gid, caller, 'owner', now());

  if p_members is not null then
    foreach m in array p_members loop
      if m is not null and m <> caller then
        insert into group_members (group_id, user_id, role)
        values (gid, m, 'member')
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return gid;
end $$;

-- =====================================================================
--  Add a member by id (caller must already be in the group).
-- =====================================================================
create or replace function add_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_group_member(p_group) then
    raise exception 'not a member of this group';
  end if;
  insert into group_members (group_id, user_id, role)
  values (p_group, p_user, 'member')
  on conflict do nothing;
end $$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table groups         enable row level security;
alter table group_members  enable row level security;
alter table group_messages enable row level security;

-- groups: members can read; the creator can read the row back right after
-- inserting it (before their membership row is committed via the RPC path).
drop policy if exists groups_select on groups;
create policy groups_select on groups for select to authenticated
  using (created_by = auth.uid() or is_group_member(id));
drop policy if exists groups_insert on groups;
create policy groups_insert on groups for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists groups_update on groups;
create policy groups_update on groups for update to authenticated
  using (is_group_owner(id));
drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete to authenticated
  using (is_group_owner(id));

-- group_members: members see the roster; existing members may add people;
-- you can update only your own row (last_read_at); you can remove yourself,
-- and the owner can remove anyone.
drop policy if exists group_members_select on group_members;
create policy group_members_select on group_members for select to authenticated
  using (is_group_member(group_id));
drop policy if exists group_members_insert on group_members;
create policy group_members_insert on group_members for insert to authenticated
  with check (is_group_member(group_id) or is_group_owner(group_id));
drop policy if exists group_members_update on group_members;
create policy group_members_update on group_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists group_members_delete on group_members;
create policy group_members_delete on group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_owner(group_id));

-- group_messages: members read; send as yourself within a group you're in.
drop policy if exists group_messages_select on group_messages;
create policy group_messages_select on group_messages for select to authenticated
  using (is_group_member(group_id));
drop policy if exists group_messages_insert on group_messages;
create policy group_messages_insert on group_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_group_member(group_id));

-- =====================================================================
--  Total unread group messages for the current user (across all groups).
--  Counts messages from others newer than that group's last_read_at.
--  Used to fold group unread into the Chat nav badge.
-- =====================================================================
create or replace function group_unread_count()
returns int language sql security definer set search_path = public stable as $$
  select coalesce(count(*), 0)::int
  from group_messages gm
  join group_members me
    on me.group_id = gm.group_id and me.user_id = auth.uid()
  where gm.sender_id <> auth.uid()
    and (me.last_read_at is null or gm.created_at > me.last_read_at);
$$;

-- =====================================================================
--  Realtime: stream new group messages + roster changes
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table group_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table group_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table groups;
exception when duplicate_object then null; end $$;
