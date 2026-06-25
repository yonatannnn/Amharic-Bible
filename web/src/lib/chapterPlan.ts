// Pure, server-free helpers for the consecutive daily-chapter reading plan.
// Imported by BOTH the server module readingPlan.ts and the client component
// SettingsClient.tsx, so it must NOT import any server-only code (next/headers).
// Kept byte-for-byte identical in behaviour to the Flutter app (daily.dart).

export type Pick = { book: number; chapter: number };

/** Chapter counts per book, Protestant order (index 0 = Genesis = book 1). */
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
] as const;

export const TOTAL_CHAPTERS = 1189;

/** 0-based position of a (1-based book, 1-based chapter) in the linear walk. */
export function linearIndex(book: number, chapter: number): number {
  let sum = 0;
  for (let i = 0; i <= book - 2; i++) sum += CHAPTER_COUNTS[i];
  return sum + (chapter - 1);
}

/** Convert a 0-based linear index back to {book, chapter} (both 1-based). */
export function chapterFromIndex(idx: number): Pick {
  let rem = idx;
  for (let i = 0; i < CHAPTER_COUNTS.length; i++) {
    if (rem < CHAPTER_COUNTS[i]) return { book: i + 1, chapter: rem + 1 };
    rem -= CHAPTER_COUNTS[i];
  }
  return { book: 66, chapter: CHAPTER_COUNTS[65] };
}

/** Whole days from `start` to `today` (both YYYY-MM-DD), never negative. */
export function daysBetween(start: string, today: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - s) / 86400000));
}

/** The consecutive-plan chapter for `today`, given the user's start point. */
export function consecutivePick(
  startBook: number,
  startChapter: number,
  startDate: string,
  today: string,
): Pick {
  const book = Math.min(Math.max(1, startBook), 66);
  const chapter = Math.min(Math.max(1, startChapter), CHAPTER_COUNTS[book - 1]);
  const daysElapsed = daysBetween(startDate, today);
  const idx = (linearIndex(book, chapter) + daysElapsed) % TOTAL_CHAPTERS;
  return chapterFromIndex(idx);
}
