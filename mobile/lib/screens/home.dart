import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../supabase.dart';
import '../theme.dart';
import '../state/settings.dart';
import '../services/daily.dart';
import '../services/gitsawe.dart';
import '../widgets/reveal.dart';
import '../widgets/gitsawe_card.dart';
import '../widgets/verse_share.dart';
import '../providers.dart';
import 'verse_picker.dart';
import 'admin_verse_picker.dart';
import 'telegram_queue_page.dart';
import '../services/bible.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int? _selStart, _selEnd;

  /// Selection inside one of today's ግጻዌ readings. Kept apart from the daily
  /// chapter's selection so the share bar always names the right passage.
  GitsaweSelection? _gitsaweSel;
  final _gitsaweKey = GlobalKey<GitsaweCardState>();
  RealtimeChannel? _rt;

  @override
  void initState() {
    super.initState();
    // live: the streak banner reacts to streak changes (shares, breaks, restores)
    _rt = supabase
        .channel('home-screen')
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'streaks',
            callback: (_) {
              ref.invalidate(friendsProvider);
              ref.invalidate(urgentStreakProvider);
            })
        .subscribe();
  }

  @override
  void dispose() {
    if (_rt != null) supabase.removeChannel(_rt!);
    super.dispose();
  }

  void _tapVerse(int n) {
    setState(() {
      final r = nextSelection(_selStart, _selEnd, n);
      _selStart = r[0];
      _selEnd = r[1];
      if (_selStart != null) _gitsaweSel = null;
    });
    _gitsaweKey.currentState?.clearSelection();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final profileAsync = ref.watch(profileProvider);
    final verseAsync = ref.watch(dailyVerseProvider);
    final readingAsync = ref.watch(todaysReadingProvider);
    final gitsaweAsync = ref.watch(gitsaweProvider);
    final urgent = ref.watch(urgentStreakProvider).asData?.value;
    return Scaffold(
      body: SafeArea(
        child: _content(c, profileAsync, verseAsync, readingAsync, gitsaweAsync, urgent),
      ),
    );
  }

  Widget _content(
    AppColors c,
    AsyncValue<Map<String, dynamic>?> profileAsync,
    AsyncValue<DailyVerse?> verseAsync,
    AsyncValue<TodaysReading?> readingAsync,
    AsyncValue<TodaysGitsawe?> gitsaweAsync,
    StreakReminder? urgent,
  ) {
    // Render the greeting immediately; each section streams in on its own.
    final profile = profileAsync.asData?.value;
    final verse = verseAsync.asData?.value;
    final reading = readingAsync.asData?.value;
    final gitsawe = gitsaweAsync.asData?.value;
    final name = (profile?['name'] ?? profile?['username'] ?? 'friend') as String;
    final first = name.split(' ').first;
    final hasSel = _selStart != null || _gitsaweSel != null;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(profileProvider);
        ref.invalidate(dailyVerseProvider);
        ref.invalidate(todaysReadingProvider);
        ref.invalidate(urgentStreakProvider);
        await ref.read(todaysReadingProvider.future);
      },
      child: Stack(children: [
        ListView(
          padding: EdgeInsets.fromLTRB(20, 12, 20, hasSel ? 130 : 36),
          children: [
            Reveal(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(width: 6, height: 6, decoration: BoxDecoration(color: c.gold, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  Text(
                    DateFormat('EEEE, MMMM d').format(DateTime.now()).toUpperCase(),
                    style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5),
                  ),
                ]),
                const SizedBox(height: 8),
                Text('ሰላም, $first', style: amharic(context, size: 28, weight: FontWeight.w700)),
              ]),
            ),
            if (urgent != null) ...[
              const SizedBox(height: 16),
              Reveal(child: _streakBanner(c, urgent)),
            ],
            const SizedBox(height: 22),
            // verse of the day — skeleton while it loads
            if (verse != null)
              Reveal(delay: const Duration(milliseconds: 90), child: _verseCard(c, verse, profile?['is_admin'] == true))
            else if (verseAsync.isLoading)
              _verseSkeleton(c),
            const SizedBox(height: 16),
            // today's ግጻዌ readings — hidden entirely if the day has none
            if (gitsawe != null && !gitsawe.isEmpty) ...[
              Reveal(
                delay: const Duration(milliseconds: 130),
                child: GitsaweCard(
                  key: _gitsaweKey,
                  data: gitsawe,
                  readerSize: settings.readerSize,
                  onSelect: (sel) => setState(() {
                    _gitsaweSel = sel;
                    // Only one share bar at a time.
                    if (sel != null) _selStart = _selEnd = null;
                  }),
                ),
              ),
              const SizedBox(height: 16),
            ],
            // today's chapter — skeleton while it loads
            if (reading != null)
              Reveal(
                delay: const Duration(milliseconds: 180),
                child: _ChapterCard(
                  reading: reading,
                  selStart: _selStart,
                  selEnd: _selEnd,
                  onTapVerse: _tapVerse,
                  onChanged: () => ref.invalidate(todaysReadingProvider),
                ),
              )
            else if (readingAsync.isLoading)
              _chapterSkeleton(c),
          ],
        ),
        if (_gitsaweSel != null)
          Positioned(left: 0, right: 0, bottom: 0, child: _gitsaweBar(_gitsaweSel!))
        else if (_selStart != null && reading != null)
          Positioned(left: 0, right: 0, bottom: 0, child: _floatingBar(reading)),
      ]),
    );
  }

  Widget _skelBar(double? w, double h, Color color) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(6)),
      );

  Widget _verseSkeleton(AppColors c) {
    final fg = Colors.white.withValues(alpha: 0.18);
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [c.brand.withValues(alpha: 0.55), Color.lerp(c.brand, Colors.black, 0.32)!.withValues(alpha: 0.55)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _skelBar(150, 11, c.goldSoft.withValues(alpha: 0.5)),
        const SizedBox(height: 24),
        _skelBar(double.infinity, 13, fg),
        const SizedBox(height: 10),
        _skelBar(double.infinity, 13, fg),
        const SizedBox(height: 10),
        _skelBar(200, 13, fg),
        const SizedBox(height: 20),
        _skelBar(120, 12, fg),
      ]),
    );
  }

  Widget _chapterSkeleton(AppColors c) {
    final fg = c.line;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: c.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          _skelBar(160, 11, fg),
          _skelBar(70, 22, fg),
        ]),
        const SizedBox(height: 22),
        _skelBar(double.infinity, 1, fg),
        const SizedBox(height: 22),
        Center(child: _skelBar(140, 20, fg)),
        const SizedBox(height: 20),
        for (var i = 0; i < 4; i++) ...[
          _skelBar(double.infinity, 12, fg),
          const SizedBox(height: 12),
        ],
        _skelBar(220, 12, fg),
      ]),
    );
  }

  /// Share bar for a selection inside one of today's ግጻዌ readings.
  Widget _gitsaweBar(GitsaweSelection sel) {
    return VerseShareBar(
      book: sel.reading.bookNum,
      chapter: sel.reading.ref.chapter,
      start: sel.start,
      end: sel.end,
      ref: sel.refLabel,
      text: sel.text,
      onClear: () {
        setState(() => _gitsaweSel = null);
        _gitsaweKey.currentState?.clearSelection();
      },
    );
  }

  Widget _floatingBar(TodaysReading r) {
    final s = _selStart!, e = _selEnd!;
    final range = s == e ? '$s' : '$s-$e';
    final text = r.verses.sublist(s - 1, e).where((t) => t.trim().isNotEmpty).join(' ');
    final refLabel = '${r.bookName} ${r.chapter}:$range';
    return VerseShareBar(
      book: r.book, chapter: r.chapter, start: s, end: e, ref: refLabel, text: text,
      onClear: () => setState(() => _selStart = _selEnd = null),
    );
  }

  Widget _streakBanner(AppColors c, StreakReminder s) {
    final left = s.deadline.difference(DateTime.now());
    final timeLeft = left.inHours >= 1 ? '${left.inHours}h left' : '${left.inMinutes < 1 ? 1 : left.inMinutes}m left';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.ember.withValues(alpha: 0.2), c.brand.withValues(alpha: 0.12)]),
        border: Border.all(color: c.ember.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        const Text('🔥', style: TextStyle(fontSize: 26)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('${s.count}-day streak with ${s.friend.display}',
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 1),
          Text('Share a verse to keep it · $timeLeft', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkSoft, fontSize: 12)),
        ])),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => VersePickerScreen(friendshipId: s.friend.friendshipId, friend: s.friend))),
          style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, visualDensity: VisualDensity.compact),
          child: const Text('Share'),
        ),
      ]),
    );
  }

  Future<void> _adminVerseMenu(AppColors c) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 10),
          Container(width: 38, height: 4, decoration: BoxDecoration(color: c.line, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 8),
          ListTile(
            leading: Icon(Icons.swap_horiz_rounded, color: c.brand),
            title: const Text("Change today's verse"),
            subtitle: Text('Override the in-app verse for this window', style: TextStyle(fontSize: 12, color: c.inkFaint)),
            onTap: () => Navigator.pop(ctx, 'override'),
          ),
          ListTile(
            leading: Icon(Icons.send_rounded, color: c.brand),
            title: const Text('Telegram queue'),
            subtitle: Text('Manage the daily 6 AM broadcast', style: TextStyle(fontSize: 12, color: c.inkFaint)),
            onTap: () => Navigator.pop(ctx, 'queue'),
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (!mounted) return;
    if (choice == 'override') {
      final sel = await Navigator.push<Map>(context, MaterialPageRoute(
          builder: (_) => const AdminVersePicker(title: "Change today's verse", confirmLabel: 'Set')));
      if (sel == null || !mounted) return;
      final ok = await DailyService.instance.setDailyVerseOverride(sel['book'], sel['chapter'], sel['verse']);
      if (!mounted) return;
      if (ok) ref.invalidate(dailyVerseProvider);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok ? 'Verse updated' : 'Could not update')));
    } else if (choice == 'queue') {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => const TelegramQueuePage()));
    }
  }

  Widget _verseCard(AppColors c, DailyVerse v, bool isAdmin) {
    final size = settings.readerSize;
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [c.brand, Color.lerp(c.brand, Colors.black, 0.32)!],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: c.brand.withValues(alpha: 0.28), blurRadius: 26, offset: const Offset(0, 12)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('• የዕለቱ ቃል · VERSE OF THE DAY',
                style: TextStyle(color: c.goldSoft, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
          ),
          if (isAdmin)
            GestureDetector(
              onTap: () => _adminVerseMenu(c),
              child: Icon(Icons.edit_outlined, size: 17, color: c.goldSoft),
            ),
        ]),
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 10),
          child: Icon(Icons.format_quote_rounded, color: c.gold.withValues(alpha: 0.6), size: 28),
        ),
        Text(v.text, style: amharic(context, size: size, color: const Color(0xFFFDF3EC), height: 1.75)),
        const SizedBox(height: 16),
        Text('— ${v.label}',
            style: display(context, size: 14, italic: true, color: c.goldSoft)),
      ]),
    );
  }
}

