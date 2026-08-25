/**
 * Parse the EOTC ግጻዌ month tables (ethiopianorthodox.org monthly PDFs) into
 * one date-keyed JSON file.  Run:  node gitsawe/parse.mjs
 *
 * The tables are fixed-width text once run through `pdftotext -layout`, laid
 * out in six columns:
 *
 *   Day | Morning | Qidase-left | Qidase-right | Ana | Evening
 *
 * Column x-offsets are stable within a file but differ between files, so they
 * are learned per file from the distribution of cell start positions rather
 * than hard-coded.
 *
 * The two Qidase columns do NOT hold fixed slots — some days put Acts at the
 * bottom of the left column, others at the top of the right one. So every
 * reference in the Qidase region is collected and then classified by which
 * BOOK it cites, which is layout-independent.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRefs } from '../bible81/src/ref.js';
import { byId } from '../bible81/src/canon.js';
import { gregorianToEthiopian, ETHIOPIAN_MONTHS } from './ethiopic.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PDFS = join(HERE, 'pdfs');

const MONTHS = ['january','february','march','april','may','june',
                'july','august','september','october','november','december'];

/** Which Qidase slot a reference belongs to, from its book alone. */
function slotFor(bookId) {
  const b = byId.get(bookId);
  if (!b) return 'other';
  if (bookId === 'ACT') return 'acts';
  if (bookId === 'PSA') return 'misbak';
  if (b.section === 'Gospel') return 'gospel';
  if (b.section === 'PaulineEpistle' || bookId === 'HEB') return 'pauline';
  if (b.section === 'GeneralEpistle') return 'catholic';
  return 'other';
}

/** Split one laid-out line into [startColumn, text] cells. */
const cells = (line) =>
  [...line.matchAll(/\S+(?: \S+)*?(?=\s{2,}|$)/g)]
    .map((m) => [m.index, m[0].trim()])
    .filter(([, t]) => t.length);

const HEADER_RE = /^\s*(DAY|Day)\b.*?(MORNING|Morning)/;
const NOISE = /www\.ethiopianorthodox|Readings for the Month|Faith and Order/i;

const DAY_RE = /^(?:[A-Z][a-z]{2}\.?\s*)?(\d{1,2})$/;   // "1" or "Feb 1"
const ETH_RE = /^(\d{1,2})\s*\/\s*(\d{1,2})$/;          // "5/23" = Ethiopian month/day
const ANA_NUM = /^(\d{1,2})$/;                          // bare "4", only in the Ana column
const ANA_LETTER = /^A\s*-?\s*(\d{1,2})$/i;             // "A-4" — self-identifying anywhere

/**
 * Column anchors, inferred from the page's own data.
 *
 * Neither clustering nor the header row is reliable here. Offsets wobble up to
 * 5 characters inside one column while adjacent columns can sit only 5 apart,
 * so no gap threshold separates them; and the header labels are not aligned
 * with the cells beneath them (March prints "Ana" at column 68 over a column of
 * values at 74; October prints "Ana EVENING" 4 apart over columns 5 apart).
 * Several pages carry no header at all.
 *
 * The data identifies the columns unambiguously instead:
 *   evening — where the LAST cell of a row sits, the same on nearly every row
 *   ana     — the only column of bare one/two-digit numbers
 *   morning — the second cell of a row that begins with a day number
 */
function inferAnchors(lines) {
  const mode = (xs) => {
    const f = new Map();
    for (const x of xs) f.set(x, (f.get(x) ?? 0) + 1);
    let best = null;
    for (const [x, n] of f) if (!best || n > best[1] || (n === best[1] && x < best[0])) best = [x, n];
    return best ? best[0] : null;
  };

  const lastXs = [], anaXs = [], mornXs = [];
  for (const line of lines) {
    const cs = cells(line);
    if (cs.length < 2) continue;
    lastXs.push(cs[cs.length - 1][0]);
    for (const [x, t] of cs.slice(1)) if (ANA_NUM.test(t)) anaXs.push(x);
    if (DAY_RE.test(cs[0][1]) && cs[0][0] <= 3) mornXs.push(cs[1][0]);
  }
  const evening = mode(lastXs);
  const morning = mode(mornXs);
  if (evening == null || morning == null) return null;
  // Only trust an Ana column if it recurs and sits clear of the evening column.
  let ana = mode(anaXs);
  if (ana == null || anaXs.filter((x) => Math.abs(x - ana) <= 3).length < 5 ||
      Math.abs(ana - evening) <= 3) ana = null;
  return { morning, ana, evening };
}

