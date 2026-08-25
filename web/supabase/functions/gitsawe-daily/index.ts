// Sends today's ወንጌል (from the ግጻዌ lectionary) to every @wenngel_bot subscriber.
//
// Deploy:  supabase functions deploy gitsawe-daily --no-verify-jwt
// Secrets: GITSAWE_BOT_TOKEN, CRON_SECRET
//
// Body {} → today. Body {month, day} → that Ethiopian day (for testing).

import { serviceClient, authorize } from "../_shared/auth.ts";
import { todaysGitsawe, SLOT_LABELS, type Verse } from "../_shared/gitsawe.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Render verses the way the app does: one verse per line, its real number
 * bolded in front of the text. Telegram has no superscript, so bold is the
 * closest marker. A single newline, not a blank line — a blank line between
 * every verse spreads a 16-verse reading over a whole screen.
 */
const numbered = (verses: Verse[]) =>
  verses.map((v) => `<b>${v.n}</b> ${esc(v.t)}`).join("\n");

// Telegram rejects anything over 4096 characters. The Gospel often runs to the
// end of a chapter, so split on sentence boundaries rather than truncating —
// people should get the whole reading, as they would hear it.
const LIMIT = 3900;
function chunk(text: string): string[] {
  if (text.length <= LIMIT) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > LIMIT) {
    // Prefer a verse boundary so a number never gets split from its verse.
    let cut = rest.lastIndexOf("\n", LIMIT);
    if (cut < LIMIT * 0.5) cut = rest.lastIndexOf("።", LIMIT);
    if (cut < LIMIT * 0.5) cut = rest.lastIndexOf(" ", LIMIT);
    if (cut < LIMIT * 0.5) cut = LIMIT;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send one message, honouring Telegram's rate limits: roughly 1 message per
 * second to a given chat and ~30/second overall. On a 429 Telegram tells us how
 * long to wait in `retry_after`; obey it and try once more, otherwise a busy
 * broadcast silently drops messages.
 */
async function send(token: string, chatId: number, text: string, replyMarkup?: unknown) {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (r.ok) return r;
    const j = await r.clone().json().catch(() => ({} as Record<string, unknown>));
    const retryAfter = (j as { parameters?: { retry_after?: number } })
      ?.parameters?.retry_after;
    if (r.status === 429 && retryAfter && attempt === 0) {
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    return r;
  }
  return new Response(null, { status: 429 });
}

async function botUsername(token: string): Promise<string> {
  try {
    const j = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
    return j?.result?.username ?? "";
  } catch (_) {
    return "";
  }
}

Deno.serve(async (req) => {
  const supabase = serviceClient();
  if (!(await authorize(req, supabase))) return new Response("unauthorized", { status: 401 });

  const token = Deno.env.get("GITSAWE_BOT_TOKEN")!;
  try {
    const body = await req.json().catch(() => ({}));
    const when = body.month && body.day
      ? { year: 0, month: Number(body.month), day: Number(body.day) }
      : undefined;

    const g = await todaysGitsawe(when);
    if (!g?.gospel) {
      // Six days a year genuinely carry no Gospel in the source tables.
      return new Response(JSON.stringify({ sent: 0, reason: "no gospel for this day" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    const username = await botUsername(token);
    const botLink = username ? `https://t.me/${username}` : "";

    // The other Qidase readings as a compact footer — references only, so the
    // Gospel stays the message.
    const refs = g.others.map((r) => `${SLOT_LABELS[r.slot] ?? r.slot}: ${r.label}`).join("\n");
    const parts = chunk(numbered(g.gospel.verses));

    const header =
      `📖 <b>${esc(g.gospel.label)}</b>\n<i>${esc(g.dateLabel)}</i>\n\n`;
    const footer =
      (refs ? `\n\n<b>የዕለቱ ንባባት</b>\n${esc(refs)}` : "") +
      (g.anaphora != null ? `\n<i>ቅዳሴ · አናፎራ ${g.anaphora}</i>` : "") +
      (botLink ? `\n\n<a href="${botLink}">የዕለቱ ወንጌል</a>` : "");

    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(botLink || "https://t.me")}` +
      `&text=${encodeURIComponent(`📖 ${g.gospel.label}\n\n${g.gospel.text}`.slice(0, 3000))}`;
    const markup = username
      ? { inline_keyboard: [[{ text: "📤 አጋራ", url: shareUrl }]] }
      : undefined;

    const { data: subs } = await supabase
      .from("gitsawe_subscribers").select("chat_id").eq("active", true);

    let sent = 0, dropped = 0;
    for (const s of subs ?? []) {
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const first = i === 0;
        const last = i === parts.length - 1;
        const text = (first ? header : "") + parts[i] + (last ? footer : "");
        const r = await send(token, s.chat_id, text, last ? markup : undefined);
        if (!r.ok) {
          ok = false;
          const j = await r.json().catch(() => ({}));
          // 403 = the user blocked the bot; stop sending to them.
          if (j?.error_code === 403) {
            await supabase.from("gitsawe_subscribers")
              .update({ active: false }).eq("chat_id", s.chat_id);
            dropped++;
          }
          break;
        }
      }
      if (ok) sent++;
      // Stay under the ~30 messages/second ceiling on the bot as a whole.
      await sleep(40);
    }

    return new Response(JSON.stringify({ ref: g.gospel.label, parts: parts.length, sent, dropped }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 200 });
  }
});
