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
import { sendVerseMessage } from "./delivery.ts";

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

// Telegram errors that are about one chat, not the message or the bot: the
// account is gone or the id is no longer reachable by this bot.
const UNREACHABLE_CHAT = /chat not found|user is deactivated|PEER_ID_INVALID|bot was kicked/i;

async function sendToSubscribers(
  supabase: ReturnType<typeof serviceClient>,
  token: string,
  message: string,
  replyMarkup: unknown,
  test: boolean,
) {
  const query = supabase.from("telegram_subscribers").select("chat_id");
  // A test is always confined to the owner's explicitly authorized account.
  const { data: subs, error } = await (test
    ? query.ilike("username", "lijaleme")
    : query.eq("active", true));
  if (error) throw new Error(`Subscriber lookup failed: ${error.message}`);
  if (test && subs?.length !== 1) throw new Error("Expected exactly one @lijaleme subscriber");
  const recipients = subs ?? [];
  let sent = 0;
  let blocked = 0;
  let shareButtonOmitted = 0;
  const failures: { code: number; description: string }[] = [];
  const unreachable: number[] = [];
  for (const s of recipients) {
    const result = await sendVerseMessage(token, s.chat_id, message, replyMarkup);
    if (result.ok) {
      sent++;
      if (result.shareButtonOmitted) shareButtonOmitted++;
    } else if (result.code === 403) {
      blocked++;
      if (!test) {
        const { error } = await supabase.from("telegram_subscribers")
          .update({ active: false }).eq("chat_id", s.chat_id);
        if (error) throw new Error(`Subscriber update failed: ${error.message}`);
      }
    } else {
      failures.push({ code: result.code, description: result.description });
      if (result.code === 400 && UNREACHABLE_CHAT.test(result.description)) unreachable.push(s.chat_id);
      // Invalid credentials affect every recipient; don't repeat a doomed send.
      if (result.code === 401) break;
    }
  }

  // Retire chats Telegram says are gone — otherwise they fail every morning.
  // Only once someone else in this same run received the message: that proves
  // the token and the message are fine, so "chat not found" really is about
  // the chat. (A wrong token for a different bot also says "chat not found",
  // for everyone — trusting it then would unsubscribe the whole list.)
  let deactivated = 0;
  if (!test && sent > 0 && unreachable.length > 0) {
    const { error } = await supabase.from("telegram_subscribers")
      .update({ active: false }).in("chat_id", unreachable);
    if (error) throw new Error(`Subscriber update failed: ${error.message}`);
    deactivated = unreachable.length;
  }
  return { sent, blocked, deactivated, shareButtonOmitted, failed: failures.length, failures };
}

export async function handler(req: Request): Promise<Response> {

  const supabase = serviceClient();
  if (!(await authorize(req, supabase))) return new Response("unauthorized", { status: 401 });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.test !== undefined && typeof body.test !== "boolean") {
      return Response.json({ error: "test must be a boolean" }, { status: 400 });
    }
    if (body.chat_id !== undefined || body.username !== undefined) {
      return Response.json({ error: "Use test: true to send only to @lijaleme" }, { status: 400 });
    }
    const test = body.test === true;

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
      const { data: top, error: queueError } = await supabase
        .from("telegram_queue")
        .select("id, book, chapter, verse")
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .limit(1).maybeSingle();
      if (queueError) throw new Error(`Queue lookup failed: ${queueError.message}`);
      if (top) {
        queueId = top.id;
        resolved = await tryRef(top.book, top.chapter, top.verse);
        if (!resolved) throw new Error(`Queued verse ${top.id} could not be loaded; kept for retry`);
        usedRef = { book: top.book, chapter: top.chapter, verse: top.verse };
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

    if (!resolved) return Response.json({ error: "No verse could be loaded" }, { status: 503 });

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
    // Cap the ENCODED length — Amharic percent-encodes at ~9 bytes/char and
    // Telegram rejects reply markup over a few KB ("reply markup is too long").
    let shareText = `📖 ${resolved.ref}\n\n${resolved.text}`;
    let encodedShare = encodeURIComponent(shareText);
    if (encodedShare.length > 3000) {
      shareText = shareText.slice(0, Math.floor((shareText.length * 3000) / encodedShare.length) - 1) + "…";
      encodedShare = encodeURIComponent(shareText);
    }
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(botLink || "https://t.me")}` +
      `&text=${encodedShare}`;
    const replyMarkup = username
      ? { inline_keyboard: [[{ text: "📤 Share verse", url: shareUrl }]] }
      : undefined;

    const result = await sendToSubscribers(supabase, token, message, replyMarkup, test);
    // A verse that reached anyone is spent. Keeping it queued after a partial
    // delivery would resend it tomorrow to everyone who already has it — and one
    // chat that fails every day would pin it at the top of the queue for good.
    // Only a broadcast that reached nobody stays queued for the next run.
    const delivered = result.sent > 0;
    if (!test && delivered) {
      if (queueId) {
        const { error } = await supabase.from("telegram_queue").delete().eq("id", queueId);
        if (error) throw new Error(`Queue removal failed: ${error.message}`);
      }
      if (usedRef) await logVerseUse(supabase, [usedRef], "telegram");
    }
    const outcome = { ref: resolved.ref, test, ...result };
    console.log(JSON.stringify(outcome));
    // 502 = reached nobody (kept queued). 207 = went out, but some chats missed
    // it; the failures are in the body. 200 = everyone got it.
    const status = !delivered ? 502 : result.failed > 0 ? 207 : 200;
    return Response.json(outcome, { status });
  } catch (e) {
    // Avoid logging fetch exception strings, which can contain bot credentials.
    const error = e instanceof Error ? e.message.replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, "bot[REDACTED]") : "Broadcast failed";
    console.error(error);
    return Response.json({ error }, { status: 500 });
  }
}

