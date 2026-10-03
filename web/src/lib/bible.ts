/**
 * Bible text client — reads the static JSON bundled with this app in
 * /public/bible (one file per book, 01–89, plus 00.json = book-name index and
 * manifest.json = canon metadata). Regenerate with scripts/build-bible.mjs.
 *
 * The edition is the EOTC 81-book canon (am-2000). Book numbers 1–66 mean
 * exactly what they always did, so stored references stay valid; the
 * deuterocanonical books are 67–89. Psalms use LXX numbering — see
 * scripts/psalms-mt-to-lxx.sql.
 */
import { BOOK_COUNT, BOOK_IDS } from "@/lib/bibleCanon";

/**
 * Table of contents of the printed am-2000 "ሰማንያ አሐዱ" edition, in the order it
 * is printed. Books the edition does not print (Josippon and the 8 extra NT
 * books) are deliberately absent: the reader shows exactly what the printed
 * Bible shows.
 *
 * Kept identical to `_printOld`/`_printNew` in
 * mobile/lib/services/bible.dart — the two readers must agree.
 */
const PRINT_OLD = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
  "1KI", "2KI", "1CH", "2CH", "JUB", "ENO", "EZR", "NEH", "1ES", "2ES",
  "TOB", "JDT", "EST", "1MA", "2MA", "3MA", "JOB", "PSA", "PRO", "4MA",
  "WIS", "ECC", "SNG", "SIR", "ISA", "JER",
  "1BA", // መጽሐፈ ባሮክ (1 Baruch), supplied from am-1980 — see build-bible.mjs
  "LAM", "LJE", "BAR", // the BAR file is really ተረፈ ባሮክ, see NAME_OVERRIDE
  "EZK", "DAN", "HOS", "AMO", "MIC", "JOL", "OBA", "JON", "NAM", "HAB",
  "ZEP", "HAG", "ZEC", "MAL",
] as const;

const PRINT_NEW = [
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
  "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB",
  "1PE", "2PE", "1JN", "2JN", "3JN", "JAS", "JUD", "REV",
] as const;

/**
 * The dataset's "BAR" file actually holds ተረፈ ባሮክ (Paralipomena of Jeremiah),
 * not 1 Baruch. Label it truthfully.
 */
const NAME_OVERRIDE: Record<string, string> = { BAR: "ተረፈ ባሮክ" };

const numForId = (id: string) => BOOK_IDS.indexOf(id) + 1;

export type BookRef = {
  num: number;          // file number in the bundle — stable, stored in the DB
  name: string;
  testament?: "old" | "new";
};

export type Verse = string;

export type Chapter = {
  chapter: string;
  title: string;
  verses: Verse[];
};

export type Book = {
  title: string;
  abbv: string;
  chapters: Chapter[];
};

const pad = (n: number) => String(n).padStart(2, "0");

// Browser: same-origin relative fetch (CDN-cached statics).
// Server: Node fetch needs an absolute URL, so target this site itself.
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://amharic-bible-eta.vercel.app");
const BASE = typeof window === "undefined" ? `${SITE}/bible` : "/bible";

const bookCache = new Map<number, Book>();
let indexCache: BookRef[] | null = null;

async function get<T>(file: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${file}`, {
        ...(typeof window === "undefined"
          ? { next: { revalidate: 60 * 60 * 24 } }
          : {}),
      });
      if (!res.ok) throw new Error(`bible ${file}: ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`bible ${file} failed`);
}

/**
 * The books the reader offers, in printed order — not every file in the bundle.
 * Numbers stay the file numbers, because those are what the database stores.
 */
export async function getBooks(): Promise<BookRef[]> {
  if (indexCache) return indexCache;
  const idx = await get<Record<string, string>>("00.json");
  const nameFor = (num: number) => (idx[String(num).padStart(2, "0")] ?? "").trim();

  const list: BookRef[] = [];
  for (const [ids, testament] of [
    [PRINT_OLD, "old" as const],
    [PRINT_NEW, "new" as const],
  ] as const) {
    for (const id of ids) {
      const num = numForId(id);
      if (num < 1 || num > BOOK_COUNT) continue;      // edition lacks this book
      const name = NAME_OVERRIDE[id] ?? nameFor(num);
      if (name) list.push({ num, name, testament });
    }
  }
  indexCache = list;
  return indexCache;
}

/** Name for a book number, including books the printed list omits. */
export async function bookName(num: number): Promise<string> {
  const idx = await get<Record<string, string>>("00.json");
  const id = BOOK_IDS[num - 1];
  return NAME_OVERRIDE[id] ?? (idx[String(num).padStart(2, "0")] ?? "").trim();
}

/** A whole book (all chapters + verses). */
export async function getBook(num: number): Promise<Book> {
  const cached = bookCache.get(num);
  if (cached) return cached;
  const book = await get<Book>(`${pad(num)}.json`);
  bookCache.set(num, book);
  return book;
}

/** A single chapter (sliced from the bundled book). */
export async function getChapter(book: number, chapter: number): Promise<Chapter> {
  const b = await getBook(book);
  const ch = b.chapters[chapter - 1];
  if (!ch) throw new Error(`bible: book ${book} has no chapter ${chapter}`);
  return ch;
}

/** Static metadata: book name lookups without a network call after first load. */
export function formatRef(
  bookName: string,
  chapter: number,
  verseStart: number,
  verseEnd?: number,
): string {
  const range =
    verseEnd && verseEnd !== verseStart
      ? `${verseStart}-${verseEnd}`
      : `${verseStart}`;
  return `${bookName} ${chapter}:${range}`;
}
