import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

/// Bible text service — reads the JSON bundled with the app in
/// assets/bible/ (one file per book, 01–89, plus 00.json = name index and
/// manifest.json = canon metadata). Regenerate with web/scripts/build-bible.mjs.
///
/// The edition is the EOTC 81-book canon (am-2000). Book numbers 1–66 mean
/// exactly what they always did; the deuterocanonical books are 67–89.
/// Psalms use LXX numbering — see web/supabase/migration_eotc81_renumber.sql.
/// Fully offline: no network calls, no external content API.

class BookRef {
  final int num;
  final String name;

  /// Canonical reading position in the EOTC 81-book list (from manifest.json).
  final int order;

  /// 'old' | 'deuterocanonical' | 'new' (from manifest.json).
  final String testament;

  /// 1-based position within the displayed list (what the UI shows as the
  /// book number). Distinct from [num], which is the asset file number.
  int position = 0;

  BookRef(this.num, this.name, {int? order, this.testament = 'old'}) : order = order ?? num;

  bool get isNewTestament => testament == 'new';
}

class Chapter {
  final String chapter;
  final String title;
  final List<String> verses;
  Chapter(this.chapter, this.title, this.verses);
}

class Book {
  final String title;
  final List<Chapter> chapters;
  Book(this.title, this.chapters);
}

class BibleService {
  BibleService._();
  static final BibleService instance = BibleService._();

  final Map<int, Book> _cache = {};
  List<BookRef>? _books;

  String _pad(int n) => n.toString().padLeft(2, '0');

  Future<dynamic> _load(String file) async {
    final raw = await rootBundle.loadString('assets/bible/$file');
    return jsonDecode(raw);
  }

  /// Table of contents of the printed am-2000 "ሰማንያ አሐዱ" edition, in the
  /// order it is printed. Books the edition does not print (Josippon and the
  /// 8 extra NT books) are deliberately absent: the reader shows exactly what
  /// the printed Bible shows. Asset ids come from manifest.json.
  static const _printOld = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
    '1KI', '2KI', '1CH', '2CH', 'JUB', 'ENO', 'EZR', 'NEH', '1ES', '2ES',
    'TOB', 'JDT', 'EST', '1MA', '2MA', '3MA', 'JOB', 'PSA', 'PRO', '4MA',
    'WIS', 'ECC', 'SNG', 'SIR', 'ISA', 'JER',
    '1BA', // መጽሐፈ ባሮክ (1 Baruch), supplied from am-1980 — see build-bible.mjs
    'LAM', 'LJE', 'BAR', // BAR file = ተረፈ ባሮክ, see _nameOverride
    'EZK', 'DAN', 'HOS', 'AMO', 'MIC', 'JOL', 'OBA', 'JON', 'NAM', 'HAB',
    'ZEP', 'HAG', 'ZEC', 'MAL',
  ];
  static const _printNew = [
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
    'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    '1PE', '2PE', '1JN', '2JN', '3JN', 'JAS', 'JUD', 'REV',
  ];

  /// The dataset's "BAR" file actually holds ተረፈ ባሮክ (Paralipomena of
  /// Jeremiah), not 1 Baruch. Label it truthfully.
  static const _nameOverride = {'BAR': 'ተረፈ ባሮክ'};

  /// Every book in the bundle keyed by file number (incl. unlisted ones), so
  /// shared verses from any book still resolve to a name.
  Map<int, BookRef>? _all;

  /// Canon id ("JHN") -> bundle file number, for data keyed by canon id
  /// such as the ግጻዌ lectionary.
  Map<String, int>? _idToNum;

  Future<void> _loadIndex() async {
    if (_all != null) return;
    final m = (await _load('manifest.json') as Map).cast<String, dynamic>();
    final byId = <String, BookRef>{};
    final all = <int, BookRef>{};
    for (final b in (m['books_list'] as List)) {
      final j = (b as Map).cast<String, dynamic>();
      final id = (j['id'] ?? '').toString();
      final ref = BookRef(
        j['num'] as int,
        _nameOverride[id] ?? (j['name'] ?? '').toString().trim(),
        order: j['order'] as int?,
        testament: (j['testament'] ?? 'old').toString(),
      );
      byId[id] = ref;
      all[ref.num] = ref;
    }
    final list = <BookRef>[];
    for (final id in _printOld) {
      final r = byId[id];
      if (r != null) list.add(BookRef(r.num, r.name, order: r.order, testament: 'old'));
    }
    for (final id in _printNew) {
      final r = byId[id];
      if (r != null) list.add(BookRef(r.num, r.name, order: r.order, testament: 'new'));
    }
    for (var i = 0; i < list.length; i++) {
      list[i].position = i + 1;
    }
    _all = all;
    _books = list;
    _idToNum = {for (final e in byId.entries) e.key: e.value.num};
  }

  Future<List<BookRef>> getBooks() async {
    if (_books != null) return _books!;
    await _loadIndex();
    return _books!;
  }

  Future<Book> getBook(int num) async {
    if (_cache.containsKey(num)) return _cache[num]!;
    final j = await _load('${_pad(num)}.json') as Map<String, dynamic>;
    final chapters = (j['chapters'] as List)
        .map((c) => Chapter(
              (c['chapter'] ?? '').toString(),
              (c['title'] ?? '').toString(),
              (c['verses'] as List).map((v) => v.toString()).toList(),
            ))
        .toList();
    final title = _nameOverride[(j['id'] ?? '').toString()] ?? (j['title'] ?? '').toString();
    final book = Book(title, chapters);
    _cache[num] = book;
    return book;
  }

  /// Bundle file number for a canon id, or null if this edition lacks it.
  Future<int?> numForId(String id) async {
    await _loadIndex();
    return _idToNum?[id];
  }

  String? bookNameSync(int num) {
    return _all?[num]?.name ?? _books?.where((b) => b.num == num).firstOrNull?.name;
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull => isEmpty ? null : first;
}
