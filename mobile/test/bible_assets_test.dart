import 'package:flutter_test/flutter_test.dart';
import 'package:amharic_bible/services/bible.dart';
import 'package:amharic_bible/services/bible_canon.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundled bible index lists the printed EOTC canon', () async {
    final books = await BibleService.instance.getBooks();
    // The reader shows the printed am-2000 table of contents, which is a
    // subset of the bundled files (Josippon and the extra NT books are
    // bundled but not printed), so this is not simply bookCount.
    expect(books.length, greaterThan(66),
        reason: 'should include the deuterocanonical books');
    expect(books.first.num, 1); // Genesis
    expect(books.first.name.isNotEmpty, true);
    // Numbers 1-66 must keep meaning the books they always meant, because
    // they are stored in Supabase — see migration_eotc81_renumber.sql.
    expect(bookIds[39], 'MAT');
    expect(bookIds[65], 'REV');
    final ids = books.map((b) => b.num).toSet();
    expect(ids.containsAll([1, 40, 66]), true);
  });

  test('every bundled book parses and has verses', () async {
    var total = 0;
    for (var n = 1; n <= bookCount; n++) {
      final b = await BibleService.instance.getBook(n);
      expect(b.chapters.isNotEmpty, true, reason: 'book $n has no chapters');
      for (final c in b.chapters) {
        total += c.verses.length;
      }
    }
    expect(total, greaterThan(40000)); // 81-book canon ≈ 44.2k verses
  });

  test('recovered verses are present (Judges 20:13, Hebrews 11:37)', () async {
    final judges = await BibleService.instance.getBook(7);
    expect(judges.chapters[19].verses[12].trim().isNotEmpty, true);
    final hebrews = await BibleService.instance.getBook(58);
    expect(hebrews.chapters[10].verses[36].trim().isNotEmpty, true);
  });
}
