import 'package:flutter/material.dart';
import '../theme.dart';
import '../services/gitsawe.dart';
import 'verse_share.dart';

/// A selection inside one of the day's readings, handed up so the screen can
/// show the shared [VerseShareBar] for it.
class GitsaweSelection {
  final ResolvedRef reading;
  final int start;
  final int end;
  const GitsaweSelection(this.reading, this.start, this.end);

  String get range => start == end ? '$start' : '$start-$end';
  String get refLabel => '${reading.bookName} ${reading.ref.chapter}:$range';
  String get text => reading.verses
      .where((v) => v.n >= start && v.n <= end)
      .map((v) => v.t)
      .join(' ');
}

/// Today's ግጻዌ — every reading of the Qidase in full, laid out the same way
/// as the daily chapter: a centred heading, then numbered, tappable verses.
/// Morning/evening readings and the ስንክሳር sit behind toggles.
class GitsaweCard extends StatefulWidget {
  final TodaysGitsawe data;
  final double readerSize;
  final void Function(GitsaweSelection?)? onSelect;

  const GitsaweCard({
    super.key,
    required this.data,
    required this.readerSize,
    this.onSelect,
  });

  @override
  State<GitsaweCard> createState() => GitsaweCardState();
}

class GitsaweCardState extends State<GitsaweCard> {
  bool _hours = false;
  bool _sinksar = false;

  /// Selection is per-reading: tapping into a different passage starts over,
  /// so a range can never span two readings.
  String? _selKey;
  int? _selStart, _selEnd;

  void clearSelection() {
    if (!mounted) return;
    setState(() {
      _selKey = null;
      _selStart = _selEnd = null;
    });
  }

  String _keyOf(ResolvedRef r) => '${r.bookNum}:${r.ref.chapter}:${r.label}';

  void _tapVerse(ResolvedRef reading, int n) {
    setState(() {
      final key = _keyOf(reading);
      if (_selKey != key) {
        _selKey = key;
        _selStart = _selEnd = n;
      } else {
        final r = nextSelection(_selStart, _selEnd, n);
        _selStart = r[0];
        _selEnd = r[1];
        if (_selStart == null) _selKey = null;
      }
    });
    final s = _selStart, e = _selEnd;
    widget.onSelect?.call(
      s == null || e == null ? null : GitsaweSelection(reading, s, e),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final d = widget.data;
    final size = widget.readerSize;

    // Readings that actually carry text, in the order they are read.
    final readings = <(String, ResolvedRef)>[
      for (final g in d.qidase)
        for (final r in g.refs)
          if (r.hasText) (g.label, r),
    ];

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: c.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
          child: Row(children: [
            Expanded(
              child: Text('የዕለቱ ግጻዌ · TODAY\'S READINGS',
                  style: TextStyle(
                      color: c.gold,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2)),
            ),
            Text(d.dateLabel,
                style: amharic(context, size: 13, weight: FontWeight.w600, color: c.inkFaint)),
          ]),
        ),
        const SizedBox(height: 16),
        Divider(color: c.line, height: 1),

        for (var i = 0; i < readings.length; i++) ...[
          _reading(c, size, readings[i].$1, readings[i].$2),
          if (i < readings.length - 1) Divider(color: c.line, height: 1),
        ],

        if (d.anaphora != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
            child: Text('ቅዳሴ · አናፎራ ${d.anaphora}',
                style: amharic(context, size: 13, color: c.inkFaint)),
          ),

        if (d.morning.isNotEmpty || d.evening.isNotEmpty) ...[
          const SizedBox(height: 8),
          Divider(color: c.line, height: 1),
          _toggle(c, 'ንባበ ነግህ ወሰርክ', _hours, () => setState(() => _hours = !_hours)),
          if (_hours) ...[
            for (final r in d.morning)
              if (r.hasText) _reading(c, size, 'ነግህ', r),
            for (final r in d.evening)
              if (r.hasText) _reading(c, size, 'ሰርክ', r),
          ],
        ],

        if (d.sinksar.isNotEmpty) ...[
          Divider(color: c.line, height: 1),
          _toggle(c, 'ስንክሳር · ${d.sinksar.length}', _sinksar,
              () => setState(() => _sinksar = !_sinksar)),
          if (_sinksar)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final t in d.sinksar)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('• ', style: TextStyle(color: c.gold, fontSize: size * 0.85)),
                      Expanded(
                        child: Text(t,
                            style: amharic(context, size: size * 0.86, height: 1.6, color: c.inkSoft)),
                      ),
                    ]),
                  ),
              ]),
            ),
        ],
        const SizedBox(height: 6),
      ]),
    );
  }

  /// One reading: the same centred heading the daily chapter uses, then its
  /// verses in full.
  Widget _reading(AppColors c, double size, String slot, ResolvedRef r) {
    final key = _keyOf(r);
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(
          child: Column(children: [
            Text(slot.toUpperCase(),
                style: TextStyle(
                    color: c.gold,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2)),
            const SizedBox(height: 6),
            Text(r.bookName,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: amharic(context, size: 21, weight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(r.chapterLabel,
                style: display(context, size: 14, italic: true, color: c.brand)),
            const SizedBox(height: 10),
            Container(
              width: 44,
              height: 2,
              decoration: BoxDecoration(
                color: c.gold.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        for (final v in r.verses)
          VerseTile(
            n: v.n,
            text: v.t,
            size: size,
            selected: _selKey == key &&
                _selStart != null &&
                v.n >= _selStart! &&
                v.n <= _selEnd!,
            onTap: () => _tapVerse(r, v.n),
          ),
      ]),
    );
  }

  Widget _toggle(AppColors c, String label, bool open, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
        child: Row(children: [
          Expanded(
            child: Text(label,
                style: amharic(context, size: 14, weight: FontWeight.w600, color: c.inkSoft)),
          ),
          AnimatedRotation(
            turns: open ? 0.5 : 0,
            duration: const Duration(milliseconds: 180),
            child: Icon(Icons.keyboard_arrow_down, size: 20, color: c.inkFaint),
          ),
        ]),
      ),
    );
  }
}