class _ChapterCard extends StatefulWidget {
  final TodaysReading reading;
  final int? selStart, selEnd;
  final void Function(int) onTapVerse;
  final VoidCallback onChanged;
  const _ChapterCard({
    required this.reading,
    required this.selStart,
    required this.selEnd,
    required this.onTapVerse,
    required this.onChanged,
  });
  @override
  State<_ChapterCard> createState() => _ChapterCardState();
}

class _ChapterCardState extends State<_ChapterCard> {
  late bool _done = widget.reading.alreadyReadToday;
  bool _busy = false;

  Future<void> _markRead() async {
    HapticFeedback.mediumImpact();
    setState(() => _busy = true);
    final r = widget.reading;
    await DailyService.instance.markRead(r.book, r.chapter, r.date);
    setState(() {
      _busy = false;
      _done = true;
    });
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final r = widget.reading;
    final size = settings.readerSize;
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: c.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text('የዕለቱ ምዕራፍ · TODAY\'S CHAPTER',
                    style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [c.ember.withValues(alpha: 0.2), c.brand.withValues(alpha: 0.14)]),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('🔥', style: TextStyle(fontSize: 13)),
                  const SizedBox(width: 4),
                  Text('${r.readingStreak}', style: display(context, size: 14, weight: FontWeight.w700)),
                  const SizedBox(width: 4),
                  Text('day streak', style: TextStyle(color: c.inkSoft, fontSize: 10, fontWeight: FontWeight.w600)),
                ]),
              ),
            ]),
            const SizedBox(height: 20),
            Divider(color: c.line, height: 1),
            const SizedBox(height: 22),
            Center(
              child: Column(children: [
                Text(r.bookName, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: amharic(context, size: 23, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('ምዕራፍ ${r.chapter}', style: display(context, size: 15, italic: true, color: c.brand)),
                const SizedBox(height: 10),
                Container(width: 44, height: 2,
                    decoration: BoxDecoration(color: c.gold.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(2))),
              ]),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final row in verseRows(r.verses))
                VerseTile(
                  label: row.label,
                  text: row.text,
                  size: size,
                  selected: widget.selStart != null &&
                      row.end >= widget.selStart! &&
                      row.start <= widget.selEnd!,
                  onTap: () => widget.onTapVerse(row.start),
                ),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.line))),
          padding: const EdgeInsets.all(14),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: (_done || _busy) ? null : _markRead,
              style: FilledButton.styleFrom(
                backgroundColor: _done ? c.good.withValues(alpha: 0.15) : c.brand,
                foregroundColor: _done ? c.good : c.brandInk,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(_done ? '✓ Read today' : (_busy ? '…' : 'Mark as read')),
            ),
          ),
        ),
      ]),
    );
  }
}
