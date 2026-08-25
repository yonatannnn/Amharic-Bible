/**
 * Regenerates public/bible/ from the bible81 dataset (EOTC 81-book canon,
 * am-2000 edition). Run from web/:  node scripts/build-bible.mjs
 *
 * Book numbers 1-66 stay bound to exactly the books they meant before, so
 * every book number already stored in Supabase keeps pointing at the same
 * book. The rest of the canon is appended from 67 up. Chapter and verse
 * numbers are NOT stable for Psalms — see scripts/psalms-mt-to-lxx.sql.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, '..', 'bible81', 'data');
const EDITION = process.env.EDITION ?? 'am-2000';
const OUT = join(WEB, 'public', 'bible');

/** The historic 1-66 slots. Order is load-bearing: it is what is in the DB. */
const LEGACY_66 = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI',
  '1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER',
  'LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP',
  'HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL',
  'EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE',
  '2PE','1JN','2JN','3JN','JUD','REV',
];

const canon = JSON.parse(readFileSync(join(SRC, 'canon.json'), 'utf8'));
const byId = new Map(canon.map((b) => [b.id, b]));
// Upstream tags Josippon (ዮሴፍ ወልደ ኮርዮን) as "new"; it is a history appendix to
// the Old Testament in Ethiopian editions, not a New Testament book.
if (byId.has('XXA')) byId.set('XXA', { ...byId.get('XXA'), testament: 'old', section: 'History' });
const names = JSON.parse(readFileSync(join(SRC, 'names', 'am.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(SRC, EDITION, 'meta.json'), 'utf8'));
const present = new Set(
  readdirSync(join(SRC, EDITION, 'books')).map((f) => f.replace(/^\d+-/, '').replace(/\.json$/, '')),
);

const has = (id) => {
  const e = byId.get(id);
  return e && present.has(e.file.replace(/^\d+-/, '').replace(/\.json$/, ''));
};

for (const id of LEGACY_66) {
  if (!has(id)) throw new Error(`edition ${EDITION} is missing legacy book ${id} — refusing to renumber`);
}

// 1-66 fixed, then everything else this edition has, in canon order.
const extras = canon.filter((b) => !LEGACY_66.includes(b.id) && has(b.id)).map((b) => b.id);

// Books the printed edition has but the upstream am-2000 data lacks, sourced
// from a sibling edition of the same publisher. Appended AFTER the edition's own
// books so existing numbers never move. 1 Baruch: upstream's am-2000 "BAR" file
// is really ተረፈ ባሮክ (see NAME_OVERRIDE); the genuine መጽሐፈ ባሮክ is taken from am-1980.
const SUPPLEMENTS = [
  { id: '1BA', edition: 'am-1980', file: 'books/45-baruch.json', name: 'መጽሐፈ ባሮክ',
    order: 45, testament: 'deuterocanonical', section: 'Deuterocanonical' },
];
for (const sup of SUPPLEMENTS) {
  try {
    readFileSync(join(SRC, sup.edition, sup.file));
    byId.set(sup.id, sup);
    extras.push(sup.id);
  } catch {
    console.warn(`supplement ${sup.id} (${sup.edition}/${sup.file}) not found — skipped`);
  }
}
const slots = [...LEGACY_66, ...extras];

// A few upstream names carry stray zero-width joiners that break search and
// look like a doubled space in some fonts.
const clean = (s) => String(s).replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '').trim();

// The am-2000 "BAR" file holds ተረፈ ባሮክ (Paralipomena of Jeremiah), not 1 Baruch.
const NAME_OVERRIDE = { BAR: 'ተረፈ ባሮክ' };
const amName = (id) =>
  NAME_OVERRIDE[id] ?? byId.get(id)?.name ?? clean(meta.names?.[id]?.name ?? names[id]?.name ?? byId.get(id).name_en);
const amAbbrev = (id) => clean(meta.names?.[id]?.abbrev ?? names[id]?.abbrev ?? '');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = {};
const manifest = [];
let totalCh = 0, totalV = 0, empty = 0;

slots.forEach((id, i) => {
  const num = i + 1;
  const entry = byId.get(id);
  const src = JSON.parse(readFileSync(join(SRC, entry.edition ?? EDITION, entry.file.startsWith('books/') ? entry.file : join('books', entry.file)), 'utf8'));

  const book = {
    title: amName(id),
    abbv: amAbbrev(id),
    // extra metadata; the legacy shape above is untouched so existing code works
    id, num, order: entry.order, testament: entry.testament, section: entry.section,
    chapters: src.chapters.map((c) => ({
      chapter: String(c.n),
      title: c.headings?.find((h) => h.kind === 'section')?.text ?? '',
      verses: c.verses.map((v) => v.t ?? ''),
    })),
  };

  totalCh += book.chapters.length;
  for (const c of book.chapters) {
    totalV += c.verses.length;
    empty += c.verses.filter((v) => !v.trim()).length;
  }

  writeFileSync(join(OUT, `${String(num).padStart(2, '0')}.json`), JSON.stringify(book));
  index[String(num).padStart(2, '0')] = book.title;
  manifest.push({
    num, id, name: book.title, order: entry.order,
    testament: entry.testament, section: entry.section,
    chapters: book.chapters.map((c) => c.verses.length),
    legacy: num <= 66,
  });
});

writeFileSync(join(OUT, '00.json'), JSON.stringify(index, null, 1));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  edition: EDITION,
  title: meta.title ?? EDITION,
  canon: 'eotc-81',
  psalms: 'lxx',
  books: manifest.length,
  chapters: totalCh,
  verses: totalV,
  generated_from: readFileSync(join(SRC, 'SOURCE-COMMIT.txt'), 'utf8').trim(),
  books_list: manifest,
}, null, 1));

