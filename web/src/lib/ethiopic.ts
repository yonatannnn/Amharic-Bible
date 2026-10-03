/**
 * Ethiopian ⇄ Gregorian conversion (Amete Mihret), via Julian Day Number.
 *
 * 12 months of 30 days plus ጳጉሜን, which has 5 days — 6 when the year number
 * mod 4 is 3. New year (መስከረም 1) therefore lands on 11 or 12 September.
 *
 * Mirrors gitsawe/ethiopic.mjs and mobile/lib/services/ethiopic.dart.
 */
const JD_EPOCH_AMETE_MIHRET = 1723856;

export type EthiopianDate = { year: number; month: number; day: number };

export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
    - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
}

export function jdnToEthiopian(jdn: number): EthiopianDate {
  const r = (jdn - JD_EPOCH_AMETE_MIHRET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year =
    4 * Math.floor((jdn - JD_EPOCH_AMETE_MIHRET) / 1461)
    + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

export const gregorianToEthiopian = (y: number, m: number, d: number): EthiopianDate =>
  jdnToEthiopian(gregorianToJDN(y, m, d));

export const ETHIOPIAN_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት",
  "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን",
] as const;

const GEEZ_ONES = ["", "፩", "፪", "፫", "፬", "፭", "፮", "፯", "፰", "፱"];
const GEEZ_TENS = ["", "፲", "፳", "፴", "፵", "፶", "፷", "፸", "፹", "፺"];

/** Ge'ez numeral for 1–99, used for the day of the month. */
export function geez(n: number): string {
  if (n <= 0 || n >= 100) return String(n);
  return GEEZ_TENS[Math.floor(n / 10)] + GEEZ_ONES[n % 10];
}

/** "ነሐሴ ፲፯" — the day as the church writes it. */
export function ethiopianLabel(e: EthiopianDate): string {
  return `${ETHIOPIAN_MONTHS[e.month - 1]} ${geez(e.day)}`;
}

/** The Addis day (UTC+3), matching the rest of the app's day boundary. */
export function todayInAddis(): EthiopianDate {
  const n = new Date(Date.now() + 3 * 3600_000);
  return gregorianToEthiopian(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}
