-- =====================================================================
--  @wenngel_bot — the daily ወንጌል broadcast.
--
--  A separate subscriber list from telegram_subscribers on purpose: this is
--  a different bot, and a chat can only be messaged by a bot it has started.
--  Run in the Supabase SQL Editor.
-- =====================================================================

create table if not exists gitsawe_subscribers (
  chat_id       bigint primary key,
  username      text,
  first_name    text,
  active        boolean not null default true,
  subscribed_at timestamptz not null default now()
);

-- Only the service role (Edge Functions) touches this table.
alter table gitsawe_subscribers enable row level security;

create index if not exists gitsawe_subscribers_active
  on gitsawe_subscribers (active) where active;

-- ---------------------------------------------------------------------
--  Broadcast at 6:00 AM EAT (03:00 UTC), the same hour as the verse bot.
--  Replace <CRON_SECRET> with the real value before running.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('gitsawe-daily', '0 3 * * *', $$
  select net.http_post(
    url := 'https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/gitsawe-daily',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000  -- pg_net default is 5000ms; a cold start + 13 sends exceeds it
  );
$$);

-- To remove later:  select cron.unschedule('gitsawe-daily');
