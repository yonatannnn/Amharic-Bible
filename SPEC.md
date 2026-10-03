# መጽሐፍ ቅዱስ — Amharic Bible Social Streak App

## Vision
A Bible-reading app whose motivation engine is a **shared daily ritual**: you and a
friend keep a streak alive by **sharing scripture with each other every day**, then
**chat** about it. Snapchat-style streaks — but the currency is the Word.

## Platforms / folders
```
Bible/
├── bible81/             ← EOTC 81-book Bible data + local API (source of truth)
├── gitsawe/             ← ግጻዌ lectionary source PDFs
├── web/                 ← Next.js web app
└── mobile/              ← Flutter app (iOS+Android)
```
Bible text is bundled with each app (web/public/bible, mobile/assets/bible),
generated from `bible81/` by `web/scripts/build-bible.mjs`. There is no content
API to call at runtime.

## Backend
- **Supabase** — Postgres, Auth (Google + email/password), Realtime (chat + streak),
  Storage (avatars, future verse images), Edge Functions (Gemini daily verse, streak cron).
- **Bundled Bible text** — the EOTC 81-book canon (am-2000 edition) ships inside
  both apps as static JSON. Offline, no CORS proxy, no cold starts.
- **Gemini** (server-side, via Supabase Edge Function) — curates the **home-screen
  rotating verse** only. Returns *references*; real Amharic text is fetched from the API
  (never let the LLM write scripture). ~1 call/day, shared globally.

## Core loop
```
 Daily chapter arrives ──► you read it
        │
        ▼
 Pick a verse or range (from today's chapter, or browse anywhere)
        │
        ▼
 Share it with your friend ──► keeps the pair-streak alive 🔥
        │
        ▼
 You both chat about that passage (text → images later)

 (Home also shows a rotating Gemini-picked verse — inspiration only)
```

## Features

### Auth & Profile
- Google + email/password.
- Profile: display name, avatar, timezone, stats (current streak, longest streak,
  restores left, verses shared).

### Friends (v1 = one friend)
- Each user picks a **unique username**.
- Connect flow (primary): **search by username → send friend request → they accept**.
  `friendships.status` = `pending` → `accepted` (or `declined`).
- Connect flow (alternative): **invite link** — share your link → friend taps → request
  auto-created/accepted, no manual search needed.

### The Streak — pair-based, Snapchat-style
- Lives between two friends.
- Advances +1 per **rolling 24-hour** cycle in which **both** have shared ≥1 **verse** message.
- Only `verse` messages count; `text` messages are discussion only.
- ⏳ hourglass warning when the window is running low.
- Breaks if the window expires before both share.
- **Restore: 3 per month** (refills monthly); either friend can restore a broken streak.
- Track **longest** streak forever.

### Chat
- 1:1 realtime chat per friendship (Supabase Realtime).
- Message types: `verse` (ref + range), `text`, `image` (later).
- Verse messages render the Amharic passage inline; tap to open in the reader.

### Daily Chapter
- Optional reading plan, **sequential** through the Bible (Genesis 1 → Revelation 22).
- The day's chapter is the **suggested source** for the verse you share.
- Marking it read = a personal goal, separate from the social streak.

### Verse sharing
- Single verse **or a range** (A–B), from today's chapter or anywhere.
- Stored as a tiny reference `{book, chapter, verseStart, verseEnd}`; text rendered from
  the already-cached chapter (offline-friendly; avoids API range edge cases).
- **Internal** share (to friend → counts for streak) + **external** share
  (WhatsApp/Telegram as text/card).

### Home screen
- Rotating inspirational verse — changes each open / interval (Gemini-curated, display only).
- Today's chapter card.
- Streak status with your friend.
- Quick "share a verse" action.

### Reading settings
- Theme (light/dark), typeface (Noto Sans / Serif Ethiopic), font size, line spacing.
- Daily chapter plan on/off.
- Notification preferences.

### Notifications (FCM mobile / Web Push)
- Streak at risk — "⏳ X hours left — share a verse with {friend}".
- New message / verse shared with you.
- Today's chapter ready.

## Data model (Supabase)
- `profiles(id, username UNIQUE, name, avatar_url, email, timezone, created_at)`
- `friendships(id, requester_id, addressee_id, status, created_at)`  -- status: pending|accepted|declined
- `streaks(friendship_id, count, longest, last_a_share_at, last_b_share_at, window_deadline,
   restores_remaining, restores_reset_at)`
- `messages(id, friendship_id, sender_id, type, book, chapter, verse_start, verse_end,
   text, image_url, created_at, read_at)`
- `daily_verse_pool(date, refs jsonb, theme)`
- `reading_progress(user_id, date, book, chapter, completed_at)`
- `devices(user_id, fcm_token, platform)`

## Proposed build order
1. Scaffold `web/` (Next.js) + `mobile/` (Flutter); create Supabase project, schema, RLS.
2. Auth + profiles on both clients.
3. Bible reader (port the HTML-preview logic) + daily chapter plan.
4. Friends connect + 1:1 realtime chat.
5. Verse sharing into chat + streak engine + restore.
6. Home screen + Gemini daily-verse Edge Function.
7. Notifications.
8. External share + polish.

## Decisions locked
- Backend: **Supabase** (+ existing NestJS for Bible text).
- Auth: **Google + email/password**.
- App type: **chat app**; streak counts **only for verse-shares**; text discussion + images later;
  external share included.
- Streak: **both** friends must share, **rolling 24h** window, **3 restores/month**, one friend in v1.
- Daily chapter: **kept**, sequential, feeds sharing.
- Gemini: **home-screen rotating verse only** (references → real Amharic text).
- Shared verses: **user-chosen**, single or range, from anywhere (usually the daily chapter).
- Friend connection: **username search → friend request → accept** (unique usernames), with **invite link** as an alternative.
