/**
 * Bible text client — reads the static JSON bundled with this app in
 * /public/bible (one file per book, 01–66, plus 00.json = book-name index).
 * The text ships with the deployment; there is no external content API,
 * so no CORS proxy, cold starts, or third-party outages.
 */

export type BookRef = { num: number; name: string };

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

/** All 66 books as { num, name }, from the bundled index (00.json). */
export async function getBooks(): Promise<BookRef[]> {
  if (indexCache) return indexCache;
  const idx = await get<Record<string, string>>("00.json");
  indexCache = Object.entries(idx)
    .map(([k, name]) => ({ num: parseInt(k, 10), name: name.trim() }))
    .filter((b) => Number.isInteger(b.num) && b.num >= 1 && b.num <= 66)
    .sort((a, b) => a.num - b.num);
  return indexCache;
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
