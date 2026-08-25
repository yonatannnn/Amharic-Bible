import { getBook } from "@/lib/bible";
import { BOOK_COUNT } from "@/lib/bibleCanon";
import { generateJSON } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";

type Ref = { book: number; chapter: number; verse: number };

// Fallback pool used if Gemini is unavailable. Text always comes from the API.
const FALLBACK: Ref[] = [
  { book: 43, chapter: 3, verse: 16 },
  { book: 19, chapter: 22, verse: 1 }, // Psalm 23 (LXX 22)
  { book: 50, chapter: 4, verse: 13 },
  { book: 24, chapter: 29, verse: 11 },
  { book: 20, chapter: 3, verse: 5 },
  { book: 23, chapter: 41, verse: 10 },
  { book: 45, chapter: 8, verse: 28 },
  { book: 6, chapter: 1, verse: 9 },
  { book: 40, chapter: 11, verse: 28 },
  { book: 19, chapter: 45, verse: 1 }, // Psalm 46 (LXX 45)
  { book: 50, chapter: 4, verse: 6 },
  { book: 19, chapter: 120, verse: 1 }, // Psalm 121 (LXX 120)
];

export type DailyVerse = {
  book: number;
  chapter: number;
  verse: number;
  label: string;
  text: string;
};

// Cache Gemini's curated references per day (per server process).
const poolCache = new Map<string, Ref[]>();

const POOL_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      book: { type: "INTEGER" },
      chapter: { type: "INTEGER" },
      verse: { type: "INTEGER" },
    },
    required: ["book", "chapter", "verse"],
  },
} as const;

function validRefs(refs: Ref[]): Ref[] {
  const valid = refs.filter(
    (r) =>
      Number.isInteger(r.book) &&
      r.book >= 1 &&
      r.book <= BOOK_COUNT &&
      r.chapter >= 1 &&
      r.verse >= 1,
  );
  return valid.length >= 5 ? valid : FALLBACK;
}

/** Calls Gemini for a fresh curated pool of references (used by the daily cron).
 *  `exclude` is the set of refs used on recent days, so pools don't repeat. */
export async function generateVersePool(exclude: Ref[] = []): Promise<Ref[]> {
  const excludeLine =
    exclude.length > 0
      ? `\nThese references were used on recent days — do NOT include any of them: ${exclude
          .map((r) => `${r.book}:${r.chapter}:${r.verse}`)
          .join(", ")}.`
      : "";
  try {
    const refs = await generateJSON<Ref[]>(
      `You are curating uplifting daily Bible verses for an Amharic Bible app.
Return 18 well-known, encouraging verse REFERENCES (do NOT write the verse text).
Use these book NUMBERS (Ethiopian Orthodox 81-book canon; 1-66 follow the
familiar order): 1=Genesis … 19=Psalms, 20=Proverbs, 23=Isaiah, 40=Matthew,
43=John, 45=Romans, 50=Philippians … 66=Revelation, then 67=Tobit, 68=Judith,
69=Wisdom, 70=Sirach, 71=Baruch, 80=Enoch.
IMPORTANT: Psalms use SEPTUAGINT numbering, which is one lower than the
Protestant number for Psalms 10-146 (Protestant Psalm 23 is 22 here, 121 is
120, 91 is 90). Give the Septuagint number.
Vary the books — draw from many different books, not just Psalms and John.
Choose verses that are genuinely comforting, hopeful, or faith-building.${excludeLine}
Return a JSON array of objects: {"book":<1-89>,"chapter":<int>,"verse":<int>}.`,
      POOL_SCHEMA,
    );
    const excludeKeys = new Set(
      exclude.map((r) => `${r.book}:${r.chapter}:${r.verse}`),
    );
    const fresh = refs.filter(
      (r) => !excludeKeys.has(`${r.book}:${r.chapter}:${r.verse}`),
    );
    return validRefs(fresh);
  } catch {
    return FALLBACK;
  }
}

/**
 * READ-ONLY fast path used during page render: returns today's pool from the DB,
 * or the curated FALLBACK if the daily job hasn't run yet. Never calls Gemini,
 * so the home page never blocks on an AI request.
 */
async function getPool(dayKey: string): Promise<Ref[]> {
  const cached = poolCache.get(dayKey);
  if (cached) return cached;

  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_verse_pool")
    .select("refs")
    .eq("date", dayKey)
    .maybeSingle();

  const pool = (data?.refs as Ref[] | undefined) ?? FALLBACK;
  if (data?.refs) poolCache.set(dayKey, pool); // only cache real (persisted) pools
  return pool;
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

/** Resolve a single reference to its Amharic text + label, or null. */
async function resolveRef(ref: Ref): Promise<DailyVerse | null> {
  try {
    const book = await getBook(ref.book);
    const chap = book.chapters[ref.chapter - 1];
    if (!chap) return null;
    const idx = Math.min(ref.verse, chap.verses.length) - 1;
    const text = chap.verses[idx];
    if (!text) return null;
    const label = `${book.title || `Book ${ref.book}`} ${ref.chapter}:${ref.verse}`;
    return { book: ref.book, chapter: ref.chapter, verse: ref.verse, label, text };
  } catch {
    return null;
  }
}

/**
 * An inspirational verse that is the SAME for everyone and changes on a fixed
 * 12-hour schedule (00:00, 12:00 UTC = 03:00, 15:00 EAT) — not on every page
 * load. Gemini curates the daily pool of *references*; the Amharic text is
 * always fetched from the content API (never AI-generated). Consecutive windows
 * use consecutive references, so there are no repeats within a day.
 *
 * An admin can override the current window's verse (mirrors the mobile app).
 */
export async function getDailyVerse(date = new Date()): Promise<DailyVerse | null> {
  // same "day" basis as the chapter + cron (Ethiopia time)
  let dayKey: string;
  try {
    dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Addis_Ababa",
    }).format(date);
  } catch {
    dayKey = date.toISOString().slice(0, 10);
  }
  const pool = await getPool(dayKey);
  // Which 12-hour window are we in (globally, deterministic for all users)?
  const windowIndex = Math.floor(date.getTime() / TWELVE_HOURS);

  // An admin may have overridden this exact window's verse.
  try {
    const supabase = await createClient();
    const { data: ov } = await supabase
      .from("daily_verse_override")
      .select("book, chapter, verse, window_index")
      .maybeSingle();
    if (ov && Number(ov.window_index) === windowIndex) {
      const v = await resolveRef({ book: ov.book, chapter: ov.chapter, verse: ov.verse });
      if (v) return v;
    }
  } catch {
    // no override / table absent — fall through to the rotation
  }

  // Pick deterministically from the window; if a ref doesn't resolve in this
  // edition, advance to the next one (still deterministic, still same for all).
  for (let offset = 0; offset < pool.length; offset++) {
    const pick = pool[(windowIndex + offset) % pool.length];
    try {
      const book = await getBook(pick.book);
      const chap = book.chapters[pick.chapter - 1];
      if (!chap) continue;
      const idx = Math.min(pick.verse, chap.verses.length) - 1;
      const text = chap.verses[idx];
      if (!text) continue;
      const label = `${book.title || `Book ${pick.book}`} ${pick.chapter}:${pick.verse}`;
      return { book: pick.book, chapter: pick.chapter, verse: pick.verse, label, text };
    } catch {
      continue;
    }
  }
  return null;
}
