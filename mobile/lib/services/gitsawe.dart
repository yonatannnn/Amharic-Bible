/// ግጻዌ — the EOTC daily lectionary, plus the day's ስንክሳር commemorations.
///
/// Bundled in assets/gitsawe/gitsawe.json, keyed by ETHIOPIAN month-day (the
/// church's own reckoning, so it holds year to year). Regenerate with
/// `node gitsawe/parse.mjs` from the repo root.
///
/// Only references are stored; verse text is pulled from the bundled Bible at
/// read time so there is one copy of the text.
library;

import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'bible.dart';
import 'ethiopic.dart';

class GitsaweRef {
  final String book; // canon id
  final int chapter;
  final int? start;
  final int? end;
  final bool toEnd;
  final List<int>? list;

  GitsaweRef(this.book, this.chapter,
      {this.start, this.end, this.toEnd = false, this.list});

  factory GitsaweRef.fromJson(Map<String, dynamic> j) => GitsaweRef(
        (j['book'] ?? '').toString(),
        (j['chapter'] as num).toInt(),
        start: (j['start'] as num?)?.toInt(),
        end: (j['end'] as num?)?.toInt(),
        toEnd: j['toEnd'] == true,
        list: (j['list'] as List?)?.map((v) => (v as num).toInt()).toList(),
      );
}

/// One verse of a reading, carrying its real number in the chapter so the
/// numbering on screen matches the printed Bible.
class ReadingVerse {
  final int n;
  final String t;
  const ReadingVerse(this.n, this.t);
}

class ResolvedRef {
  final GitsaweRef ref;
  final int bookNum;
  final String bookName;
  final String label;

  /// Where the passage sits in its chapter, e.g. "ምዕራፍ 15:12-27".
  final String chapterLabel;
  final List<ReadingVerse> verses;

  const ResolvedRef(this.ref, this.bookNum, this.bookName, this.label,
      {this.chapterLabel = '', this.verses = const []});

  String get text => verses.map((v) => v.t).join(' ');
  bool get hasText => verses.isNotEmpty;
}

class QidaseGroup {
  final String slot;
  final String label;
  final List<ResolvedRef> refs;
  QidaseGroup(this.slot, this.label, this.refs);
}

class TodaysGitsawe {
  final EthiopianDate date;
  final String dateLabel;
  final int? anaphora;
  final ResolvedRef? gospel;
  final List<QidaseGroup> qidase; // excludes the gospel
  final List<ResolvedRef> morning;
  final List<ResolvedRef> evening;
  final List<String> sinksar;

  TodaysGitsawe({
    required this.date,
    required this.dateLabel,
    required this.anaphora,
    required this.gospel,
    required this.qidase,
    required this.morning,
    required this.evening,
    required this.sinksar,
  });

  bool get isEmpty => gospel == null && qidase.isEmpty;
}

const _slotLabels = {
  'pauline': 'ጳውሎስ',
  'catholic': 'ተከታታይ',
  'acts': 'ሐዋርያት ሥራ',
  'misbak': 'ምስባክ',
  'gospel': 'ወንጌል',
  'other': 'ተጨማሪ',
};
/// Order the readings appear on the card: the Gospel leads, as it does on
/// the web card, then the rest of the Qidase.
const _slotOrder = ['gospel', 'pauline', 'catholic', 'acts', 'misbak', 'other'];

class GitsaweService {
  GitsaweService._();
  static final GitsaweService instance = GitsaweService._();

  Map<String, dynamic>? _days;

  Future<Map<String, dynamic>> _load() async {
    if (_days != null) return _days!;
    final raw = await rootBundle.loadString('assets/gitsawe/gitsawe.json');
    final doc = (jsonDecode(raw) as Map).cast<String, dynamic>();
    _days = (doc['days'] as Map).cast<String, dynamic>();
    return _days!;
  }

