-- =====================================================================
--  Telegram verse broadcast: subscriber list + 6-hourly cron.
--  Run in Supabase SQL Editor.
-- =====================================================================

create table if not exists telegram_subscribers (
  chat_id       bigint primary key,
  username      text,
  first_name    text,
  active        boolean not null default true,
  subscribed_at timestamptz not null default now()
);

-- Only the service role (Edge Functions) touches this table.
alter table telegram_subscribers enable row level security;

-- ---------------------------------------------------------------------
--  Broadcast the verse of the day once daily at 6:00 AM EAT (03:00 UTC).
--  (The in-app verse itself rotates every 12h; this sends the morning one.)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('telegram-verse', '0 3 * * *', $$
  select net.http_post(
    url := 'https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/telegram-verse',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
    body := '{}'::jsonb
  );
$$);

-- To remove later:  select cron.unschedule('telegram-verse');
