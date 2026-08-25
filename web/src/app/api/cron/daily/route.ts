import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateVersePool } from "@/lib/dailyVerse";
import { generateDailyChapter } from "@/lib/readingPlan";

// Runs once a day (Vercel Cron) to pre-generate the daily verse pool and the
// daily chapter, so the home page never calls Gemini during a request.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function today(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Addis_Ababa",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 },
    );
  }

  const supabase = createServiceClient();
  const day = today();
  const result: Record<string, string> = {};

  // ---- daily verse pool ----
  try {
    const { data } = await supabase
      .from("daily_verse_pool")
      .select("date")
      .eq("date", day)
      .maybeSingle();
    if (!data) {
      // Exclude refs from recent days so the verse pool keeps rotating.
      const { data: recentPools } = await supabase
        .from("daily_verse_pool")
        .select("refs")
        .order("date", { ascending: false })
        .limit(14);
      const exclude = (recentPools ?? []).flatMap(
        (row) => (row.refs as { book: number; chapter: number; verse: number }[] | null) ?? [],
      );
      const refs = await generateVersePool(exclude);
      await supabase
        .from("daily_verse_pool")
        .upsert({ date: day, refs, theme: "encouragement" }, { onConflict: "date" });
      result.verse = "generated";
    } else {
      result.verse = "exists";
    }
  } catch {
    result.verse = "error";
  }

  // ---- daily chapter ----
  try {
    const { data } = await supabase
      .from("daily_chapter")
      .select("date")
      .eq("date", day)
      .maybeSingle();
    if (!data) {
      const { data: recentRows } = await supabase
        .from("daily_chapter")
        .select("book, chapter")
        .order("date", { ascending: false })
        .limit(20);
      const recent = (recentRows ?? []).map((r) => `${r.book}:${r.chapter}`);
      const pick = await generateDailyChapter(day, recent);
      await supabase
        .from("daily_chapter")
        .upsert(
          { date: day, book: pick.book, chapter: pick.chapter },
          { onConflict: "date" },
        );
      result.chapter = "generated";
    } else {
      result.chapter = "exists";
    }
  } catch {
    result.chapter = "error";
  }

  return NextResponse.json({ ok: true, day, ...result });
}