  String _label(GitsaweRef r, String bookName, List<String>? verses, int? firstN) {
    final head = '$bookName ${r.chapter}';
    if (r.list != null && r.list!.isNotEmpty) return '$head:${r.list!.join(",")}';
    if (r.toEnd) {
      final last = (firstN ?? 1) + (verses?.length ?? 1) - 1;
      return '$head:${r.start}${last != r.start ? "-$last" : ""}';
    }
    if (r.start == null) return head;
    final e = r.end;
    return '$head:${r.start}${e != null && e != r.start ? "-$e" : ""}';
  }

  Future<ResolvedRef?> resolve(GitsaweRef r, {bool withText = true}) async {
    final num = await BibleService.instance.numForId(r.book);
    if (num == null) return null;
    Book book;
    try {
      book = await BibleService.instance.getBook(num);
    } catch (_) {
      return null;
    }
    final name = book.title;
    if (r.chapter < 1 || r.chapter > book.chapters.length) {
      return ResolvedRef(r, num, name, _label(r, name, null, null));
    }
    final all = book.chapters[r.chapter - 1].verses;

    // Pick the verses this reference points at, keeping their real numbers.
    final picked = <ReadingVerse>[];
    if (r.list != null && r.list!.isNotEmpty) {
      for (final n in r.list!) {
        if (n >= 1 && n <= all.length) picked.add(ReadingVerse(n, all[n - 1]));
      }
    } else if (r.start == null) {
      for (var n = 1; n <= all.length; n++) {
        picked.add(ReadingVerse(n, all[n - 1]));
      }
    } else {
      final hi = r.toEnd ? all.length : (r.end ?? r.start!);
      for (var n = r.start!; n <= hi && n <= all.length; n++) {
        picked.add(ReadingVerse(n, all[n - 1]));
      }
    }

    final verses = picked.map((v) => v.t).toList();
    final label = _label(r, name, verses, picked.isEmpty ? null : picked.first.n);
    final range = picked.isEmpty
        ? '${r.chapter}'
        : (picked.length == 1
            ? '${r.chapter}:${picked.first.n}'
            : '${r.chapter}:${picked.first.n}-${picked.last.n}');
    return ResolvedRef(r, num, name, label,
        chapterLabel: 'ምዕራፍ $range', verses: withText ? picked : const []);
  }

  Future<List<ResolvedRef>> _resolveAll(List raw, {bool withText = true}) async {
    final out = <ResolvedRef>[];
    for (final j in raw) {
      final r = await resolve(GitsaweRef.fromJson((j as Map).cast<String, dynamic>()),
          withText: withText);
      if (r != null) out.add(r);
    }
    return out;
  }

  /// Everything today's card needs. Returns null if the day is not in the data.
  Future<TodaysGitsawe?> today([EthiopianDate? when]) async {
    final date = when ?? todayInAddis();
    Map<String, dynamic> days;
    try {
      days = await _load();
    } catch (_) {
      return null;
    }
    final j = days[date.key];
    if (j == null) return null;
    final day = (j as Map).cast<String, dynamic>();
    final qid = (day['qidase'] as Map).cast<String, dynamic>();

    final groups = <QidaseGroup>[];
    for (final slot in _slotOrder) {
      final refs = await _resolveAll((qid[slot] as List?) ?? const []);
      if (refs.isNotEmpty) groups.add(QidaseGroup(slot, _slotLabels[slot]!, refs));
    }
    final gospelGroup = groups.where((g) => g.slot == 'gospel').firstOrNull;

    return TodaysGitsawe(
      date: date,
      dateLabel: date.label,
      anaphora: (day['anaphora'] as num?)?.toInt(),
      gospel: gospelGroup?.refs.firstOrNull,
      qidase: groups,
      morning: await _resolveAll((day['morning'] as List?) ?? const []),
      evening: await _resolveAll((day['evening'] as List?) ?? const []),
      sinksar: [
        for (final s in ((day['sinksar'] as List?) ?? const []))
          ((s as Map)['title'] ?? '').toString()
      ],
    );
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull => isEmpty ? null : first;
}
