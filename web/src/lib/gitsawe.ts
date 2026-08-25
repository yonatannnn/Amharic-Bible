/**
 * ግጻዌ — the EOTC daily lectionary, plus the day's ስንክሳር commemorations.
 *
 * Data is bundled in /public/gitsawe/gitsawe.json, keyed by ETHIOPIAN
 * month-day (the church's own reckoning, so it is stable year to year).
 * Regenerate with `node gitsawe/parse.mjs`.
 *
 * Verse text is not stored here — only references, resolved against the
 * bundled Bible at read time so there is one copy of the text.
 */
import { getChapter, type Chapter } from "@/lib/bible";
import { BOOK_IDS, BOOK_NAMES } from "@/lib/bibleCanon";
import { todayInAddis, ethiopianLabel, type EthiopianDate } from "@/lib/ethiopic";
import GITSAWE_DATA from "../../public/gitsawe/gitsawe.json";

export type Ref = {
  book: string;          // canon id, e.g. "JHN"
  chapter: number;
  start?: number;
  end?: number;
  toEnd?: boolean;
  list?: number[];
  raw: string;
};

export type QidaseSlot = "pauline" | "catholic" | "acts" | "misbak" | "gospel" | "other";

export type GitsaweDay = {
  ethiopian: { month: number; day: number };
  ethiopianMonthName: string;
  anaphora: number | null;
  morning: Ref[];
  qidase: Record<QidaseSlot, Ref[]>;
  evening: Ref[];
  sinksar: { i: number; title: string }[];
};

/** A reference with its Amharic book name and (optionally) its text. */
export type ResolvedRef = {
  ref: Ref;
  bookNum: number;
  bookName: string;
  label: string;         // "ዮሐንስ 15:12-17"
  chapterLabel: string;  // "ምዕራፍ 15:12-27"
  text?: string;
  verses?: { n: number; t: string }[];
};

export const SLOT_LABELS: Record<QidaseSlot, string> = {
  pauline: "ጳውሎስ",
  catholic: "ተከታታይ",
  acts: "ሐዋርያት ሥራ",
  misbak: "ምስባክ",
  gospel: "ወንጌል",
  other: "ተጨማሪ",
};

// Imported, not read from disk and not fetched.
//
// `public/` is served by the CDN but is NOT traced into the serverless bundle,
// so reading it with fs works under `next start` and silently fails on Vercel —
// which is exactly how this card disappeared in production. Fetching our own
// origin would work but adds a network hop to every render. An import is
// resolved at build time and is correct in both places.
//
// Safe for bundle size: this module is only ever imported by server code, and
// GitsaweCard takes its types with `import type`, which is erased.

const days = (GITSAWE_DATA as unknown as { days: Record<string, GitsaweDay> }).days;

const key = (e: { month: number; day: number }) =>
  `${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`;

/** Canon id -> the app's 1-based book number. */
const numFor = (id: string) => BOOK_IDS.indexOf(id) + 1;

function labelFor(ref: Ref, bookName: string, verses?: { n: number }[]) {
  const head = `${bookName} ${ref.chapter}`;
  if (ref.list?.length) return `${head}:${ref.list.join(",")}`;
  if (ref.toEnd) {
    const last = verses?.[verses.length - 1]?.n;
    return `${head}:${ref.start}${last && last !== ref.start ? `-${last}` : ""}`;
  }
  if (ref.start == null) return head;
  return `${head}:${ref.start}${ref.end && ref.end !== ref.start ? `-${ref.end}` : ""}`;
}

/** Slice the verses a reference points at, out of its chapter. */
function sliceVerses(ref: Ref, chapter: Chapter) {
  const all = chapter.verses.map((t, i) => ({ n: i + 1, t }));
  if (ref.list?.length) {
    const want = new Set(ref.list);
    return all.filter((v) => want.has(v.n));
  }
  if (ref.start == null) return all;
  const hi = ref.toEnd ? Infinity : (ref.end ?? ref.start);
  return all.filter((v) => v.n >= ref.start! && v.n <= hi);
}

/** Resolve one reference. `withText` also pulls the verse text. */
export async function resolveRef(ref: Ref, withText = false): Promise<ResolvedRef | null> {
  const bookNum = numFor(ref.book);
  if (bookNum < 1) return null;
  const bookName = BOOK_NAMES[bookNum - 1] ?? ref.book;
  // The chapter is loaded even when the text is not wanted: a reference that
  // runs to the end of its chapter ("Act 2:13-f") can only be labelled with a
  // closing verse number once the chapter length is known. Books are cached,
  // so this costs one read per book per request at most.
  try {
    const chapter = await getChapter(bookNum, ref.chapter);
    const verses = sliceVerses(ref, chapter);
    if (!verses.length) {
      return { ref, bookNum, bookName, label: labelFor(ref, bookName),
               chapterLabel: `ምዕራፍ ${ref.chapter}` };
    }
    const label = labelFor(ref, bookName, verses);
    const first = verses[0].n, last = verses[verses.length - 1].n;
    const chapterLabel = `ምዕራፍ ${ref.chapter}:${first}${last !== first ? `-${last}` : ""}`;
    return withText
      ? { ref, bookNum, bookName, label, chapterLabel, verses, text: verses.map((v) => v.t).join(" ") }
      : { ref, bookNum, bookName, label, chapterLabel };
  } catch {
    return { ref, bookNum, bookName, label: labelFor(ref, bookName),
             chapterLabel: `ምዕራፍ ${ref.chapter}` };
  }
}

export type TodaysGitsawe = {
  date: EthiopianDate;
  dateLabel: string;
  anaphora: number | null;
  gospel: ResolvedRef | null;
  qidase: { slot: QidaseSlot; label: string; refs: ResolvedRef[] }[];
  morning: ResolvedRef[];
  evening: ResolvedRef[];
  sinksar: { i: number; title: string }[];
};

/** Reading order on the card: the Gospel leads, then the rest of the Qidase.
 *  Matches mobile/lib/services/gitsawe.dart. */
const SLOT_ORDER: QidaseSlot[] = ["gospel", "pauline", "catholic", "acts", "misbak", "other"];

/** Everything the home card needs for today. */
export async function getTodaysGitsawe(when?: EthiopianDate): Promise<TodaysGitsawe | null> {
  const date = when ?? todayInAddis();
  const day = days[key(date)];
  if (!day) return null;

  // Every reading carries its text, as on the mobile card.
  const qidase = [];
  for (const slot of SLOT_ORDER) {
    const refs = day.qidase[slot] ?? [];
    if (!refs.length) continue;
    const resolved = (await Promise.all(refs.map((r) => resolveRef(r, true)))).filter(
      (r): r is ResolvedRef => r !== null,
    );
    if (resolved.length) qidase.push({ slot, label: SLOT_LABELS[slot], refs: resolved });
  }
  const gospel = qidase.find((q) => q.slot === "gospel")?.refs[0] ?? null;

  const shallow = async (refs: Ref[]) =>
    (await Promise.all(refs.map((r) => resolveRef(r, true)))).filter(
      (r): r is ResolvedRef => r !== null,
    );

  return {
    date,
    dateLabel: ethiopianLabel(date),
    anaphora: day.anaphora,
    gospel,
    qidase,
    morning: await shallow(day.morning),
    evening: await shallow(day.evening),
    sinksar: day.sinksar ?? [],
  };
}
