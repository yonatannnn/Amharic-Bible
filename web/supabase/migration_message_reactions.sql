-- =====================================================================
--  Message reactions — one emoji per person per message, realtime.
--
--  Used by the chat in both web and mobile. friendship_id is denormalized
--  so clients can subscribe to realtime with a friendship filter (same as
--  the messages channel). RLS is keyed on friendship membership.
--
--  Run in Supabase -> SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists message_reactions (
  message_id    uuid not null references messages(id)     on delete cascade,
  user_id       uuid not null references profiles(id)      on delete cascade,
  friendship_id uuid not null references friendships(id)   on delete cascade,
  emoji         text not null,
  created_at    timestamptz default now(),
  primary key (message_id, user_id)        -- one reaction per person per message
);

create index if not exists message_reactions_msg_idx on message_reactions(message_id);
create index if not exists message_reactions_fid_idx on message_reactions(friendship_id);

-- realtime DELETE/UPDATE events need the full old row so clients know what changed
alter table message_reactions replica identity full;

alter table message_reactions enable row level security;

-- see reactions on messages in your friendships
drop policy if exists message_reactions_select on message_reactions;
create policy message_reactions_select on message_reactions for select to authenticated
  using (is_friendship_member(friendship_id));

-- add / change / remove only your own reactions, only in your friendships
drop policy if exists message_reactions_write on message_reactions;
create policy message_reactions_write on message_reactions for all to authenticated
  using      (user_id = auth.uid() and is_friendship_member(friendship_id))
  with check (user_id = auth.uid() and is_friendship_member(friendship_id));

-- publish to realtime (ignore if already added)
do $$ begin
  alter publication supabase_realtime add table message_reactions;
exception when duplicate_object then null; when others then null; end $$;
