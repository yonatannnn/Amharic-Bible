/// Ethiopian ⇄ Gregorian conversion (Amete Mihret), via Julian Day Number.
///
/// 12 months of 30 days plus ጳጉሜን, which has 5 days — 6 when the year number
/// mod 4 is 3. New year (መስከረም 1) therefore lands on 11 or 12 September.
///
/// Mirrors web/src/lib/ethiopic.ts and gitsawe/ethiopic.mjs.
library;

const _jdEpochAmeteMihret = 1723856;

class EthiopianDate {
  final int year;
  final int month;
  final int day;
  const EthiopianDate(this.year, this.month, this.day);

  String get key =>
      '${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  String get label => '${ethiopianMonths[month - 1]} ${geez(day)}';
}

int gregorianToJDN(int year, int month, int day) {
  final a = (14 - month) ~/ 12;
  final y = year + 4800 - a;
  final m = month + 12 * a - 3;
  return day +
      (153 * m + 2) ~/ 5 +
      365 * y +
      y ~/ 4 -
      y ~/ 100 +
      y ~/ 400 -
      32045;
}

EthiopianDate jdnToEthiopian(int jdn) {
  final r = (jdn - _jdEpochAmeteMihret) % 1461;
  final n = (r % 365) + 365 * (r ~/ 1460);
  final year = 4 * ((jdn - _jdEpochAmeteMihret) ~/ 1461) + r ~/ 365 - r ~/ 1460;
  return EthiopianDate(year, n ~/ 30 + 1, n % 30 + 1);
}

EthiopianDate gregorianToEthiopian(int y, int m, int d) =>
    jdnToEthiopian(gregorianToJDN(y, m, d));

/// "Today" in Ethiopia time (UTC+3) — the same day boundary the rest of the
/// app and the cron use.
EthiopianDate todayInAddis() {
  final n = DateTime.now().toUtc().add(const Duration(hours: 3));
  return gregorianToEthiopian(n.year, n.month, n.day);
}

const ethiopianMonths = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት',
  'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን',
];

const _geezOnes = ['', '፩', '፪', '፫', '፬', '፭', '፮', '፯', '፰', '፱'];
const _geezTens = ['', '፲', '፳', '፴', '፵', '፶', '፷', '፸', '፹', '፺'];

/// Ge'ez numeral for 1–99, used for the day of the month.
String geez(int n) {
  if (n <= 0 || n >= 100) return '$n';
  return _geezTens[n ~/ 10] + _geezOnes[n % 10];
}
