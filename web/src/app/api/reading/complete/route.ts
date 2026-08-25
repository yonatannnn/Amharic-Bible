import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTodaysReading } from "@/lib/readingPlan";

/** Marks today's assigned chapter as read (one per day). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const reading = await getTodaysReading();
  if (!reading) return NextResponse.json({ error: "no reading" }, { status: 400 });

  if (!reading.alreadyReadToday) {
    await supabase.from("reading_progress").upsert(
      {
        user_id: user.id,
        date: reading.date,
        book: reading.book,
        chapter: reading.chapter,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );
  }

  return NextResponse.json({ ok: true });
}
