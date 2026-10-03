// Display rows for verse lists. The am-2000 source lost some verse boundaries
// (134 "empty verses" — the text of verse N+1 sits inside verse N), so a bare
// number with no text must never be rendered. A verse with text absorbs the
// empty verses that follow it and is labelled "N-M"; empty verses at the very
// start of a range fold into the first verse with text.
// Mirrors mobile/lib/services/bible.dart (VerseRow / foldNumbered).

export type VerseRow = {
  start: number;
  end: number;
  label: string;
  text: string;
};

export function foldNumbered(verses: { n: number; t: string }[]): VerseRow[] {
  const rows: VerseRow[] = [];
  let start: number | null = null;
  for (const { n, t } of verses) {
    if (start == null) start = n;
    if (!t.trim()) {
      const last = rows[rows.length - 1];
      if (last && start === n) {
        last.end = n;
        last.label = `${last.start}-${n}`;
        start = null;
      }
      // else: leading empty — keep `start` and wait for the next text verse.
    } else {
      rows.push({ start, end: n, label: start === n ? `${n}` : `${start}-${n}`, text: t });
      start = null;
    }
  }
  return rows;
}

export const verseRows = (verses: string[]): VerseRow[] =>
  foldNumbered(verses.map((t, i) => ({ n: i + 1, t })));
