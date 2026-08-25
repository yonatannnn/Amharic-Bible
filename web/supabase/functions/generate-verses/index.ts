// Generate AI-curated verses and add them to the Telegram queue (source='ai').
//
// Deploy:  supabase functions deploy generate-verses --no-verify-jwt
// Secrets: GEMINI_API_KEY, CRON_SECRET (and the usual SUPABASE_* are injected)
//
// Body: { "count": <int, default 5> }
// Auth: cron secret OR a signed-in admin's JWT.

import { serviceClient, authorize, tryRef, recentRefs, logVerseUse } from "../_shared/auth.ts";
import { generateVerseRefs } from "../_shared/gemini.ts";

Deno.serve(async (req) => {
  const supabase = serviceClient();
  if (!(await authorize(req, supabase))) return new Response("unauthorized", { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const count = Math.min(Math.max(Number(body.count) || 5, 1), 15);

    // Everything used recently (sent or still queued) — fed to Gemini as a
    // "don't repeat" list, and re-checked here in case the model ignores it.
    const exclude = await recentRefs(supabase);
    const excludeKeys = new Set(exclude.map((r) => `${r.book}:${r.chapter}:${r.verse}`));

    const refs = await generateVerseRefs(count, exclude);
    // Keep only fresh refs that actually resolve to text, and return previews.
    const added: { book: number; chapter: number; verse: number; ref: string; text: string }[] = [];
    for (const r of refs) {
      const key = `${r.book}:${r.chapter}:${r.verse}`;
      if (excludeKeys.has(key)) continue;
      excludeKeys.add(key); // also de-dupe within this batch
      const v = await tryRef(r.book, r.chapter, r.verse);
      if (v) added.push({ ...r, ref: v.ref, text: v.text });
    }
    if (added.length === 0) return new Response(JSON.stringify({ added: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

    await supabase.from("telegram_queue").insert(
      added.map((a) => ({ book: a.book, chapter: a.chapter, verse: a.verse, source: "ai" })),
    );
    // Remember them immediately so the next generation won't repeat them.
    await logVerseUse(supabase, added.map((a) => ({ book: a.book, chapter: a.chapter, verse: a.verse })), "ai");

    return new Response(JSON.stringify({ added }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 200 });
  }
});
