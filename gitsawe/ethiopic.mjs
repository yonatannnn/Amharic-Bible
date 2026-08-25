/**
 * Ethiopian ⇄ Gregorian conversion (Amete Mihret), via Julian Day Number.
 *
 * The Ethiopian year is 12 months of 30 days plus ጳጉሜን, which has 5 days —
 * 6 when the year number mod 4 is 3. New year (መስከረም 1) therefore lands on
 * 11 or 12 September.
 */
const JD_EPOCH_AMETE_MIHRET = 1723856;

export const isEthiopianLeap = (year) => year % 4 === 3;
export const ethiopianMonthDays = (year, month) =>
  month === 13 ? (isEthiopianLeap(year) ? 6 : 5) : 30;

export function ethiopianToJDN(year, month, day) {
  return JD_EPOCH_AMETE_MIHRET + 365 + 365 * (year - 1) + Math.floor(year / 4)
       + 30 * month + day - 31;
}

export function jdnToEthiopian(jdn) {
  const r = (jdn - JD_EPOCH_AMETE_MIHRET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - JD_EPOCH_AMETE_MIHRET) / 1461)
             + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

export function gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
       - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export const gregorianToEthiopian = (y, m, d) => jdnToEthiopian(gregorianToJDN(y, m, d));
export const ethiopianToGregorian = (y, m, d) => jdnToGregorian(ethiopianToJDN(y, m, d));

export const ETHIOPIAN_MONTHS = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት',
  'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን',
];
