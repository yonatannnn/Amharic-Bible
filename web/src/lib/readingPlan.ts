import { createClient } from "@/lib/supabase/server";
import { getBook } from "@/lib/bible";
import { BOOK_COUNT } from "@/lib/bibleCanon";
import { getCurrentProfile } from "@/lib/profile";
import { generateJSON } from "@/lib/gemini";
import { type Pick, consecutivePick } from "@/lib/chapterPlan";

const ADDIS = "Africa/Addis_Ababa";

export type TodaysReading = {
  book: number;
  chapter: number;
  bookName: string;
  alreadyReadToday: boolean;
  totalRead: number;
  dayNumber: number;
  readingStreak: number;
  date: string;
};

/** Consecutive-day reading streak from a set of read dates (YYYY-MM-DD). */
function computeReadingStreak(dates: Set<string>, todayKey: string): number {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  let cur = new Date(`${todayKey}T12:00:00Z`);
  // if today isn't read yet, the streak can still stand from yesterday
  if (!dates.has(fmt(cur))) cur.setUTCDate(cur.getUTCDate() - 1);
  let streak = 0;
  while (dates.has(fmt(cur))) {
    streak++;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return streak;
}

/** Today's date as YYYY-MM-DD (Ethiopia time — the shared "reading day"). */
function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// New-Testament-weighted, well-loved chapters — used if Gemini is unavailable.
const FALLBACK: Pick[] = [
  { book: 43, chapter: 1 }, // John 1
  { book: 40, chapter: 5 }, // Matthew 5
  { book: 45, chapter: 8 }, // Romans 8
  { book: 46, chapter: 13 }, // 1 Corinthians 13
  { book: 50, chapter: 2 }, // Philippians 2
  { book: 43, chapter: 15 }, // John 15
  { book: 42, chapter: 15 }, // Luke 15
  { book: 44, chapter: 2 }, // Acts 2
  { book: 58, chapter: 11 }, // Hebrews 11
  { book: 59, chapter: 1 }, // James 1
  { book: 49, chapter: 3 }, // Ephesians 3
  { book: 51, chapter: 3 }, // Colossians 3
  { book: 19, chapter: 22 }, // Psalm 23 (LXX 22)
  { book: 23, chapter: 53 }, // Isaiah 53
  { book: 20, chapter: 3 }, // Proverbs 3
];

const CHAPTER_SCHEMA = {
  type: "OBJECT",
  properties: {
    book: { type: "INTEGER" },
    chapter: { type: "INTEGER" },
  },
  required: ["book", "chapter"],
} as const;

async function validate(p: Pick): Promise<Pick | null> {
  if (!Number.isInteger(p.book) || p.book < 1 || p.book > BOOK_COUNT || p.chapter < 1)
    return null;
  try {
    const b = await getBook(p.book);
    const chapter = Math.min(Math.max(1, p.chapter), b.chapters.length);
    return { book: p.book, chapter };
  } catch {
    return null;
  }
}

/** Deterministic, no-AI pick (varies by day, avoids recent when possible). */
function fallbackChapter(dayKey: string, recent: string[]): Pick {
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = 0; i < FALLBACK.length; i++) {
    const p = FALLBACK[(h + i) % FALLBACK.length];
    if (!recent.includes(`${p.book}:${p.chapter}`)) return p;
  }
  return FALLBACK[h % FALLBACK.length];
}

/** Ask Gemini for one varied, NT-favoring chapter (used by the daily cron). */
export async function generateDailyChapter(
  dayKey: string,
  recent: string[],
): Promise<Pick> {
  try {
    const pick = await generateJSON<Pick>(
      `Pick exactly ONE Bible chapter for today's daily reading in an Amharic Bible app.
Rules:
- A meaningful, self-contained chapter to read and reflect on in one sitting.
- STRONGLY favour the New Testament (book numbers 40-66) — about 70% of the time choose
  a chapter from the Gospels (Matthew=40, Mark=41, Luke=42, John=43), Acts (44), or the
  Epistles (45-65). Otherwise pick a well-loved Old Testament chapter (Psalms=19,
  Proverbs=20, Isaiah=23, Genesis=1). Psalms use SEPTUAGINT numbering (one lower
  than the Protestant number for Psalms 10-146).
- Choose from DIFFERENT places across the Bible day to day — do NOT be sequential.
- Do NOT pick any of these recently used chapters: ${recent.join(", ") || "none"}.
Return {"book":<1-89>,"chapter":<int>}.`,
      CHAPTER_SCHEMA,
    );
    const ok = await validate(pick);
    if (ok) return ok;
  } catch {
    /* fall through */
  }
  return fallbackChapter(dayKey, recent);
}

/**
 * READ-ONLY fast path: today's chapter from the DB, or a deterministic fallback
 * if the daily job hasn't run yet. Never calls Gemini during page render.
 */
async function getDailyChapter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dayKey: string,
): Promise<Pick> {
  const { data } = await supabase
    .from("daily_chapter")
    .select("book, chapter")
    .eq("date", dayKey)
    .maybeSingle();
  if (data) return { book: data.book, chapter: data.chapter };
  return fallbackChapter(dayKey, []);
}

/**
 * Today's reading — a single Gemini-chosen chapter shared by everyone, plus this
 * user's progress. No longer sequential.
 */
export async function getTodaysReading(): Promise<TodaysReading | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const date = todayInTz(ADDIS);

  let book: number;
  let chapter: number;

  const { data: plan } = await supabase
    .from("reading_plan")
    .select("mode,start_book,start_chapter,start_date")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (
    plan?.mode === "consecutive" &&
    plan.start_book != null &&
    plan.start_chapter != null &&
    plan.start_date
  ) {
    const pick = consecutivePick(
      plan.start_book,
      plan.start_chapter,
      plan.start_date as string,
      date,
    );
    book = pick.book;
    chapter = pick.chapter;
  } else {
    const pick = await getDailyChapter(supabase, date);
    book = pick.book;
    chapter = pick.chapter;
  }

  const [{ data: todayRow }, { count }, { data: recentDates }] = await Promise.all([
    supabase
      .from("reading_progress")
      .select("book")
      .eq("user_id", profile.id)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("reading_progress")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.id),
    supabase
      .from("reading_progress")
      .select("date")
      .eq("user_id", profile.id)
      .order("date", { ascending: false })
      .limit(400),
  ]);

  const totalRead = count ?? 0;
  const alreadyReadToday = !!todayRow;
  const readDates = new Set((recentDates ?? []).map((r) => r.date as string));
  const readingStreak = computeReadingStreak(readDates, date);

  let bookName = `Book ${book}`;
  try {
    const b = await getBook(book);
    if (b.title) bookName = b.title;
  } catch {
    /* keep fallback */
  }

  return {
    book,
    chapter,
    bookName,
    alreadyReadToday,
    totalRead,
    dayNumber: alreadyReadToday ? totalRead : totalRead + 1,
    readingStreak,
    date,
  };
}
