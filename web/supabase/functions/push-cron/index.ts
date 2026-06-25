// Supabase Edge Function: scheduled pushes.
//   body {"task":"streak"} → remind people whose streak window is closing
//   body {"task":"verse"}  → "verse of the day" nudge to everyone with a token
//
// Deploy:  supabase functions deploy push-cron --no-verify-jwt
// Secrets: FIREBASE_SERVICE_ACCOUNT (same as notify), CRON_SECRET (any string)
// Schedule with pg_cron (see migration_streak_reminder.sql).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ServiceAccount { project_id: string; client_email: string; private_key: string; }

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  return (await res.json()).access_token;
}

const BIBLE_API = "https://faithful-marni-anatoli-b7663357.koyeb.app";
const FALLBACK_REFS = [
  { book: 43, chapter: 3, verse: 16 },
  { book: 19, chapter: 23, verse: 1 },
  { book: 40, chapter: 11, verse: 28 },
];

async function tryRef(book: number, chapter: number, verse: number): Promise<{ ref: string; text: string } | null> {
  try {
    const res = await fetch(`${BIBLE_API}/book/${book}`);
    const b = await res.json();
    const text = b.chapters?.[chapter - 1]?.verses?.[verse - 1];
    if (text) return { ref: `${b.title ?? "Book " + book} ${chapter}:${verse}`, text };
  } catch (_) { /* ignore */ }
  return null;
}

// Resolve today's verse (same 12h rotation the app uses); an admin override wins.
async function resolveDailyVerse(supabase: ReturnType<typeof createClient>): Promise<{ ref: string; text: string } | null> {
  const windowIndex = Math.floor(Date.now() / (12 * 3600 * 1000));

  const { data: ov } = await supabase
    .from("daily_verse_override")
    .select("book, chapter, verse, window_index")
    .maybeSingle();
  if (ov && ov.window_index === windowIndex) {
    const v = await tryRef(ov.book, ov.chapter, ov.verse);
    if (v) return v;
  }

  const addis = new Date(Date.now() + 3 * 3600 * 1000);
  const date = addis.toISOString().slice(0, 10);
  const { data: row } = await supabase.from("daily_verse_pool").select("refs").eq("date", date).maybeSingle();
  const refs = (row?.refs && Array.isArray(row.refs) && row.refs.length > 0) ? row.refs : FALLBACK_REFS;
  for (let offset = 0; offset < refs.length; offset++) {
    const pick = refs[(windowIndex + offset) % refs.length];
    const v = await tryRef(pick.book, pick.chapter, pick.verse);
    if (v) return v;
  }
  return null;
}

async function send(sa: ServiceAccount, accessToken: string, token: string, title: string, body: string, data: Record<string, string>) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { token, notification: { title, body }, data, android: { priority: "high", notification: { channel_id: "messages" } } },
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  // Simple shared-secret guard.
  const secret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  try {
    const { task } = await req.json().catch(() => ({ task: "verse" }));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!) as ServiceAccount;
    const accessToken = await getAccessToken(sa);
    let sent = 0;

    if (task === "streak") {
      const { data: targets } = await supabase.rpc("streak_reminder_targets");
      for (const t of targets ?? []) {
        const { data: tokens } = await supabase.from("device_tokens").select("token").eq("user_id", t.user_id);
        for (const tk of tokens ?? []) {
          if (await send(sa, accessToken, tk.token,
            `🔥 Your ${t.streak_count}-day streak with ${t.friend_name} ends in 1 hour`,
            "Send a verse now to keep it alive!",
            { type: "streak" })) sent++;
        }
      }
    } else {
      const verse = await resolveDailyVerse(supabase);
      const title = verse ? `🌅 ${verse.ref}` : "🌅 የዕለቱ ቃል · Verse of the day";
      const body = verse ? verse.text : "Open መጽሐፍ ቅዱስ for today's verse.";
      const { data: tokens } = await supabase.from("device_tokens").select("token");
      for (const tk of tokens ?? []) {
        if (await send(sa, accessToken, tk.token, title, body, { type: "verse-of-day" })) sent++;
      }
    }
    return new Response(JSON.stringify({ task, sent }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 200 });
  }
});
