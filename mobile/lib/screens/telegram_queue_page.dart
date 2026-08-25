import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme.dart';
import '../state/settings.dart';
import '../services/bible.dart';
import '../services/daily.dart';
import 'admin_verse_picker.dart';

class _QItem {
  final int id, book, chapter, verse;
  final String source;
  String ref = '';
  String text = '';
  _QItem(this.id, this.book, this.chapter, this.verse, this.source);
}

/// Admin-only: manage the queue of verses for the daily 6 AM Telegram broadcast.
class TelegramQueuePage extends StatefulWidget {
  const TelegramQueuePage({super.key});
  @override
  State<TelegramQueuePage> createState() => _TelegramQueuePageState();
}

class _TelegramQueuePageState extends State<TelegramQueuePage> {
  final _bible = BibleService.instance;
  List<_QItem>? _items;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await DailyService.instance.listTelegramQueue();
    final items = <_QItem>[];
    for (final r in rows) {
      final it = _QItem(r['id'] as int, r['book'] as int, r['chapter'] as int, r['verse'] as int,
          (r['source'] as String?) ?? 'manual');
      try {
        final b = await _bible.getBook(it.book);
        it.ref = '${b.title} ${it.chapter}:${it.verse}';
        final ch = b.chapters[it.chapter - 1];
        it.text = ch.verses[(it.verse - 1).clamp(0, ch.verses.length - 1)];
      } catch (_) {
        it.ref = 'Book ${it.book} ${it.chapter}:${it.verse}';
      }
      items.add(it);
    }
    if (mounted) setState(() => _items = items);
  }

  Future<void> _addManual() async {
    final sel = await Navigator.push<Map>(context,
        MaterialPageRoute(builder: (_) => const AdminVersePicker(title: 'Add to queue', confirmLabel: 'Add')));
    if (sel == null) return;
    await DailyService.instance.addToTelegramQueue(sel['book'], sel['chapter'], sel['verse']);
    await _load();
  }

  Future<void> _generateAi() async {
    setState(() => _busy = true);
    final n = await DailyService.instance.generateAiVerses(5);
    await _load();
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(n > 0 ? '✨ Added $n AI verse${n == 1 ? '' : 's'} to the queue' : 'Could not generate verses'),
    ));
  }

  Future<void> _remove(_QItem it) async {
    setState(() => _items!.remove(it));
    await DailyService.instance.removeFromTelegramQueue(it.id);
  }

  Future<void> _sendNow(_QItem it) async {
    final c = colorsOf(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: const Text('Send now?'),
        content: Text('Broadcasts ${it.ref} to all Telegram subscribers right now, and removes it from the queue.',
            style: TextStyle(color: c.inkSoft, fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
            child: const Text('Send'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    final sent = await DailyService.instance.sendVerseNow(id: it.id, book: it.book, chapter: it.chapter, verse: it.verse);
    await _load();
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(sent != null ? '📤 Sent to $sent subscriber${sent == 1 ? '' : 's'}' : 'Send failed'),
    ));
  }

  Future<void> _onReorder(int oldI, int newI) async {
    setState(() {
      if (newI > oldI) newI -= 1;
      final it = _items!.removeAt(oldI);
      _items!.insert(newI, it);
    });
    HapticFeedback.selectionClick();
    await DailyService.instance.reorderTelegramQueue(_items!.map((e) => e.id).toList());
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final items = _items;
    return Scaffold(
      backgroundColor: c.canvas,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        title: Text('Telegram queue', style: display(context, size: 18, weight: FontWeight.w700)),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(children: [
          if (_busy) const LinearProgressIndicator(minHeight: 2),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: c.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.line)),
              child: Row(children: [
                Icon(Icons.schedule_rounded, size: 18, color: c.gold),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  'The top verse is sent to subscribers daily at 6:00 AM EAT, then removed. Drag to reorder; if empty, an AI verse is sent.',
                  style: TextStyle(color: c.inkSoft, fontSize: 12.5, height: 1.4))),
              ]),
            ),
          ),
          Expanded(
            child: items == null
                ? const Center(child: CircularProgressIndicator())
                : items.isEmpty
                    ? _empty(c)
                    : ReorderableListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
                        itemCount: items.length,
                        onReorder: _onReorder,
                        itemBuilder: (_, i) => _tile(c, items[i], i),
                      ),
          ),
          _bottomBar(c),
        ]),
      ),
    );
  }

  Widget _empty(AppColors c) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.queue_music_rounded, size: 48, color: c.inkFaint),
            const SizedBox(height: 12),
            Text('Queue is empty', style: display(context, size: 17, weight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('Add verses or generate with AI. If the queue is empty at 6 AM, one AI verse is sent automatically.',
                textAlign: TextAlign.center, style: TextStyle(color: c.inkSoft, fontSize: 13, height: 1.4)),
          ]),
        ),
      );

  Widget _tile(AppColors c, _QItem it, int index) {
    final isAi = it.source == 'ai';
    return Container(
      key: ValueKey(it.id),
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: c.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.line)),
      child: InkWell(
        onTap: () => _showVerse(it),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 26, height: 26, alignment: Alignment.center,
            decoration: BoxDecoration(
              color: index == 0 ? c.brand : c.surface2,
              borderRadius: BorderRadius.circular(8)),
            child: Text('${index + 1}',
                style: display(context, size: 12, weight: FontWeight.w700,
                    color: index == 0 ? c.brandInk : c.inkFaint)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(it.ref, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 13))),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: (isAi ? c.gold : c.inkFaint).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(20)),
                  child: Text(isAi ? '✨ AI' : 'manual',
                      style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700,
                          color: isAi ? c.gold : c.inkSoft)),
                ),
              ]),
              const SizedBox(height: 3),
              Text(it.text, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: amharic(context, size: 13.5, height: 1.4, color: c.inkSoft)),
            ]),
          ),
          PopupMenuButton<String>(
            icon: Icon(Icons.more_vert, size: 20, color: c.inkFaint),
            color: c.surface,
            onSelected: (v) => v == 'send' ? _sendNow(it) : _remove(it),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'send', child: Row(children: [
                Icon(Icons.send_rounded, size: 18), SizedBox(width: 10), Text('Send now')])),
              const PopupMenuItem(value: 'remove', child: Row(children: [
                Icon(Icons.delete_outline, size: 18), SizedBox(width: 10), Text('Remove')])),
            ],
          ),
          ReorderableDragStartListener(
            index: index,
            child: Padding(
              padding: const EdgeInsets.only(top: 4, right: 4, left: 2),
              child: Icon(Icons.drag_handle, size: 20, color: c.inkFaint),
            ),
          ),
        ]),
      ),
      ),
    );
  }

  void _showVerse(_QItem it) {
    final c = colorsOf(context);
    final isAi = it.source == 'ai';
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.5,
        maxChildSize: 0.9,
        minChildSize: 0.3,
        builder: (_, scroll) => Padding(
          padding: const EdgeInsets.fromLTRB(22, 12, 22, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 38, height: 4,
                decoration: BoxDecoration(color: c.line, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: Text(it.ref,
                  style: TextStyle(color: c.brand, fontWeight: FontWeight.w800, fontSize: 15))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (isAi ? c.gold : c.inkFaint).withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(20)),
                child: Text(isAi ? '✨ AI' : 'manual',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isAi ? c.gold : c.inkSoft)),
              ),
            ]),
            Container(height: 1, margin: const EdgeInsets.symmetric(vertical: 14), color: c.line),
            Expanded(
              child: SingleChildScrollView(
                controller: scroll,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Text(it.text, style: amharic(context, size: settings.readerSize, height: 1.85)),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _bottomBar(AppColors c) => Container(
        padding: EdgeInsets.fromLTRB(14, 10, 14, 10 + MediaQuery.of(context).padding.bottom),
        decoration: BoxDecoration(
          color: c.surface, border: Border(top: BorderSide(color: c.line))),
        child: Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _busy ? null : _addManual,
              icon: const Icon(Icons.add, size: 18),
              style: OutlinedButton.styleFrom(
                foregroundColor: c.ink, side: BorderSide(color: c.line),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
              label: const Text('Add verse'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.icon(
              onPressed: _busy ? null : _generateAi,
              icon: const Text('✨', style: TextStyle(fontSize: 15)),
              style: FilledButton.styleFrom(
                backgroundColor: c.brand, foregroundColor: c.brandInk,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
              label: const Text('Generate AI'),
            ),
          ),
        ]),
      );
}
