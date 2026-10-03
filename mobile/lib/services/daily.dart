import '../supabase.dart';
import 'bible.dart';
import 'bible_canon.dart';

// chapterCounts, chapterTotal, bookCount and planBookCount are generated from
// the bundled edition by web/scripts/build-bible.mjs, so the two platforms can
// never drift apart.
export 'bible_canon.dart' show chapterCounts, chapterTotal, bookCount, planBookCount;

String _two(int n) => n.toString().padLeft(2, '0');

/// "Today" in Ethiopia time (UTC+3) — matches the web + cron.
String addisDay() {
  final n = DateTime.now().toUtc().add(const Duration(hours: 3));
  return '${n.year}-${_two(n.month)}-${_two(n.day)}';
}


/// 0-based linear index of a (1-based) book + chapter within the Bible.
int linearIndex(int book, int chapter) {
  var idx = chapter - 1;
  for (var i = 0; i < book - 1; i++) {
    idx += chapterCounts[i];
  }
  return idx;
}

/// Convert a 0-based linear index back to a {book, chapter} pair (1-based).
Map<String, int> chapterFromLinearIndex(int index) {
  var idx = index % chapterTotal;
  for (var i = 0; i < planBookCount; i++) {
    if (idx < chapterCounts[i]) {
      return {'book': i + 1, 'chapter': idx + 1};
    }
    idx -= chapterCounts[i];
  }
  return {'book': 1, 'chapter': 1};
}

/// Pick the consecutive-plan chapter for [today] (YYYY-MM-DD, Addis day),
/// given the user's start point. Advances one chapter per elapsed day,
/// wrapping Revelation -> Genesis.
Map<String, int> consecutiveChapterFor({
  required String today,
  required int startBook,
  required int startChapter,
  required String startDate,
}) {
  final sb = startBook.clamp(1, planBookCount);
  final sc = startChapter.clamp(1, chapterCounts[sb - 1]);
  final daysElapsed = DateTime.parse(today).difference(DateTime.parse(startDate)).inDays;
  final elapsed = daysElapsed < 0 ? 0 : daysElapsed;
  final idx = (linearIndex(sb, sc) + elapsed) % chapterTotal;
  return chapterFromLinearIndex(idx);
}

const _fallbackVerses = [
  {'book': 43, 'chapter': 3, 'verse': 16},
  {'book': 19, 'chapter': 23, 'verse': 1},
  {'book': 50, 'chapter': 4, 'verse': 13},
  {'book': 24, 'chapter': 29, 'verse': 11},
  {'book': 20, 'chapter': 3, 'verse': 5},
  {'book': 45, 'chapter': 8, 'verse': 28},
  {'book': 40, 'chapter': 11, 'verse': 28},
  {'book': 19, 'chapter': 46, 'verse': 1},
];

// Must stay byte-for-byte identical (list, order, and hash) to the web app's
// fallback in web/src/lib/readingPlan.ts, so that on a day with no AI-generated
// daily_chapter row BOTH platforms pick the SAME chapter.
const _fallbackChapters = [
  {'book': 43, 'chapter': 1}, // John 1
  {'book': 40, 'chapter': 5}, // Matthew 5
  {'book': 45, 'chapter': 8}, // Romans 8
  {'book': 46, 'chapter': 13}, // 1 Corinthians 13
  {'book': 50, 'chapter': 2}, // Philippians 2
  {'book': 43, 'chapter': 15}, // John 15
  {'book': 42, 'chapter': 15}, // Luke 15
  {'book': 44, 'chapter': 2}, // Acts 2
  {'book': 58, 'chapter': 11}, // Hebrews 11
  {'book': 59, 'chapter': 1}, // James 1
  {'book': 49, 'chapter': 3}, // Ephesians 3
  {'book': 51, 'chapter': 3}, // Colossians 3
  {'book': 19, 'chapter': 23}, // Psalm 23
  {'book': 23, 'chapter': 53}, // Isaiah 53
  {'book': 20, 'chapter': 3}, // Proverbs 3
];

