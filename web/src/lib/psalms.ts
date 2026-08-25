/**
 * Masoretic → Septuagint psalm numbering.
 *
 * The bundled edition numbers Psalms the Septuagint way, as the Ethiopian
 * church does. Gemini, trained overwhelmingly on Protestant Bibles, answers in
 * Masoretic numbers however the prompt is worded — so its output is converted
 * here rather than trusted. A deterministic offset beats an instruction the
 * model follows most of the time: a silently wrong psalm is worse than none.
 *
 * The mapping is the one migration_eotc81_renumber.sql applied to stored refs:
 *   LXX 9   = MT 9 + MT 10           LXX 113 = MT 114 + MT 115
 *   LXX n   = MT n-1  (MT 11-113, 117-146)
 *   MT 116  splits into LXX 114 (v1-9)  and LXX 115 (v10-19)
 *   MT 147  splits into LXX 146 (v1-11) and LXX 147 (v12-20)
 *   MT 1-8 and 148-150 are unchanged. LXX 151 has no Masoretic counterpart.
 */
export const PSALMS_BOOK = 19;

export function psalmMtToLxx(chapter: number, verse: number): { chapter: number; verse: number } {
  let ch = chapter, v = verse;
  if (chapter >= 1 && chapter <= 9) { ch = chapter; v = verse; }
  else if (chapter === 10) { ch = 9; v = verse + 20; }
  else if (chapter <= 113) { ch = chapter - 1; }
  else if (chapter === 114) { ch = 113; }
  else if (chapter === 115) { ch = 113; v = verse + 8; }
  else if (chapter === 116) { ch = verse <= 9 ? 114 : 115; v = verse <= 9 ? verse : verse - 9; }
  else if (chapter <= 146) { ch = chapter - 1; }
  else if (chapter === 147) { ch = verse <= 11 ? 146 : 147; v = verse <= 11 ? verse : verse - 11; }
  // 148-150 unchanged.

  // Two Masoretic colophons the Septuagint does not carry as their own verse.
  if (ch === 71 && v > 19) v = 19;
  if (ch === 135 && v > 25) v = 25;
  return { chapter: ch, verse: v };
}

/** Convert a whole reference, leaving every book but Psalms alone. */
export function refMtToLxx<T extends { book: number; chapter: number; verse?: number }>(ref: T): T {
  if (ref.book !== PSALMS_BOOK) return ref;
  const { chapter, verse } = psalmMtToLxx(ref.chapter, ref.verse ?? 1);
  return { ...ref, chapter, ...(ref.verse != null ? { verse } : {}) };
}
