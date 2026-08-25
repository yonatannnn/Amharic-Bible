import { readFileSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './paths.js';

export const canon = JSON.parse(readFileSync(join(DATA_DIR, 'canon.json'), 'utf8'));
export const editions = JSON.parse(readFileSync(join(DATA_DIR, 'editions.json'), 'utf8')).editions;

export const byId = new Map(canon.map((b) => [b.id, b]));

/** Book names in a UI language, keyed by canon id. */
export function names(lang) {
  return JSON.parse(readFileSync(join(DATA_DIR, 'names', `${lang}.json`), 'utf8'));
}

/**
 * Extra abbreviations used by the EOTC ግጻዌ lectionary tables
 * (ethiopianorthodox.org monthly PDFs). These do not follow one standard —
 * `Jhn`/`Jn`, `Mat`/`Mt`, `Act`/`Ac`, `1Cr`/`1Co` all appear, sometimes in the
 * same table — so every observed spelling is listed explicitly.
 */
const LECTIONARY_ALIASES = {
  GEN: ['gen', 'ge'], EXO: ['exo', 'exd', 'ex'], LEV: ['lev', 'lv'],
  NUM: ['num', 'nu'], DEU: ['deu', 'dt', 'deut'], JOS: ['jos', 'jsh'],
  JDG: ['jdg', 'judg'], RUT: ['rut', 'rth'],
  // All four of 1Sa/2Sa/1Kg/2Kg appear, so Kg is Kings, not the Ethiopic
  // numbering where ነገሥት ቀዳማዊ is 1 Samuel.
  '1SA': ['1sa', '1sm'], '2SA': ['2sa', '2sm'],
  '1KI': ['1ki', '1kg', '1kgs', '3kg'], '2KI': ['2ki', '2kg', '2kgs', '4kg'],
  '1CH': ['1ch', '1chr'], '2CH': ['2ch', '2chr'],
  EZR: ['ezr'], NEH: ['neh', 'ne'], EST: ['est', 'esth'],
  JOB: ['job', 'jb'], PSA: ['ps', 'psa', 'psm', 'pss'],
  PRO: ['pro', 'prv', 'prov'], ECC: ['ecc', 'eccl'], SNG: ['sng', 'sos', 'song'],
  ISA: ['isa', 'is'], JER: ['jer', 'jrm'], LAM: ['lam', 'lm'],
  EZK: ['eze', 'ezk', 'ezek'], DAN: ['dan', 'dn'],
  HOS: ['hos', 'ho'], JOL: ['jol', 'joe', 'joel'], AMO: ['amo', 'am'],
  OBA: ['oba', 'ob'], JON: ['jon', 'jnh'], MIC: ['mic', 'mi'],
  // Habakkuk is always spelled out as 'Hab'; a bare 'Hb' means Hebrews.
  NAM: ['nam', 'nah'], HAB: ['hab'], ZEP: ['zep', 'zph'],
  HAG: ['hag', 'hg'], ZEC: ['zec', 'zch'], MAL: ['mal', 'ml'],
  TOB: ['tob', 'tbt'], JDT: ['jdt', 'jth'],
  WIS: ['wis', 'wsd', 'tws'],
  SIR: ['sir', 'ecclus'], BAR: ['bar', 'brk'],
  S3Y: ['aza', 's3y'], SUS: ['sus'], DAG: ['bd', 'dag'],
  '1MA': ['1ma', '1mac', '1mcb'], '2MA': ['2ma', '2mac', '2mcb'],
  '3MA': ['3ma', '3mac', '3mcb'],
  JUB: ['jub', 'kuf'], ENO: ['eno', 'hen'],
  MAT: ['mat', 'mt', 'mtt'], MRK: ['mrk', 'mk', 'mar'],
  LUK: ['luk', 'lk', 'lu'], JHN: ['jhn', 'jn', 'joh'],
  ACT: ['act', 'ac', 'acts'],
  ROM: ['rom', 'rm'], '1CO': ['1cr', '1co', '1cor'], '2CO': ['2cr', '2co', '2cor'],
  GAL: ['gal', 'gl'], EPH: ['eph', 'ep'],
  PHP: ['php', 'phl', 'phi', 'phil', 'pl'],
  COL: ['col', 'cl'], '1TH': ['1th', '1ts', '1thes'], '2TH': ['2th', '2ts', '2thes'],
  '1TI': ['1tm', '1ti', '1tim'], '2TI': ['2tm', '2ti', '2tim'],
  TIT: ['tts', 'tit', 'tt'], PHM: ['plm', 'phm', 'philem'],
  HEB: ['heb', 'hb'], JAS: ['jam', 'jas', 'jm'],
  '1PE': ['1pt', '1pe', '1pet'], '2PE': ['2pt', '2pe', '2pet'],
  '1JN': ['1jn', '1jo'], '2JN': ['2jn', '2jo'], '3JN': ['3jn', '3jo'],
  JUD: ['jud', 'jde', 'jd'], REV: ['rev', 'rv', 'apoc'],
};

/** Lowercase, drop everything that is not a letter or digit. */
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9ሀ-፿]/g, '');

/** alias -> canon id. Built from ids, slugs, English names, and the table above. */
export const aliasIndex = (() => {
  const idx = new Map();
  const put = (alias, id) => {
    const k = norm(alias);
    if (k && !idx.has(k)) idx.set(k, id);
  };
  for (const b of canon) {
    put(b.id, b.id);
    put(b.slug, b.id);
    put(b.name_en, b.id);
    // "1 Samuel" -> "1sam", "Song of Solomon" -> "songofsolomon"
    put(b.name_en.replace(/\s+/g, ''), b.id);
  }
  for (const [id, aliases] of Object.entries(LECTIONARY_ALIASES)) {
    if (!byId.has(id)) continue;
    for (const a of aliases) put(a, id);
  }
  // Amharic + Ge'ez names, so ግጻዌ text in Amharic resolves too.
  for (const lang of ['am', 'gez']) {
    let n;
    try { n = names(lang); } catch { continue; }
    for (const [id, v] of Object.entries(n)) {
      if (!byId.has(id)) continue;
      for (const s of [v?.name, v?.abbrev, v?.short].filter(Boolean)) put(s, id);
    }
  }
  return idx;
})();

/** Resolve a book name/abbreviation to a canon entry, or null. */
export function resolveBook(input) {
  if (!input) return null;
  const k = norm(input);
  const id = aliasIndex.get(k);
  if (id) return byId.get(id);
  // Roman-numeral prefixes: "II Cor" -> "2cor"
  const roman = k.replace(/^iii/, '3').replace(/^ii/, '2').replace(/^i(?=[a-z])/, '1');
  return byId.get(aliasIndex.get(roman)) ?? null;
}