// Same string hash the web app uses: h = (h * 31 + charCode) >>> 0 (unsigned 32-bit).
int _dayHash(String dayKey) {
  int h = 0;
  for (final c in dayKey.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return h;
}

Map<String, int> _fallbackChapterFor(String day) =>
    _fallbackChapters[_dayHash(day) % _fallbackChapters.length];

class DailyVerse {
  final int book, chapter, verse;
  final String label, text;
  DailyVerse(this.book, this.chapter, this.verse, this.label, this.text);
}

class TodaysReading {
  final int book, chapter;
  final String bookName;
  final List<String> verses;
  final bool alreadyReadToday;
  final int readingStreak;
  final String date;
  TodaysReading({
    required this.book,
    required this.chapter,
    required this.bookName,
    required this.verses,
    required this.alreadyReadToday,
    required this.readingStreak,
    required this.date,
  });
}

class DailyService {
  DailyService._();
  static final instance = DailyService._();
  final _bible = BibleService.instance;

  Future<DailyVerse?> getDailyVerse() async {
    final day = addisDay();
    List refs;
    try {
      final row = await supabase
          .from('daily_verse_pool')
          .select('refs')
          .eq('date', day)
          .maybeSingle();
      refs = (row?['refs'] as List?) ?? _fallbackVerses;
    } catch (_) {
      refs = _fallbackVerses;
    }
    if (refs.isEmpty) refs = _fallbackVerses;
    final windowIndex =
        DateTime.now().millisecondsSinceEpoch ~/ (12 * 3600 * 1000);

    // An admin may have overridden this window's verse.
    try {
      final ov = await supabase
          .from('daily_verse_override')
          .select('book, chapter, verse, window_index')
          .maybeSingle();
      if (ov != null && ov['window_index'] == windowIndex) {
        final v = await _resolveVerse(ov['book'] as int, ov['chapter'] as int, ov['verse'] as int);
        if (v != null) return v;
      }
    } catch (_) {}

    for (var offset = 0; offset < refs.length; offset++) {
      final pick = refs[(windowIndex + offset) % refs.length] as Map;
      final v = await _resolveVerse(pick['book'] as int, pick['chapter'] as int, pick['verse'] as int);
      if (v != null) return v;
    }
    return null;
  }

  Future<DailyVerse?> _resolveVerse(int book, int chapter, int verse) async {
    try {
      final b = await _bible.getBook(book);
      if (chapter < 1 || chapter > b.chapters.length) return null;
      final ch = b.chapters[chapter - 1];
      if (ch.verses.isEmpty) return null;
      final idx = (verse > ch.verses.length ? ch.verses.length : verse) - 1;
      final text = ch.verses[idx];
      final label = '${b.title.isNotEmpty ? b.title : 'Book $book'} $chapter:$verse';
      return DailyVerse(book, chapter, verse, label, text);
    } catch (_) {
      return null;
    }
  }

  /// Admin: override the current window's verse immediately.
  Future<bool> setDailyVerseOverride(int book, int chapter, int verse) async {
    final uid = supabase.auth.currentUser?.id;
    final windowIndex = DateTime.now().millisecondsSinceEpoch ~/ (12 * 3600 * 1000);
    try {
      await supabase.from('daily_verse_override').upsert({
        'id': 1,
        'book': book,
        'chapter': chapter,
        'verse': verse,
        'window_index': windowIndex,
        'set_by': uid,
        'set_at': DateTime.now().toIso8601String(),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Admin: the Telegram queue, ordered top-first (top is sent at 6 AM EAT).
  Future<List<Map<String, dynamic>>> listTelegramQueue() async {
    try {
      final rows = await supabase
          .from('telegram_queue')
          .select('id, book, chapter, verse, source')
          .order('position', ascending: true);
      return (rows as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  /// Admin: append a manually-picked verse to the queue.
  Future<bool> addToTelegramQueue(int book, int chapter, int verse) async {
    final uid = supabase.auth.currentUser?.id;
    try {
      await supabase.from('telegram_queue').insert({
        'book': book,
        'chapter': chapter,
        'verse': verse,
        'source': 'manual',
        'set_by': uid,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> removeFromTelegramQueue(int id) async {
    try {
      await supabase.from('telegram_queue').delete().eq('id', id);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Persist a new order: positions become 0..n-1 in the given id order.
  Future<bool> reorderTelegramQueue(List<int> orderedIds) async {
    try {
      for (var i = 0; i < orderedIds.length; i++) {
        await supabase.from('telegram_queue').update({'position': i}).eq('id', orderedIds[i]);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Admin: ask the server to generate `count` AI verses into the queue.
  Future<int> generateAiVerses(int count) async {
    try {
      final res = await supabase.functions.invoke('generate-verses', body: {'count': count});
      return (res.data?['added'] as List?)?.length ?? 0;
    } catch (_) {
      return 0;
    }
  }

  /// Admin: broadcast a verse to Telegram now; removes queue row [id] if given.
  /// Returns the number of subscribers it reached, or null on failure.
  Future<int?> sendVerseNow({int? id, required int book, required int chapter, required int verse}) async {
    try {
      final res = await supabase.functions.invoke('telegram-verse', body: {
        if (id != null) 'id': id,
        'book': book,
        'chapter': chapter,
        'verse': verse,
      });
      return (res.data?['sent'] as int?) ?? 0;
    } catch (_) {
      return null;
    }
  }

  Future<TodaysReading?> getTodaysReading() async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) return null;
    final day = addisDay();

    int book, chapter;

    // If the user is on the "read in order" plan, their daily chapter is
    // derived locally from the start point and elapsed days.
    Map<String, int>? consecutive;
    try {
      final plan = await supabase
          .from('reading_plan')
          .select('mode,start_book,start_chapter,start_date')
          .eq('user_id', uid)
          .maybeSingle();
      if (plan != null &&
          plan['mode'] == 'consecutive' &&
          plan['start_book'] != null &&
          plan['start_chapter'] != null &&
          plan['start_date'] != null) {
        consecutive = consecutiveChapterFor(
          today: day,
          startBook: plan['start_book'] as int,
          startChapter: plan['start_chapter'] as int,
          startDate: (plan['start_date'] as String).split('T').first,
        );
      }
    } catch (_) {}

    if (consecutive != null) {
      book = consecutive['book']!;
      chapter = consecutive['chapter']!;
    } else {
      try {
        final row = await supabase
            .from('daily_chapter')
            .select('book, chapter')
            .eq('date', day)
            .maybeSingle();
        if (row != null) {
          book = row['book'] as int;
          chapter = row['chapter'] as int;
        } else {
          final f = _fallbackChapterFor(day);
          book = f['book']!;
          chapter = f['chapter']!;
        }
      } catch (_) {
        final f = _fallbackChapterFor(day);
        book = f['book']!;
        chapter = f['chapter']!;
      }
    }

    final results = await Future.wait([
      supabase
          .from('reading_progress')
          .select('book')
          .eq('user_id', uid)
          .eq('date', day)
          .maybeSingle(),
      supabase
          .from('reading_progress')
          .select('date')
          .eq('user_id', uid)
          .order('date', ascending: false)
          .limit(400),
    ]);
    final todayRow = results[0];
    final recent = (results[1] as List).map((r) => r['date'] as String).toSet();

    final b = await _bible.getBook(book);
    if (b.chapters.isEmpty) return null;
    // Guard against a bad chapter index (e.g. a generated value out of range).
    final chapterIdx = (chapter - 1).clamp(0, b.chapters.length - 1);
    chapter = chapterIdx + 1;
    final verses = b.chapters[chapterIdx].verses;

    return TodaysReading(
      book: book,
      chapter: chapter,
      bookName: b.title.isNotEmpty ? b.title : 'Book $book',
      verses: verses,
      alreadyReadToday: todayRow != null,
      readingStreak: _streak(recent, day),
      date: day,
    );
  }

  int _streak(Set<String> dates, String todayKey) {
    DateTime cur = DateTime.parse('${todayKey}T12:00:00Z');
    String fmt(DateTime d) =>
        '${d.year}-${_two(d.month)}-${_two(d.day)}';
    if (!dates.contains(fmt(cur))) {
      cur = cur.subtract(const Duration(days: 1));
    }
    int streak = 0;
    while (dates.contains(fmt(cur))) {
      streak++;
      cur = cur.subtract(const Duration(days: 1));
    }
    return streak;
  }

  Future<void> markRead(int book, int chapter, String date) async {
    final uid = supabase.auth.currentUser!.id;
    await supabase.from('reading_progress').upsert({
      'user_id': uid,
      'date': date,
      'book': book,
      'chapter': chapter,
      'completed_at': DateTime.now().toIso8601String(),
    });
  }
}
