type DeliveryResult =
  | { ok: true; shareButtonOmitted: boolean }
  | { ok: false; code: number; description: string };

/** Retry explicit rate limits; never blindly retry an ambiguous network send. */
export async function sendVerseMessage(
  token: string,
  chatId: number,
  text: string,
  replyMarkup: unknown,
): Promise<DeliveryResult> {
  let markup = replyMarkup;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          chat_id: chatId, text, parse_mode: "HTML",
          disable_web_page_preview: true, reply_markup: markup,
        }),
      });
      const result = await response.json();
      if (response.ok && result.ok) return { ok: true, shareButtonOmitted: markup !== replyMarkup };
      const code = result.error_code ?? response.status;
      const description = String(result.description ?? "Telegram rejected the message");
      // A rejected optional share button must not suppress the verse itself.
      if (code === 400 && markup && /reply markup|button|BUTTON_URL/i.test(description)) {
        markup = undefined;
        continue;
      }
      const delay = Number(result.parameters?.retry_after);
      if (code === 429 && delay > 0 && delay <= 10 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        continue;
      }
      return { ok: false, code, description };
    } catch {
      return { ok: false, code: 0, description: "Telegram request failed or timed out; delivery unknown" };
    }
  }
  return { ok: false, code: 400, description: "Telegram rejected the message after retry" };
}
