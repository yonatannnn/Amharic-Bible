import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../theme.dart';
import '../state/settings.dart';
import '../services/bible.dart';
import '../services/friends.dart';
import '../widgets/verse_share.dart';
import '../providers.dart';
import 'verse_image.dart';

/// A focused reader for sharing a verse/range straight into one chat.
class VersePickerScreen extends ConsumerStatefulWidget {
  final String friendshipId;
  final FriendInfo friend;
  const VersePickerScreen({super.key, required this.friendshipId, required this.friend});
  @override
  ConsumerState<VersePickerScreen> createState() => _VersePickerScreenState();
}

class _VersePickerScreenState extends ConsumerState<VersePickerScreen> {
  final _bible = BibleService.instance;
  List<BookRef>? _books;
  int? _book;
  Book? _bookData;
  int? _chapter;
  bool _loading = false;
  String _filter = '';
  int? _selStart, _selEnd;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _bible.getBooks().then((b) => mounted ? setState(() => _books = b) : null);
  }

  Future<void> _openBook(int num) async {
    setState(() { _book = num; _bookData = null; _chapter = null; _loading = true; });
    final b = await _bible.getBook(num);
    if (mounted) setState(() { _bookData = b; _loading = false; });
  }

  void _goChapter(int ch) => setState(() { _chapter = ch; _selStart = _selEnd = null; });

  void _back() {
    setState(() {
      if (_chapter != null) {
        _chapter = null;
      } else if (_book != null) {
        _book = null;
        _bookData = null;
      } else {
        Navigator.pop(context);
      }
    });
  }

  void _tapVerse(int n) {
    setState(() {
      final r = nextSelection(_selStart, _selEnd, n);
      _selStart = r[0];
      _selEnd = r[1];
    });
  }

  Future<void> _send([String? friendshipId]) async {
    setState(() => _sending = true);
    await FriendsService.instance
        .shareVerse(friendshipId ?? widget.friendshipId, _book!, _chapter!, _selStart!, _selEnd!);
    if (!mounted) return;
    Navigator.pop(context);
  }

  void _moreSheet() {
    final c = colorsOf(context);
    final verses = _bookData!.chapters[_chapter! - 1].verses;
    final s = _selStart!, e = _selEnd!;
    final text = verses.sublist(s - 1, e).where((t) => t.trim().isNotEmpty).join(' ');
    final refLabel = '${_bookData!.title} $_chapter:${s == e ? '$s' : '$s-$e'}';
    final allFriends = ref.read(friendsProvider).asData?.value ?? [];
    final others = allFriends.where((f) => f.friendshipId != widget.friendshipId).toList();
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.85),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(height: 12),
            if (others.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('SEND TO ANOTHER FRIEND',
                      style: TextStyle(color: c.inkFaint, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                ),
              ),
              const SizedBox(height: 4),
              for (final f in others)
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: c.good,
                    backgroundImage: f.avatarUrl != null ? NetworkImage(f.avatarUrl!) : null,
                    child: f.avatarUrl == null ? Text(f.display[0].toUpperCase(), style: const TextStyle(color: Colors.white)) : null,
                  ),
                  title: Text(f.display, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text('🔥 ${f.streakCount}', style: TextStyle(color: c.inkSoft)),
                  onTap: () { Navigator.pop(ctx); _send(f.friendshipId); },
                ),
              Divider(color: c.line, height: 20),
            ],
            ListTile(
              leading: Icon(Icons.image_outlined, color: c.ink),
              title: const Text('Make image'),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.push(context, MaterialPageRoute(
                  builder: (_) => VerseImageScreen(ref: refLabel, text: text),
                ));
              },
            ),
            ListTile(
              leading: Icon(Icons.copy, color: c.ink),
              title: const Text('Copy'),
              onTap: () { Clipboard.setData(ClipboardData(text: '“$text”\n— $refLabel')); Navigator.pop(ctx); },
            ),
            ListTile(
              leading: Icon(Icons.ios_share, color: c.ink),
              title: const Text('Share externally'),
              onTap: () { SharePlus.instance.share(ShareParams(text: '“$text”\n— $refLabel')); Navigator.pop(ctx); },
            ),
            const SizedBox(height: 12),
          ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final title = _book == null
        ? 'Share a verse'
        : _chapter == null
            ? (_bookData?.title ?? 'Book $_book')
            : '${_bookData?.title ?? ''} $_chapter';
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _back),
        title: Text(title, style: amharic(context, size: 17, weight: FontWeight.w700)),
      ),
      body: SafeArea(child: _body(c)),
    );
  }

  Widget _body(AppColors c) {
    if (_book == null) return _booksList(c);
    if (_loading || _bookData == null) return const Center(child: CircularProgressIndicator());
    if (_chapter == null) return _chaptersGrid(c);
    return _reading(c);
  }

  Widget _booksList(AppColors c) {
    if (_books == null) return const Center(child: CircularProgressIndicator());
    final f = _filter.trim().toLowerCase();
    final filtered = f.isEmpty
        ? _books!
        : _books!.where((b) => b.name.toLowerCase().contains(f) || '${b.position}'.contains(f)).toList();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: TextField(
          onChanged: (v) => setState(() => _filter = v),
          decoration: InputDecoration(
            hintText: 'Filter books…',
            prefixIcon: Icon(Icons.search, color: c.inkFaint, size: 20),
            filled: true, fillColor: c.surface2, isDense: true,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.brand)),
          ),
        ),
      ),
      Expanded(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 24),
          itemCount: filtered.length,
          itemBuilder: (_, i) {
            final b = filtered[i];
            return InkWell(
              onTap: () => _openBook(b.num),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Row(children: [
                  Container(
                    width: 30, height: 30, alignment: Alignment.center,
                    decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(9)),
                    child: Text('${b.position}', style: display(context, size: 12, weight: FontWeight.w600, color: c.inkFaint)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(b.name, style: amharic(context, size: 15.5, weight: FontWeight.w500))),
                  Icon(Icons.chevron_right, color: c.inkFaint, size: 20),
                ]),
              ),
            );
          },
        ),
      ),
    ]);
  }

  Widget _chaptersGrid(AppColors c) {
    final chapters = _bookData!.chapters;
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1),
      itemCount: chapters.length,
      itemBuilder: (_, i) => InkWell(
        onTap: () => _goChapter(i + 1),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(12)),
          child: Text('${i + 1}', style: display(context, size: 17, weight: FontWeight.w600, color: c.inkSoft)),
        ),
      ),
    );
  }

  Widget _reading(AppColors c) {
    final verses = _bookData!.chapters[_chapter! - 1].verses;
    final size = settings.readerSize;
    final bookTitle = _bookData!.title.isNotEmpty ? _bookData!.title : 'Book $_book';
    final hasSel = _selStart != null;
    return Stack(children: [
      ListView(
        padding: EdgeInsets.fromLTRB(22, 14, 22, hasSel ? 110 : 40),
        children: [
          Column(children: [
            Text(bookTitle, textAlign: TextAlign.center, style: amharic(context, size: 21, weight: FontWeight.w700)),
            const SizedBox(height: 3),
            Text('ምዕራፍ $_chapter', style: display(context, size: 15, italic: true, color: c.brand)),
            const SizedBox(height: 12),
            Container(width: 44, height: 2, decoration: BoxDecoration(color: c.gold.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(hasSel ? 'Tap another verse to make a range' : 'Tap a verse to send',
                style: TextStyle(color: c.inkFaint, fontSize: 10, letterSpacing: 0.8, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 18),
          for (final row in verseRows(verses))
            VerseTile(
              label: row.label,
              text: row.text,
              size: size,
              selected: hasSel && row.end >= _selStart! && row.start <= _selEnd!,
              onTap: () => _tapVerse(row.start),
            ),
        ],
      ),
      if (hasSel)
        Positioned(
          left: 0, right: 0, bottom: 0,
          child: SafeArea(child: _sendBar(c, verses, bookTitle)),
        ),
    ]);
  }

  Widget _sendBar(AppColors c, List<String> verses, String bookTitle) {
    final s = _selStart!, e = _selEnd!;
    final range = s == e ? '$s' : '$s-$e';
    final text = verses.sublist(s - 1, e).where((t) => t.trim().isNotEmpty).join(' ');
    return Container(
      margin: const EdgeInsets.all(14),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c.line),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Expanded(child: Text('$bookTitle $_chapter:$range', style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 13))),
          GestureDetector(onTap: () => setState(() => _selStart = _selEnd = null), child: Icon(Icons.close, color: c.inkFaint, size: 20)),
        ]),
        const SizedBox(height: 2),
        Align(alignment: Alignment.centerLeft, child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: amharic(context, size: 13, color: c.inkSoft))),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: _sending ? null : () => _send(),
              style: FilledButton.styleFrom(
                backgroundColor: c.brand, foregroundColor: c.brandInk,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: _sending
                  ? SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: c.brandInk))
                  : const Text('🔥', style: TextStyle(fontSize: 15)),
              label: Text('Send to ${widget.friend.display}', maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: _moreSheet,
            tooltip: 'Send to someone else',
            style: IconButton.styleFrom(
              backgroundColor: c.surface2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: Icon(Icons.more_horiz, color: c.inkSoft),
          ),
        ]),
      ]),
    );
  }
}
