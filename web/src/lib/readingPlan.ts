import { createClient } from "@/lib/supabase/server";
import { getBook } from "@/lib/bible";
import { getCurrentProfile } from "@/lib/profile";
import { generateJSON } from "@/lib/gemini";

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

type Pick = { book: number; chapter: number };

/**
 * Chapter counts per book, Protestant order (index 0 = Genesis = book 1).
 * Shared verbatim with the mobile app — keep behaviour byte-for-byte identical.
 */
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
] as const;

export const TOTAL_CHAPTERS = 1189;

/** 0-based position of a (1-based book, 1-based chapter) in the linear walk. */
export function linearIndex(book: number, chapter: number): number {
  let sum = 0;
  for (let i = 0; i <= book - 2; i++) sum += CHAPTER_COUNTS[i];
  return sum + (chapter - 1);
}

/** Convert a 0-based linear index back to {book, chapter} (both 1-based). */
export function chapterFromIndex(idx: number): Pick {
  let rem = idx;
  for (let i = 0; i < CHAPTER_COUNTS.length; i++) {
    if (rem < CHAPTER_COUNTS[i]) return { book: i + 1, chapter: rem + 1 };
    rem -= CHAPTER_COUNTS[i];
  }
  // idx out of range — clamp to the last chapter.
  return { book: 66, chapter: CHAPTER_COUNTS[65] };
}

/** Whole days from `start` to `today` (both YYYY-MM-DD), never negative. */
export function daysBetween(start: string, today: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - s) / 86400000));
}

/** The consecutive-plan chapter for `today`, given the user's start point. */
export function consecutivePick(
  startBook: number,
  startChapter: number,
  startDate: string,
  today: string,
): Pick {
  const book = Math.min(Math.max(1, startBook), 66);
  const chapter = Math.min(Math.max(1, startChapter), CHAPTER_COUNTS[book - 1]);
  const daysElapsed = daysBetween(startDate, today);
  const idx = (linearIndex(book, chapter) + daysElapsed) % TOTAL_CHAPTERS;
  return chapterFromIndex(idx);
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
  { book: 19, chapter: 23 }, // Psalm 23
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
  if (!Number.isInteger(p.book) || p.book < 1 || p.book > 66 || p.chapter < 1)
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
  Proverbs=20, Isaiah=23, Genesis=1).
- Choose from DIFFERENT places across the Bible day to day — do NOT be sequential.
- Do NOT pick any of these recently used chapters: ${recent.join(", ") || "none"}.
Return {"book":<1-66>,"chapter":<int>}.`,
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
