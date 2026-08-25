import 'package:flutter/material.dart';
import '../theme.dart';
import '../state/settings.dart';
import '../services/bible.dart';
import '../widgets/verse_share.dart';

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key});
  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  final _bible = BibleService.instance;
  List<BookRef>? _books;
  int? _book;
  Book? _bookData;
  int? _chapter;
  bool _loading = false;
  String _filter = '';
  int? _selStart, _selEnd; // verse range selection

  @override
  void initState() {
    super.initState();
    _bible.getBooks().then((b) => mounted ? setState(() => _books = b) : null);
  }

  Future<void> _openBook(int num) async {
    setState(() {
      _book = num;
      _bookData = null;
      _chapter = null;
      _loading = true;
    });
    final b = await _bible.getBook(num);
    if (mounted) setState(() { _bookData = b; _loading = false; });
  }

  void _back() {
    setState(() {
      if (_chapter != null) {
        _chapter = null;
      } else if (_book != null) {
        _book = null;
        _bookData = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final title = _book == null
        ? 'መጻሕፍት · Books'
        : _chapter == null
            ? (_bookData?.title ?? 'Book $_book')
            : '${_bookData?.title ?? ''} $_chapter';
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        leading: _book == null
            ? null
            : IconButton(icon: const Icon(Icons.arrow_back), onPressed: _back),
        title: Text(title, style: amharic(context, size: 17, weight: FontWeight.w700)),
      ),
      body: SafeArea(child: _body(c)),
    );
  }

  Widget _body(AppColors c) {
    if (_book == null) return _booksList(c);
    if (_loading || _bookData == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_chapter == null) return _chaptersGrid(c);
    return _reading(c);
  }

  Widget _booksList(AppColors c) {
    if (_books == null) return const Center(child: CircularProgressIndicator());
    final f = _filter.trim().toLowerCase();
    final filtered = f.isEmpty
        ? _books!
        : _books!.where((b) => b.name.toLowerCase().contains(f) || '${b.position}'.contains(f)).toList();

    final children = <Widget>[];
    if (f.isEmpty) {
      children.add(_sectionHeader(c, 'ብሉይ ኪዳን · Old Testament'));
      children.addAll(_books!.where((b) => !b.isNewTestament).map((b) => _bookRow(c, b)));
      children.add(_sectionHeader(c, 'አዲስ ኪዳን · New Testament'));
      children.addAll(_books!.where((b) => b.isNewTestament).map((b) => _bookRow(c, b)));
    } else if (filtered.isEmpty) {
      children.add(Padding(
        padding: const EdgeInsets.all(24),
        child: Text('No books match “$_filter”.', style: TextStyle(color: c.inkFaint)),
      ));
    } else {
      children.addAll(filtered.map((b) => _bookRow(c, b)));
    }

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
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(10, 0, 10, 24), children: children)),
    ]);
  }

  Widget _sectionHeader(AppColors c, String t) => Padding(
        padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
        child: Row(children: [
          Container(width: 5, height: 5, decoration: BoxDecoration(color: c.gold, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text(t.toUpperCase(), style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
        ]),
      );

  Widget _bookRow(AppColors c, BookRef b) => InkWell(
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
          decoration: BoxDecoration(
            color: c.surface,
            border: Border.all(color: c.line),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text('${i + 1}', style: display(context, size: 17, weight: FontWeight.w600, color: c.inkSoft)),
        ),
      ),
    );
  }

  void _goChapter(int ch) {
    setState(() {
      _chapter = ch;
      _selStart = _selEnd = null;
    });
  }

  void _tapVerse(int n) {
    setState(() {
      final r = nextSelection(_selStart, _selEnd, n);
      _selStart = r[0];
      _selEnd = r[1];
    });
  }

  Widget _reading(AppColors c) {
    final verses = _bookData!.chapters[_chapter! - 1].verses;
    final total = _bookData!.chapters.length;
    final size = settings.readerSize;
    final bookTitle = _bookData!.title.isNotEmpty ? _bookData!.title : 'Book $_book';
    final hasSel = _selStart != null;

    return Stack(children: [
      ListView(
        padding: EdgeInsets.fromLTRB(22, 14, 22, hasSel ? 120 : 40),
        children: [
          // chapter header
          Column(children: [
            Text(bookTitle, textAlign: TextAlign.center,
                style: amharic(context, size: 21, weight: FontWeight.w700)),
            const SizedBox(height: 3),
            Text('ምዕራፍ $_chapter', style: display(context, size: 15, italic: true, color: c.brand)),
            const SizedBox(height: 12),
            Container(width: 44, height: 2,
                decoration: BoxDecoration(color: c.gold.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(hasSel ? 'Tap another verse to make a range' : 'Tap a verse to share',
                style: TextStyle(color: c.inkFaint, fontSize: 10, letterSpacing: 0.8, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 18),
          for (var i = 0; i < verses.length; i++)
            VerseTile(
              n: i + 1,
              text: verses[i],
              size: size,
              selected: hasSel && (i + 1) >= _selStart! && (i + 1) <= _selEnd!,
              onTap: () => _tapVerse(i + 1),
            ),
          const SizedBox(height: 24),
          Row(children: [
            Expanded(child: OutlinedButton(
              onPressed: _chapter! > 1 ? () => _goChapter(_chapter! - 1) : null,
              child: const Text('← ቀዳሚ'),
            )),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton(
              onPressed: _chapter! < total ? () => _goChapter(_chapter! + 1) : null,
              child: const Text('ቀጣይ →'),
            )),
          ]),
        ],
      ),
      if (hasSel)
        Positioned(
          left: 0, right: 0, bottom: 0,
          child: SafeArea(child: Builder(builder: (_) {
            final s = _selStart!, e = _selEnd!;
            final range = s == e ? '$s' : '$s-$e';
            final text = verses.sublist(s - 1, e).join(' ');
            final ref = '$bookTitle $_chapter:$range';
            return VerseShareBar(
              book: _book!, chapter: _chapter!, start: s, end: e, ref: ref, text: text,
              onClear: () { if (mounted) setState(() => _selStart = _selEnd = null); },
            );
          })),
        ),
    ]);
  }
}
