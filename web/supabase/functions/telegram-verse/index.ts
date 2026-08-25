// Sends a verse to all Telegram subscribers.
//   • Daily cron (body {}) → sends the TOP of the queue, then removes it.
//       If the queue is empty → AI-generates one (backstop) → else rotation.
//   • Admin "send now" (body {id?,book,chapter,verse}) → sends that verse now,
//       and removes it from the queue if an id was given.
//
// Deploy:  supabase functions deploy telegram-verse --no-verify-jwt
// Secrets: TELEGRAM_BOT_TOKEN, CRON_SECRET, GEMINI_API_KEY

import { serviceClient, authorize, tryRef, recentRefs, logVerseUse } from "../_shared/auth.ts";
import { generateVerseRefs } from "../_shared/gemini.ts";

const FALLBACK_REFS = [
  { book: 43, chapter: 3, verse: 16 },
  { book: 19, chapter: 23, verse: 1 },
  { book: 40, chapter: 11, verse: 28 },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Last-resort rotation (same 12h window the app uses), honoring an admin override.
async function resolveDailyVerse(supabase: ReturnType<typeof serviceClient>): Promise<{ ref: string; text: string } | null> {
  const windowIndex = Math.floor(Date.now() / (12 * 3600 * 1000));
  const { data: ov } = await supabase
    .from("daily_verse_override").select("book, chapter, verse, window_index").maybeSingle();
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

// The bot's @username, fetched once per broadcast (used in the footer + share link).
async function getBotUsername(token: string): Promise<string> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    return j?.result?.username ?? "";
  } catch (_) {
    return "";
  }
}

// deno-lint-ignore no-explicit-any
async function sendToSubscribers(
  supabase: ReturnType<typeof serviceClient>,
  token: string,
  message: string,
  replyMarkup: any,
): Promise<number> {
  const { data: subs } = await supabase.from("telegram_subscribers").select("chat_id").eq("active", true);
  let sent = 0;
  for (const s of subs ?? []) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: s.chat_id,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    });
    if (r.ok) {
      sent++;
    } else {
      const j = await r.json().catch(() => ({}));
      if (j?.error_code === 403) {
        await supabase.from("telegram_subscribers").update({ active: false }).eq("chat_id", s.chat_id);
      }
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  const supabase = serviceClient();
  if (!(await authorize(req, supabase))) return new Response("unauthorized", { status: 401 });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  try {
    const body = await req.json().catch(() => ({}));

    let queueId: number | null = null;
    let resolved: { ref: string; text: string } | null = null;
    let usedRef: { book: number; chapter: number; verse: number } | null = null;

    if (body.book && body.chapter && body.verse) {
      // "Send now" a specific verse (admin).
      queueId = body.id ?? null;
      resolved = await tryRef(body.book, body.chapter, body.verse);
      if (resolved) usedRef = { book: body.book, chapter: body.chapter, verse: body.verse };
    } else {
      // Daily: top of the queue (lowest position — whatever the admin arranged).
      const { data: top } = await supabase
        .from("telegram_queue")
        .select("id, book, chapter, verse")
        .order("position", { ascending: true })
        .limit(1).maybeSingle();
      if (top) {
        queueId = top.id;
        resolved = await tryRef(top.book, top.chapter, top.verse);
        if (resolved) usedRef = { book: top.book, chapter: top.chapter, verse: top.verse };
      }
      // Backstop: AI-generate one (avoiding recent verses) so the broadcast never runs dry.
      if (!resolved) {
        try {
          const refs = await generateVerseRefs(1, await recentRefs(supabase));
          if (refs[0]) {
            resolved = await tryRef(refs[0].book, refs[0].chapter, refs[0].verse);
            if (resolved) usedRef = refs[0];
          }
        } catch (_) { /* fall through */ }
      }
      // Last resort: rotation pick.
      if (!resolved) resolved = await resolveDailyVerse(supabase);
    }

    if (!resolved) return new Response("no verse", { status: 200 });

    const username = await getBotUsername(token);
    const botLink = username ? `https://t.me/${username}` : "";

    // Footer credits the bot so forwarded/shared verses always point back to it —
    // a single clickable name (no separate @username).
    const footer = botLink
      ? `\n\n<a href="${botLink}">የዕለቱ ቃል</a>`
      : "";
    const message = `📖 <b>${esc(resolved.ref)}</b>\n\n${esc(resolved.text)}${footer}`;

    // "Share verse" button → Telegram's native share sheet, prefilled with the
    // verse text + a link to the bot, so recipients can join with one tap.
    const shareText = `📖 ${resolved.ref}\n\n${resolved.text}`;
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(botLink || "https://t.me")}` +
      `&text=${encodeURIComponent(shareText)}`;
    const replyMarkup = username
      ? { inline_keyboard: [[{ text: "📤 Share verse", url: shareUrl }]] }
      : undefined;

    const sent = await sendToSubscribers(supabase, token, message, replyMarkup);

    if (queueId) await supabase.from("telegram_queue").delete().eq("id", queueId);
    // Log it so the same verse won't be picked/generated again soon.
    if (usedRef) await logVerseUse(supabase, [usedRef], "telegram");

    return new Response(JSON.stringify({ ref: resolved.ref, sent }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 200 });
  }
});
