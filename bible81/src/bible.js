import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './paths.js';
import { canon, byId, editions } from './canon.js';

const cache = new Map(); // `${edition}/${bookId}` -> book json

export const editionIds = editions.map((e) => e.id);
export const hasEdition = (id) => existsSync(join(DATA_DIR, id, 'books'));

export function editionMeta(edition) {
  return JSON.parse(readFileSync(join(DATA_DIR, edition, 'meta.json'), 'utf8'));
}

/** Load one book of one edition. Returns null when that edition omits the book. */
export function loadBook(edition, bookId) {
  const key = `${edition}/${bookId}`;
  if (cache.has(key)) return cache.get(key);
  const entry = byId.get(bookId);
  if (!entry) return null;
  const path = join(DATA_DIR, edition, 'books', entry.file);
  const book = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  cache.set(key, book);
  return book;
}

/** Books actually present in an edition, in canon order. */
export function booksIn(edition) {
  return canon
    .filter((b) => existsSync(join(DATA_DIR, edition, 'books', b.file)))
    .map((b) => {
      const book = loadBook(edition, b.id);
      return {
        id: b.id, order: b.order, slug: b.slug, name_en: b.name_en,
        testament: b.testament, section: b.section,
        chapters: book?.chapters.length ?? 0,
      };
    });
}

export function getChapter(edition, bookId, chapterNo) {
  const book = loadBook(edition, bookId);
  if (!book) return null;
  return book.chapters.find((c) => c.n === Number(chapterNo)) ?? null;
}

/**
 * Verses for a resolved reference.
 * `toEnd` means the lectionary's "– f" (continue to the end of the chapter).
 */
export function getVerses(edition, { book, chapter, start, end, toEnd, list }) {
  const ch = getChapter(edition, book, chapter);
  if (!ch) return null;
  let verses = ch.verses;
  if (list?.length) {
    const want = new Set(list);
    verses = verses.filter((v) => want.has(v.n));
  } else if (start != null) {
    const hi = toEnd ? Infinity : (end ?? start);
    verses = verses.filter((v) => v.n >= start && v.n <= hi);
  }
  return { chapter: ch.n, headings: ch.headings ?? [], verses };
}