/** Parse one page. Returns [days, anchorsUsed]. */
function parsePage(text, inherited) {
  const raw = text.split('\n').filter((l) => l.trim() && !NOISE.test(l));
  const lines = raw.filter((l) => !HEADER_RE.test(l));
  const anchors = inferAnchors(lines) ?? inherited;
  if (!anchors) return [[], null];

  const { morning: mornX, ana: anaX, evening: eveX } = anchors;

  const out = [];
  let cur = null;
  for (const line of lines) {
    const cs = cells(line);
    if (!cs.length) continue;
    const [x0, t0] = cs[0];
    if (x0 < mornX - 3 && DAY_RE.test(t0)) {
      cur = { day: Number(t0.match(DAY_RE)[1]), eth: null,
              morning: [], qidase: [], ana: null, evening: [] };
      out.push(cur);
    }
    if (!cur) continue;
    for (const [x, t] of cs) {
      // "A-4" identifies itself wherever it sits — some months print the
      // anaphora with its letter and never label the column.
      const letter = t.match(ANA_LETTER);
      if (letter) { cur.ana ??= Number(letter[1]); continue; }
      if (x < mornX - 3) {
        const m = t.match(ETH_RE);
        if (m) cur.eth = { month: Number(m[1]), day: Number(m[2]) };
      } else if (anaX != null && Math.abs(x - anaX) <= 3 && ANA_NUM.test(t)) {
        cur.ana ??= Number(t);
      } else if (x >= eveX - 3) {
        cur.evening.push(t);
      } else if (Math.abs(x - mornX) <= 6) {
        cur.morning.push(t);
      } else {
        cur.qidase.push(t);
      }
    }
  }
  return [out, anchors];
}

function parseMonth(monthIndex, file) {
  const pages = Number(
    execFileSync('pdfinfo', [file], { encoding: 'utf8' }).match(/^Pages:\s*(\d+)/m)[1]);
  const days = [];
  let anchors = null;
  for (let p = 1; p <= pages; p++) {
    const text = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), file, '-'],
                              { encoding: 'utf8' });
    const [got, used] = parsePage(text, anchors);
    if (used) anchors = used;
    days.push(...got);
  }
  // A day split across a page break appears twice; merge the fragments.
  const merged = new Map();
  for (const d of days) {
    const prev = merged.get(d.day);
    if (!prev) { merged.set(d.day, d); continue; }
    prev.morning.push(...d.morning);
    prev.qidase.push(...d.qidase);
    prev.evening.push(...d.evening);
    prev.ana ??= d.ana;
    prev.eth ??= d.eth;
  }
  return { monthIndex, days: [...merged.values()].sort((a, b) => a.day - b.day) };
}

