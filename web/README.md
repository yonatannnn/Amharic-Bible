# Amharic Bible — Web (Next.js)

The web client for the social Bible-streak app. See the full product spec in
[`../SPEC.md`](../SPEC.md).

## Stack
- **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4**
- **Supabase** — auth, Postgres, realtime, storage
- Bible text from the deployed **NestJS** content API (proxied at `/bible-api/*`)

## Run locally
```bash
npm install
npm run dev          # http://localhost:3000
```
The Bible reader at `/read` works immediately (no account needed). Auth and the
social features need Supabase configured (below).

## Supabase setup (needed for auth/streak/chat)
1. Create a project at https://supabase.com (free tier is fine).
2. **SQL Editor → New query →** paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   (Creates tables, RLS, the streak engine, and realtime.)
3. **Project Settings → API** → copy the **Project URL** and the **anon/publishable key**.
4. Put them in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
5. **(Optional, for Google sign-in)** Authentication → Providers → enable **Google**,
   add an OAuth client, and set the redirect to `http://localhost:3000/auth/callback`.
6. Restart `npm run dev`.

## Project layout
```
src/
├── app/
│   ├── page.tsx          landing
│   ├── read/             public Bible reader
│   └── layout.tsx        fonts + theme
├── components/reader/    BibleReader, SettingsPanel
├── lib/
│   ├── bible.ts          typed client for the content API
│   ├── useSettings.ts    reader prefs (theme/font/size)
│   └── supabase/         browser / server / proxy clients
├── proxy.ts              session refresh + route guard  (Next 16 "proxy", ex-middleware)
└── supabase/schema.sql   database schema (run in Supabase)
```
