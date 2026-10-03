// Telegram bot webhook: subscribes/unsubscribes users who message the bot,
// and answers /today with the verse the daily broadcast last sent.
//
// Deploy:  supabase functions deploy telegram-webhook --no-verify-jwt
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
// Then register the webhook (one curl — see the deploy notes).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tryRef } from "../_shared/auth.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// deno-lint-ignore no-explicit-any
async function reply(token: string, chatId: number, text: string, replyMarkup?: any) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  });
}

async function getBotUsername(token: string): Promise<string> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    return j?.result?.username ?? "";
  } catch (_) {
    return "";
  }
}

Deno.serve(async (req) => {
  // Telegram sends this header when you register the webhook with a secret.
  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const update = await req.json();
    const msg = update.message ?? update.channel_post;
    if (!msg?.chat) return new Response("ok");

    const chat = msg.chat;
    // "/today@SomeBot" (group chats) → "/today"
    const text = (msg.text ?? "").trim().toLowerCase().replace(/^(\/\w+)@\w+/, "$1");
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (text === "/today") {
      // Resend the verse the daily broadcast last sent (logged by telegram-verse).
      const { data: last } = await supabase
        .from("verse_history").select("book, chapter, verse")
        .eq("channel", "telegram").order("used_at", { ascending: false })
        .limit(1).maybeSingle();
      const v = last ? await tryRef(last.book, last.chapter, last.verse) : null;
      if (!v) {
        await reply(token, chat.id, "Today's verse isn't out yet — check back soon 🙏");
        return new Response("ok");
      }
      const botUser = await getBotUsername(token);
      const botLink = botUser ? `https://t.me/${botUser}` : "";
      const footer = botUser ? `\n\n— <a href="${botLink}">@${botUser}</a> · የዕለቱ ቃል` : "";
      const shareUrl =
        `https://t.me/share/url?url=${encodeURIComponent(botLink || "https://t.me")}` +
        `&text=${encodeURIComponent(`📖 ${v.ref}\n\n${v.text}`)}`;
      const replyMarkup = botUser
        ? { inline_keyboard: [[{ text: "📤 Share verse", url: shareUrl }]] }
        : undefined;
      await reply(token, chat.id, `📖 <b>${esc(v.ref)}</b>\n\n${esc(v.text)}${footer}`, replyMarkup);
    } else if (text === "/stop" || text === "/unsubscribe") {
      await supabase.from("telegram_subscribers").update({ active: false }).eq("chat_id", chat.id);
      await reply(token, chat.id, "Unsubscribed 🙏 Send /start anytime to get the verses again.");
    } else {
      await supabase.from("telegram_subscribers").upsert({
        chat_id: chat.id,
        username: chat.username ?? null,
        first_name: chat.first_name ?? null,
        active: true,
      });

      const botUser = await getBotUsername(token);
      const botLink = botUser ? `https://t.me/${botUser}` : "";
      const footer = botUser ? `\n\n— <a href="${botLink}">@${botUser}</a> · የዕለቱ ቃል` : "";
      const shareUrl =
        `https://t.me/share/url?url=${encodeURIComponent(botLink || "https://t.me")}` +
        `&text=${encodeURIComponent("📖 Get the verse of the day in Amharic, every morning.")}`;
      const replyMarkup = botUser
        ? { inline_keyboard: [[{ text: "📤 Share this bot", url: shareUrl }]] }
        : undefined;

      await reply(token, chat.id,
        "✝️ <b>Welcome to Amharic Verses</b>\nYou'll receive the verse of the day here, refreshed through the day.\n\nSend /today for today's verse, /stop to unsubscribe." + footer,
        replyMarkup);
    }
    return new Response("ok");
  } catch (_) {
    return new Response("ok"); // never 500 back to Telegram
  }
});
