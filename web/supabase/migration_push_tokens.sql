-- =====================================================================
--  Push notification device tokens (FCM). Run in Supabase SQL Editor.
-- =====================================================================

create table if not exists device_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text,
  updated_at  timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on device_tokens (user_id);

alter table device_tokens enable row level security;

-- A user manages only their own tokens.
drop policy if exists device_tokens_all on device_tokens;
create policy device_tokens_all on device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
