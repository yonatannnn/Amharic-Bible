import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/// True if the request is the cron (shared secret) or a signed-in admin user.
export async function authorize(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  if (auth.startsWith("Bearer ")) {
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (user) {
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (prof?.is_admin) return true;
    }
  }
  return false;
}

type Ref = { book: number; chapter: number; verse: number };

// Refs that have already gone out recently (verse_history) or are still
// waiting in the Telegram queue — so the AI never re-suggests them.
export async function recentRefs(supabase: SupabaseClient, limit = 200): Promise<Ref[]> {
  const [{ data: hist }, { data: queued }] = await Promise.all([
    supabase.from("verse_history").select("book, chapter, verse").order("used_at", { ascending: false }).limit(limit),
    supabase.from("telegram_queue").select("book, chapter, verse"),
  ]);
  const seen = new Map<string, Ref>();
  for (const r of [...(hist ?? []), ...(queued ?? [])]) {
    seen.set(`${r.book}:${r.chapter}:${r.verse}`, r as Ref);
  }
  return [...seen.values()];
}

// Record refs that have now been used, so they won't repeat.
export async function logVerseUse(supabase: SupabaseClient, refs: Ref[], channel: string): Promise<void> {
  if (refs.length === 0) return;
  await supabase.from("verse_history").insert(refs.map((r) => ({ ...r, channel })));
}

// Resolve a verse reference → { ref, text } from the static Bible JSON
// bundled with the web app (same source of truth as web + mobile).
const BIBLE_STATIC = "https://amharic-bible-eta.vercel.app/bible";
export async function tryRef(book: number, chapter: number, verse: number): Promise<{ ref: string; text: string } | null> {
  try {
    const res = await fetch(`${BIBLE_STATIC}/${String(book).padStart(2, "0")}.json`);
    const b = await res.json();
    const text = b.chapters?.[chapter - 1]?.verses?.[verse - 1];
    if (text) return { ref: `${b.title ?? "Book " + book} ${chapter}:${verse}`, text };
  } catch (_) { /* ignore */ }
  return null;
}
