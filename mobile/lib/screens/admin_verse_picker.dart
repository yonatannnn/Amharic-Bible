import 'package:flutter/material.dart';
import '../theme.dart';
import '../state/settings.dart';
import '../services/bible.dart';

/// Admin-only: browse to any verse and return the chosen reference.
/// Pops with a Map {'book','chapter','verse','text'} or null if cancelled.
class AdminVersePicker extends StatefulWidget {
  final String title;
  final String confirmLabel;
  const AdminVersePicker({super.key, this.title = 'Choose a verse', this.confirmLabel = 'Use'});
  @override
  State<AdminVersePicker> createState() => _AdminVersePickerState();
}

class _AdminVersePickerState extends State<AdminVersePicker> {
  final _bible = BibleService.instance;
  List<BookRef>? _books;
  int? _book;
  Book? _bookData;
  int? _chapter;
  bool _loading = false;
  String _filter = '';

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

  Future<void> _pick(int verse, String text) async {
    final c = colorsOf(context);
    final ref = '${_bookData?.title ?? 'Book $_book'} $_chapter:$verse';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: Text('${widget.confirmLabel} this verse?'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(ref, style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Text(text, maxLines: 4, overflow: TextOverflow.ellipsis, style: amharic(context, size: 15, height: 1.5)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
            child: Text(widget.confirmLabel),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    Navigator.pop(context, {'book': _book!, 'chapter': _chapter!, 'verse': verse, 'text': text});
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final title = _book == null
        ? widget.title
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
    final list = f.isEmpty
        ? _books!
        : _books!.where((b) => b.name.toLowerCase().contains(f) || '${b.position}'.contains(f)).toList();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: TextField(
          onChanged: (v) => setState(() => _filter = v),
          decoration: InputDecoration(
            hintText: 'Filter books…', prefixIcon: Icon(Icons.search, size: 18, color: c.inkFaint), isDense: true,
            filled: true, fillColor: c.surface2,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.brand)),
          ),
        ),
      ),
      Expanded(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 24),
          itemCount: list.length,
          itemBuilder: (_, i) {
            final b = list[i];
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
        onTap: () => setState(() => _chapter = i + 1),
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        Text('TAP A VERSE TO ${widget.confirmLabel.toUpperCase()}', style: TextStyle(color: c.inkFaint, fontSize: 10, letterSpacing: 1, fontWeight: FontWeight.w600)),
        const SizedBox(height: 14),
        for (var i = 0; i < verses.length; i++)
          InkWell(
            onTap: () => _pick(i + 1, verses[i]),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
              child: Text.rich(
                TextSpan(children: [
                  WidgetSpan(
                    alignment: PlaceholderAlignment.top,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 5, top: 1),
                      child: Text('${i + 1}', style: TextStyle(fontSize: size * 0.54, color: c.gold.withValues(alpha: 0.7), fontWeight: FontWeight.w800)),
                    ),
                  ),
                  TextSpan(text: verses[i]),
                ]),
                style: amharic(context, size: size, height: 1.78),
              ),
            ),
          ),
      ],
    );
  }
}