/** Resolve raw cell text into structured references. */
function resolve(raw) {
  const out = [];
  for (const cell of raw) {
    for (const r of parseRefs(cell)) {
      if (r.error || !r.book) continue;
      out.push({ ref: `${r.book} ${r.chapter}`, book: r.book, chapter: r.chapter,
                 ...(r.start != null ? { start: r.start } : {}),
                 ...(r.end != null ? { end: r.end } : {}),
                 ...(r.toEnd ? { toEnd: true } : {}),
                 ...(r.list ? { list: r.list } : {}),
                 raw: cell });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Build: re-key by ETHIOPIAN date and fold in the ስንክሳር.
//
//  The PDFs are laid out in Gregorian months, but the lectionary itself is
//  fixed to the Ethiopian day — the Gregorian layout only holds for the year
//  the tables were drawn for. The printed dual dates identify that year as
//  2016 EC (12 Sep 2023 – 11 Sep 2024): all 274 of them match this mapping
//  exactly. Re-keying by Ethiopian date makes the data year-stable and lines it
//  up with the ስንክሳር, which is already keyed that way.
// ---------------------------------------------------------------------------
const REF_YEAR_EC = 2016;
const gregYearFor = (m) => (m >= 9 ? 2023 : 2024);

const files = readdirSync(PDFS).filter((f) => f.endsWith('.pdf'));
const days = {};
let total = 0, withGospel = 0, withAna = 0, refCount = 0, dualChecked = 0, dualBad = 0;

for (const [i, name] of MONTHS.entries()) {
  const file = files.find((f) => f.replace('.pdf', '') === name);
  if (!file) { console.warn(`missing month: ${name}`); continue; }
  const gm = i + 1;
  for (const d of parseMonth(gm, join(PDFS, file)).days) {
    const ec = gregorianToEthiopian(gregYearFor(gm), gm, d.day);
    if (d.eth) {
      dualChecked++;
      if (d.eth.month !== ec.month || d.eth.day !== ec.day) {
        dualBad++;
        console.warn(`dual-date mismatch ${gm}-${d.day}: printed ${d.eth.month}/${d.eth.day}, computed ${ec.month}/${ec.day}`);
      }
    }
    const qidase = { pauline: [], catholic: [], acts: [], misbak: [], gospel: [], other: [] };
    for (const r of resolve(d.qidase)) qidase[slotFor(r.book)].push(r);
    const key = `${String(ec.month).padStart(2, '0')}-${String(ec.day).padStart(2, '0')}`;
    days[key] = {
      ethiopian: { month: ec.month, day: ec.day },
      ethiopianMonthName: ETHIOPIAN_MONTHS[ec.month - 1],
      sourceGregorian: { month: gm, day: d.day },
      anaphora: d.ana,
      morning: resolve(d.morning),
      qidase,
      evening: resolve(d.evening),
      sinksar: [],
    };
    total++;
    if (qidase.gospel.length) withGospel++;
    if (d.ana != null) withAna++;
    refCount += days[key].morning.length + days[key].evening.length +
                Object.values(qidase).reduce((n, a) => n + a.length, 0);
  }
}

// ስንክሳር — commemoration titles for each Ethiopian day. The full text stays in
// sinksar/<month>.json and is loaded on demand; only the headings ride along.
let sinksarDays = 0, sinksarEntries = 0;
for (let m = 1; m <= 13; m++) {
  const path = join(HERE, '..', 'sinksar', `${m}.json`);
  let doc;
  try { doc = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
  for (const day of doc.days) {
    const key = `${String(m).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    const titles = day.entries.map((e, idx) => ({ i: idx, title: e.title }));
    if (days[key]) { days[key].sinksar = titles; sinksarDays++; }
    else days[key] = { ethiopian: { month: m, day: day.day },
                       ethiopianMonthName: ETHIOPIAN_MONTHS[m - 1],
                       anaphora: null, morning: [],
                       qidase: { pauline: [], catholic: [], acts: [], misbak: [], gospel: [], other: [] },
                       evening: [], sinksar: titles };
    sinksarEntries += titles.length;
  }
}

const out = {
  source: {
    lectionary: 'ethiopianorthodox.org monthly ግጻዌ tables, Ethiopian year 2016 EC',
    sinksar: 'sinksar/<ethiopian-month>.json',
  },
  keyedBy: 'ethiopian month-day',
  days,
};
writeFileSync(join(HERE, 'gitsawe.json'), JSON.stringify(out));

console.log(`days with readings: ${total}`);
console.log(`  with a Gospel:    ${withGospel} (${((100 * withGospel) / total).toFixed(1)}%)`);
console.log(`  with an anaphora: ${withAna} (${((100 * withAna) / total).toFixed(1)}%)`);
console.log(`  references:       ${refCount}`);
console.log(`dual dates checked: ${dualChecked}, mismatches: ${dualBad}`);
console.log(`ስንክሳር: ${sinksarDays} days matched, ${sinksarEntries} commemorations`);
console.log(`total days in file: ${Object.keys(days).length}`);

// ---- distribute to both apps ------------------------------------------------
const targets = [
  join(HERE, '..', 'web', 'public'),
  join(HERE, '..', 'mobile', 'assets'),
];
for (const base of targets) {
  try {
    mkdirSync(join(base, 'gitsawe'), { recursive: true });
    writeFileSync(join(base, 'gitsawe', 'gitsawe.json'), JSON.stringify(out));
    // Full ስንክሳር text is only shipped to the web app, which serves it as a
    // static file on demand. The mobile card shows the titles, which already
    // ride inside gitsawe.json, so the APK does not carry 4.3MB it never reads.
    if (base.endsWith('public')) {
      mkdirSync(join(base, 'sinksar'), { recursive: true });
      for (let m = 1; m <= 13; m++) {
        const src = join(HERE, '..', 'sinksar', `${m}.json`);
        try { writeFileSync(join(base, 'sinksar', `${m}.json`), readFileSync(src)); } catch {}
      }
    }
    console.log(`distributed -> ${base}`);
  } catch (e) {
    console.warn(`skipped ${base}: ${e.message}`);
  }
}
