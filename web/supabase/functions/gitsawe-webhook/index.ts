// @wenngel_bot webhook: subscribes/unsubscribes people who message the bot.
//
// Deploy:  supabase functions deploy gitsawe-webhook --no-verify-jwt
// Secrets: GITSAWE_BOT_TOKEN, GITSAWE_WEBHOOK_SECRET, CRON_SECRET
//
// Register it with Telegram by calling this function itself:
//   curl -X POST .../functions/v1/gitsawe-webhook \
//        -H "Authorization: Bearer $CRON_SECRET" \
//        -H "Content-Type: application/json" -d '{"action":"register"}'
//
// Registering from the inside is the whole point: the secret Telegram sends
// and the secret this function checks come from the same env var, so they
// cannot drift. Doing it by hand — rotating GITSAWE_WEBHOOK_SECRET without
// re-running setWebhook — silently 401s every update, which looks exactly
// like a dead bot: the daily broadcast keeps working (it never touches this
// function) while /start, /today and /stop do nothing for anyone.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { todaysGitsawe } from "../_shared/gitsawe.ts";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function reply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

/**
 * Point Telegram at this function, with the secret this function checks.
 *
 * The URL is built from SUPABASE_URL rather than taken from the request, so
 * the worst a leaked CRON_SECRET can do here is re-register the correct
 * webhook — it cannot redirect the bot at someone else's server.
 */
async function registerWebhook(token: string, secret: string | undefined): Promise<Response> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gitsawe-webhook`;
  const set = await (await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(secret ? { url, secret_token: secret } : { url }),
  })).json();
  // getWebhookInfo never echoes secret_token, so this is safe to hand back.
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
  return new Response(JSON.stringify({ setWebhook: set, info: info?.result ?? info }, null, 2), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const token = Deno.env.get("GITSAWE_BOT_TOKEN")!;
  const secret = Deno.env.get("GITSAWE_WEBHOOK_SECRET");
  const update = await req.json().catch(() => ({}));

  // Admin: register this URL with Telegram. Authorized with CRON_SECRET, the
  // same shared secret the daily cron already uses.
  const cron = Deno.env.get("CRON_SECRET");
  if (cron && req.headers.get("authorization") === `Bearer ${cron}` &&
      update?.action === "register") {
    return await registerWebhook(token, secret);
  }

  // Telegram sends this header when the webhook is registered with a secret.
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const msg = update.message ?? update.channel_post;
    if (!msg?.chat) return new Response("ok");

    const chat = msg.chat;
    // Be forgiving about how the command arrives. Phone keyboards capitalise
    // ("Today"), autocorrect eats the slash, tapping can insert a space
    // ("/ today"), and in groups Telegram appends the bot's name
    // ("/today@wenngel_bot"). Reduce all of those to a bare word.
    const cmd = (msg.text ?? "")
      .trim()
      .toLowerCase()
      .replace(/^\/+\s*/, "")     // leading slash(es) and any space after
      .replace(/@[\w_]+$/, "")     // @botname suffix
      .trim();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (cmd === "stop" || cmd === "unsubscribe" || cmd === "አቁም") {
      await supabase.from("gitsawe_subscribers")
        .update({ active: false }).eq("chat_id", chat.id);
      await reply(token, chat.id,
        "ተቋርጧል 🙏 የዕለቱን ወንጌል እንደገና ለመቀበል /start ይላኩ።");
      return new Response("ok");
    }

    if (cmd === "today" || cmd === "zare" || cmd === "ዛሬ") {
      const g = await todaysGitsawe();
      if (!g?.gospel) {
        await reply(token, chat.id, "ለዛሬ ወንጌል አልተገኘም።");
      } else {
        // Fold lost verse boundaries ("empty verses") into the verse that
        // carries their text — same as gitsawe-daily's numbered().
        const rows: { start: number; end: number; t: string }[] = [];
        let start: number | null = null;
        for (const v of g.gospel.verses) {
          if (start == null) start = v.n;
          if (!v.t.trim()) {
            const last = rows[rows.length - 1];
            if (last && start === v.n) { last.end = v.n; start = null; }
          } else {
            rows.push({ start, end: v.n, t: v.t });
            start = null;
          }
        }
        const body = rows
          .map((r) => `<b>${r.start === r.end ? r.start : `${r.start}-${r.end}`}</b> ${esc(r.t)}`)
          .join("\n");
        await reply(token, chat.id,
          `📖 <b>${esc(g.gospel.label)}</b>\n<i>${esc(g.dateLabel)}</i>\n\n${body}`);
      }
      return new Response("ok");
    }

    // Anything else (including /start) subscribes.
    await supabase.from("gitsawe_subscribers").upsert({
      chat_id: chat.id,
      username: chat.username ?? null,
      first_name: chat.first_name ?? null,
      active: true,
    }, { onConflict: "chat_id" });

    await reply(token, chat.id,
      "እንኳን ደህና መጡ! 🕊\n\nየየዕለቱን <b>ወንጌል</b> በየቀኑ ጠዋት ይደርስዎታል — " +
      "እንደ ቤተ ክርስቲያናችን ግጻዌ።\n\n" +
      "/today — የዛሬውን አሁን ለማየት\n/stop — ለማቋረጥ");
    return new Response("ok");
  } catch (e) {
    // Always 200: a non-2xx makes Telegram retry the same update forever.
    return new Response(`error: ${e}`, { status: 200 });
  }
});
