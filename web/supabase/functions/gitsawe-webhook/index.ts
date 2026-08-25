// @wenngel_bot webhook: subscribes/unsubscribes people who message the bot.
//
// Deploy:  supabase functions deploy gitsawe-webhook --no-verify-jwt
// Secrets: GITSAWE_BOT_TOKEN, GITSAWE_WEBHOOK_SECRET
// Then register the webhook — see supabase/migration_gitsawe_bot.sql.

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

Deno.serve(async (req) => {
  // Telegram sends this header when the webhook is registered with a secret.
  const secret = Deno.env.get("GITSAWE_WEBHOOK_SECRET");
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const update = await req.json();
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
    const token = Deno.env.get("GITSAWE_BOT_TOKEN")!;
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
        const body = g.gospel.verses
          .map((v) => `<b>${v.n}</b> ${esc(v.t)}`).join("\n");
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
