# @wenngel_bot — daily ወንጌል

## 1. Table + cron
Run `supabase/migration_gitsawe_bot.sql` in the SQL Editor, with `<CRON_SECRET>`
replaced by the real value.

## 2. Secrets
```sh
supabase secrets set GITSAWE_BOT_TOKEN='<token from BotFather>'
supabase secrets set GITSAWE_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```
`CRON_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set
for the existing functions and are reused here.

## 3. Deploy
```sh
supabase functions deploy gitsawe-webhook --no-verify-jwt
supabase functions deploy gitsawe-daily   --no-verify-jwt
```

## 4. Point the bot at the webhook
```sh
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/gitsawe-webhook" \
  -d "secret_token=<the GITSAWE_WEBHOOK_SECRET you generated>"
```

## 5. Check it
```sh
# send today's reading to everyone subscribed
curl -s -X POST "https://zzbnwnhwucaneqqaxiqb.supabase.co/functions/v1/gitsawe-daily" \
  -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{}'

# or a specific Ethiopian day, without waiting for the cron
... -d '{"month":12,"day":17}'
```

## Depends on the web deploy
Both functions read `/{bible,gitsawe}/*.json` from the deployed site. The
81-book Bible and `gitsawe.json` are **not deployed yet**, so the bot cannot
work until `web/` is committed and shipped. Until then `gitsawe-daily` returns
`{"sent":0,"reason":"no gospel for this day"}` rather than sending anything
wrong.