console.log(`${EDITION}: ${manifest.length} books, ${totalCh} chapters, ${totalV} verses (${empty} empty)`);
console.log(`legacy slots 1-66 unchanged; new books ${67}-${manifest.length}: ${extras.join(', ')}`);

// ---- generated TS constants, so app code has one synchronous source of truth ----
const legacy = manifest.filter((b) => b.legacy);
const ts = `// GENERATED by scripts/build-bible.mjs — do not edit by hand.
// Source: ${EDITION} (${manifest.length} books, EOTC 81-book canon, LXX psalm numbering).

/** Chapter counts per book number (index 0 = book 1). */
export const CHAPTER_COUNTS: readonly number[] = [
  ${manifest.map((b) => b.chapters.length).join(', ')},
];

/** Book count in the bundled edition. */
export const BOOK_COUNT = ${manifest.length};

/**
 * Books the consecutive reading plan walks. Held at 66 so the through-the-Bible
 * plan stays the familiar canon; the deuterocanonical books (67-${manifest.length}) are
 * readable and searchable but not auto-scheduled.
 */
export const PLAN_BOOK_COUNT = ${legacy.length};
export const PLAN_TOTAL_CHAPTERS = ${legacy.reduce((n, b) => n + b.chapters.length, 0)};

/** Book number -> canonical id, for joining against bible81 / lectionary data. */
export const BOOK_IDS: readonly string[] = [
  ${manifest.map((b) => `'${b.id}'`).join(', ')},
];

/** Book number -> Amharic name. */
export const BOOK_NAMES: readonly string[] = [
${manifest.map((b) => `  ${JSON.stringify(b.name)},`).join('\n')}
];
`;
writeFileSync(join(WEB, 'src', 'lib', 'bibleCanon.ts'), ts);
console.log(`wrote src/lib/bibleCanon.ts (PLAN_TOTAL_CHAPTERS=${legacy.reduce((n, b) => n + b.chapters.length, 0)})`);

// ---- mirror into the Flutter app so web and mobile can never disagree ----
const MOBILE = join(WEB, '..', 'mobile');
const mobileAssets = join(MOBILE, 'assets', 'bible');
try {
  rmSync(mobileAssets, { recursive: true, force: true });
  mkdirSync(mobileAssets, { recursive: true });
  for (const f of readdirSync(OUT)) {
    writeFileSync(join(mobileAssets, f), readFileSync(join(OUT, f)));
  }
  const dart = `// GENERATED by web/scripts/build-bible.mjs — do not edit by hand.
// Mirrors web/src/lib/bibleCanon.ts. Source: ${EDITION}, EOTC 81-book canon.

/// Chapters per book (index 0 = book 1). Must stay identical to the web app's
/// CHAPTER_COUNTS so the "read in order" plan picks the SAME chapter on both.
const chapterCounts = [
  ${manifest.map((b) => b.chapters.length).join(', ')},
];

/// Books in the bundled edition.
const bookCount = ${manifest.length};

/// Books the consecutive reading plan walks (see bibleCanon.ts).
const planBookCount = ${legacy.length};

/// Sum of chapterCounts over the first [planBookCount] books.
const chapterTotal = ${legacy.reduce((n, b) => n + b.chapters.length, 0)};

/// Book number -> canonical id.
const bookIds = [
  ${manifest.map((b) => `'${b.id}'`).join(', ')},
];
`;
  writeFileSync(join(MOBILE, 'lib', 'services', 'bible_canon.dart'), dart);
  console.log(`mirrored ${readdirSync(OUT).length} files into mobile/assets/bible + lib/services/bible_canon.dart`);
} catch (e) {
  console.warn(`skipped mobile mirror: ${e.message}`);
}
