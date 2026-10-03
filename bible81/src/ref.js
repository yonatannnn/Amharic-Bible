import { resolveBook } from './canon.js';

// The lectionary PDFs use en/em dashes, Ethiopic colon (፥), spaces inside
// numbers ("8- 13"), and a trailing "f" for "to the end of the chapter".
const DASHES = /[‐-―−]/g;

const clean = (s) =>
  String(s)
    .replace(DASHES, '-')
    .replace(/[፥፡]/g, ':')
    .replace(/[፤;]/g, ';')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The lectionary tables cite Proverbs by Protestant chapter numbers, but the
 * EOTC canon splits that material differently: Proverbs runs to 24 chapters
 * (ch. 24 absorbing the Agur/Lemuel material the LXX places mid-book) and
 * Proverbs 25-29 + 31:10-31 form a separate book, መጽሐፈ ተግሣጽ / Book of
 * Admonition (4MA). Verified against verse counts and chapter openings:
 * Adm 1=Pro 25 (28v), 2=26 (28v), 3=27 (27v), 4=28 (28v), 5=29 (27v),
 * 6=31:10-31 (22v).
 *
 * Proverbs 30 and 31:1-9 have no chapter of their own in this edition, so a
 * citation of Pro 30 is passed through unchanged and will simply not resolve.
 */
const PROVERBS_TO_ADMONITION = { 25: 1, 26: 2, 27: 3, 28: 4, 29: 5, 31: 6 };

function remapCanon(ref) {
  if (ref.book !== 'PRO') return ref;
  const target = PROVERBS_TO_ADMONITION[ref.chapter];
  if (!target) return ref;
  const shifted = { ...ref, book: '4MA', book_slug: 'admonition',
                    book_name_en: 'Book of Admonition', chapter: target,
                    remapped_from: `PRO ${ref.chapter}` };
  // Adm 6 is Proverbs 31:10-31, so its verse numbers are offset by 9.
  if (ref.chapter === 31) {
    if (shifted.start != null) shifted.start = Math.max(1, shifted.start - 9);
    if (shifted.end != null) shifted.end = shifted.end - 9;
    if (shifted.list) shifted.list = shifted.list.map((n) => n - 9).filter((n) => n > 0);
  }
  return shifted;
}

/**
 * Parse one reference such as:
 *   "Gal 4:4-13"  "Ps 77:43,44"  "Act 2:13-f"  "Mrk 2"  "Hos 2,3"  "Jud 1:1-f"
 * Returns an array of refs (a bare "Hos 2, 3" is two whole chapters).
 */
export function parseOne(raw) {
  const s = clean(raw).replace(/[.,;/]+$/, '');
  if (!s) return [];

  // Book name = leading token(s) that are not a bare chapter number.
  const m = s.match(/^((?:[1-4]\s*)?[A-Za-zሀ-፿][A-Za-zሀ-፿.\s]*?)\s*([0-9].*)$/);
  if (!m) return [];
  const [, bookRaw, rest] = m;
  const book = resolveBook(bookRaw);
  if (!book) return [{ error: `unknown book: ${bookRaw.trim()}`, input: raw }];

  const base = { book: book.id, book_slug: book.slug, book_name_en: book.name_en, input: raw.trim() };

  if (!rest.includes(':')) {
    // Whole chapter(s): "2" or "2, 3" or "2-3"
    const out = [];
    for (const part of rest.split(',')) {
      const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        for (let c = +range[1]; c <= +range[2]; c++) out.push({ ...base, chapter: c, whole: true });
      } else {
        const c = parseInt(part, 10);
        if (Number.isFinite(c)) out.push({ ...base, chapter: c, whole: true });
      }
    }
    return out;
  }

  const [chPart, vPart] = rest.split(':');
  const chapter = parseInt(chPart, 10);
  if (!Number.isFinite(chapter)) return [{ error: `bad chapter: ${rest}`, input: raw }];
  const v = vPart.trim();

  // "13-f" / "13-" -> to end of chapter
  const toEnd = /-\s*(f\b|$)/i.test(v);
  const range = v.match(/^(\d+)\s*-\s*(\d+)/);
  if (range) return [{ ...base, chapter, start: +range[1], end: +range[2] }];
  if (toEnd) {
    const start = parseInt(v, 10);
    return [{ ...base, chapter, start: Number.isFinite(start) ? start : 1, toEnd: true }];
  }
  // "43, 44" -> discrete verse list
  const list = v.split(',').map((x) => parseInt(x, 10)).filter(Number.isFinite);
  if (list.length > 1) return [{ ...base, chapter, list }];
  if (list.length === 1) return [{ ...base, chapter, start: list[0], end: list[0] }];
  return [{ ...base, chapter, whole: true }];
}

/** Parse a cell that may hold several references: "Jon 1; Act 18; Luk 9:1-27" */
export function parseRefs(raw) {
  return clean(raw)
    .split(';')
    .flatMap((part) => parseOne(part))
    .map((r) => (r.error ? r : remapCanon(r)));
}
