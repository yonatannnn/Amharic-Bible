# Amharic Bible App

A social, streak-based Bible app for Amharic readers — think a "verse-a-day" habit
you keep up *with a friend*. Two people keep a streak alive by each sharing a verse
every day, with chat, daily-chapter reading, and reminders.

> **Development note:** This project was built over several weeks (≈ May–June 2026).
> It was brought under version control later, so the commit dates here reflect when
> the code was imported into git rather than the day each line was originally written.

## Monorepo layout

| Path | Stack | What it is |
|------|-------|------------|
| `web/` | Next.js (App Router) + TypeScript | The web app — auth, streaks, chat, reader, profile. |
| `web/supabase/` | Postgres / Supabase | Schema, RLS, SQL migrations, and Edge Functions — including both Telegram bots (`telegram-verse`/`telegram-webhook`, `gitsawe-daily`/`gitsawe-webhook`). |
| `mobile/` | Flutter | The native mobile app (same backend). |
| `bible81/` | Node (no deps) | Local EOTC 81-book Bible API and reference parser; source of the bundled Bible text. |
| `gitsawe/` | Node | ግጻዌ lectionary pipeline: month tables → `gitsawe.json` for web, mobile and the bots. |
| `SPEC.md` | — | Original product spec. |

## Bible text

The Bible text comes from [EOTCOpenSource/80-weahadu](https://github.com/EOTCOpenSource/80-weahadu)
and is licensed **CC BY-NC-ND 4.0** (`bible81/LICENSE-DATA`), so it is not
committed here. The same goes for the ስንክሳር text (`sinksar/`) and the
lectionary PDFs (`gitsawe/pdfs/`). To build locally, put the upstream data in
`bible81/data/` (pinned commit: `bible81/data/SOURCE-COMMIT.txt`), then run
`node web/scripts/build-bible.mjs` to generate `web/public/bible/` and copy
it to `mobile/assets/bible/` (the two must be identical).

## How it works

- **Auth & profiles** via Supabase Auth.
- **Friendships** (request / accept) connect two readers.
- **Streaks** — both friends must share a verse each day to keep the streak;
  the streak day rolls over at **midnight (Africa/Addis_Ababa)** with an 11:00
  grace deadline, tracked entirely in Postgres functions (`register_verse_share`,
  `expire_streaks`) driven by a trigger on new messages.
- **Chat & verse sharing** — verse, text, and image messages between friends.
- **Daily chapter / verse** generated and cached server-side.
- **Reminders & push** via Supabase edge functions + `pg_cron`.

## Local setup

Each sub-project has its own README and a `.env.local.example`. In short:

```bash
# Bible API (needs bible81/data — see "Bible text")
cd bible81 && npm start

# web app
cd web && npm install && cp .env.local.example .env.local   # fill in Supabase keys
npm run dev

# mobile
cd mobile && flutter pub get && flutter run
```

Secrets (`.env.local`, service-role keys, `google-services.json`, signing keys)
are intentionally **not** committed — see `.gitignore`.
