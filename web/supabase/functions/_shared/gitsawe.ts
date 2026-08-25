// Today's ግጻዌ reading, resolved to Amharic text.
//
// Both the lectionary and the Bible text come from the static JSON the web app
// serves, so the bot, the site and the mobile app all read the same source.

const SITE = Deno.env.get("SITE_URL") ?? "https://amharic-bible-eta.vercel.app";

// The lectionary and the canon map ride with the function rather than being
// fetched from the site: they are small, they change only when the parser is
// re-run, and bundling them means the bot works before the web app ships them.
// Verse TEXT still comes from the site — too large to bundle, and it is the
// same source the web and mobile apps read.
import GITSAWE_DATA from "./gitsawe-data.json" with { type: "json" };
import CANON_DATA from "./canon-data.json" with { type: "json" };

/* ── Ethiopian calendar (mirrors web/src/lib/ethiopic.ts) ─────────────── */

const JD_EPOCH_AMETE_MIHRET = 1723856;

export type EthiopianDate = { year: number; month: number; day: number };

function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
       - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function gregorianToEthiopian(y: number, m: number, d: number): EthiopianDate {
  const jdn = gregorianToJDN(y, m, d);
  const r = (jdn - JD_EPOCH_AMETE_MIHRET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - JD_EPOCH_AMETE_MIHRET) / 1461)
             + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

/** The Addis day (UTC+3), the same boundary the app and the other cron use. */
export function todayInAddis(): EthiopianDate {
  const n = new Date(Date.now() + 3 * 3600 * 1000);
  return gregorianToEthiopian(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

export const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት",
  "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን",
];

const GEEZ_ONES = ["", "፩", "፪", "፫", "፬", "፭", "፮", "፯", "፰", "፱"];
const GEEZ_TENS = ["", "፲", "፳", "፴", "፵", "፶", "፷", "፸", "፹", "፺"];
export const geez = (n: number) =>
  n <= 0 || n >= 100 ? String(n) : GEEZ_TENS[Math.floor(n / 10)] + GEEZ_ONES[n % 10];

export const ethiopianLabel = (e: EthiopianDate) =>
  `${ETHIOPIAN_MONTHS[e.month - 1]} ${geez(e.day)}`;

/* ── the lectionary ───────────────────────────────────────────────────── */

type Ref = {
  book: string; chapter: number;
  start?: number; end?: number; toEnd?: boolean; list?: number[];
};

export type Verse = { n: number; t: string };

export type Reading = {
  slot: string;
  label: string;      // "የዮሐንስ ወንጌል 15:12-27"
  bookNum: number;
  chapter: number;
  /** Verses with their real numbers, so the bot can number them as the app does. */
  verses: Verse[];
  text: string;       // the same verses joined, for share links
};

export const SLOT_LABELS: Record<string, string> = {
  gospel: "ወንጌል", pauline: "ጳውሎስ", catholic: "ተከታታይ",
  acts: "ሐዋርያት ሥራ", misbak: "ምስባክ", other: "ተጨማሪ",
};

const CANON = CANON_DATA as { id: string; num: number; name: string }[];
const NUM_BY_ID = new Map(CANON.map((b) => [b.id, b.num]));
const NAME_BY_NUM = new Map(CANON.map((b) => [b.num, b.name]));

const bookCache = new Map<number, { title: string; chapters: { verses: string[] }[] }>();
async function getBook(num: number) {
  if (bookCache.has(num)) return bookCache.get(num)!;
  const b = await (await fetch(`${SITE}/bible/${String(num).padStart(2, "0")}.json`)).json();
  bookCache.set(num, b);
  return b;
}

async function resolve(ref: Ref, slot: string): Promise<Reading | null> {
  const bookNum = NUM_BY_ID.get(ref.book);
  if (!bookNum) return null;
  let book;
  try { book = await getBook(bookNum); } catch { return null; }
  const ch = book.chapters?.[ref.chapter - 1];
  if (!ch) return null;

  const all: { n: number; t: string }[] =
    ch.verses.map((t: string, i: number) => ({ n: i + 1, t }));
  let picked = all;
  if (ref.list?.length) {
    const want = new Set(ref.list);
    picked = all.filter((v) => want.has(v.n));
  } else if (ref.start != null) {
    const hi = ref.toEnd ? Infinity : (ref.end ?? ref.start);
    picked = all.filter((v) => v.n >= ref.start! && v.n <= hi);
  }
  if (!picked.length) return null;

  const name = NAME_BY_NUM.get(bookNum) ?? ref.book;
  const range = picked.length === 1
    ? `${ref.chapter}:${picked[0].n}`
    : `${ref.chapter}:${picked[0].n}-${picked[picked.length - 1].n}`;
  return {
    slot,
    label: `${name} ${range}`,
    bookNum,
    chapter: ref.chapter,
    verses: picked,
    text: picked.map((v) => v.t).join(" "),
  };
}

export type TodaysGitsawe = {
  date: EthiopianDate;
  dateLabel: string;
  anaphora: number | null;
  gospel: Reading | null;
  others: Reading[];
  sinksar: string[];
};

/** Today's readings, or null if the day is missing from the data. */
export async function todaysGitsawe(when?: EthiopianDate): Promise<TodaysGitsawe | null> {
  const date = when ?? todayInAddis();
  const key = `${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const day = (GITSAWE_DATA as { days: Record<string, unknown> })
    .days?.[key] as Record<string, any> | undefined;
  if (!day) return null;

  const gospelRef = day.qidase?.gospel?.[0];
  const gospel = gospelRef ? await resolve(gospelRef, "gospel") : null;

  const others: Reading[] = [];
  for (const slot of ["pauline", "catholic", "acts", "misbak"]) {
    for (const r of day.qidase?.[slot] ?? []) {
      const got = await resolve(r, slot);
      if (got) others.push(got);
    }
  }

  return {
    date,
    dateLabel: ethiopianLabel(date),
    anaphora: day.anaphora ?? null,
    gospel,
    others,
    sinksar: (day.sinksar ?? []).map((s: { title: string }) => s.title),
  };
}
