import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../theme.dart';

/// Renders a verse as a shareable image card and shares/saves it as a PNG.
class VerseImageScreen extends StatefulWidget {
  final String ref;
  final String text;
  const VerseImageScreen({super.key, required this.ref, required this.text});
  @override
  State<VerseImageScreen> createState() => _VerseImageScreenState();
}

class _VerseImageScreenState extends State<VerseImageScreen> {
  final _boundaryKey = GlobalKey();
  bool _busy = false;

  // Fixed brand colours so the image looks the same in light or dark mode.
  static const _garnet = Color(0xFF97233A);
  static const _garnetDark = Color(0xFF5E1626);
  static const _gold = Color(0xFFD9AE55);
  static const _cream = Color(0xFFFBF1E7);

  Future<Uint8List?> _capture() async {
    final boundary = _boundaryKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 3.0);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  Future<void> _share() async {
    setState(() => _busy = true);
    try {
      final bytes = await _capture();
      if (bytes == null) return;
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/verse_${DateTime.now().millisecondsSinceEpoch}.png');
      await file.writeAsBytes(bytes);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], text: widget.ref));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not create the image'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.canvas,
        surfaceTintColor: c.canvas,
        elevation: 0,
        title: Text('Verse image', style: display(context, size: 18, weight: FontWeight.w700)),
      ),
      body: Column(children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: RepaintBoundary(key: _boundaryKey, child: _card()),
              ),
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _share,
                style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, padding: const EdgeInsets.symmetric(vertical: 15)),
                icon: _busy
                    ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.brandInk))
                    : const Icon(Icons.ios_share, size: 18),
                label: Text(_busy ? 'Preparing…' : 'Share image'),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _card() {
    return Container(
      width: 340,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_garnet, _garnetDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.format_quote_rounded, color: _gold.withValues(alpha: 0.85), size: 34),
        const SizedBox(height: 8),
        Text(
          widget.text,
          style: GoogleFonts.notoSerifEthiopic(color: _cream, fontSize: 21, height: 1.65, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 20),
        Text('— ${widget.ref}',
            style: GoogleFonts.fraunces(color: _gold, fontSize: 15, fontStyle: FontStyle.italic, fontWeight: FontWeight.w600)),
        const SizedBox(height: 26),
        Container(height: 1, color: _gold.withValues(alpha: 0.35)),
        const SizedBox(height: 14),
        Row(children: [
          Container(
            width: 22, height: 22,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [_garnet, _gold]),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Icon(Icons.add, color: _cream, size: 15),
          ),
          const SizedBox(width: 8),
          Text('መጽሐፍ ቅዱስ',
              style: GoogleFonts.notoSerifEthiopic(color: _cream.withValues(alpha: 0.85), fontSize: 13, fontWeight: FontWeight.w600)),
        ]),
      ]),
    );
  }
}
