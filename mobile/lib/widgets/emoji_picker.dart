import 'package:flutter/material.dart';
import '../theme.dart';

/// A self-contained, categorized emoji picker. Several hundred emojis grouped
/// into scrollable categories — no pub dependency required.
///
/// Use [showEmojiPicker] to present it as a modal bottom sheet; it resolves
/// with the chosen emoji (or null if dismissed).
Future<String?> showEmojiPicker(BuildContext context) {
  final c = colorsOf(context);
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: c.surface,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => const FractionallySizedBox(
      heightFactor: 0.72,
      child: EmojiPicker(),
    ),
  );
}

class _EmojiCategory {
  final String label;
  final String icon;
  final List<String> emojis;
  const _EmojiCategory(this.label, this.icon, this.emojis);
}

/// A full, categorized emoji grid. Pops the enclosing route with the tapped
/// emoji via [Navigator.pop]. Can also be embedded; pass [onSelected] to
/// receive taps directly instead of popping.
class EmojiPicker extends StatefulWidget {
  final ValueChanged<String>? onSelected;
  const EmojiPicker({super.key, this.onSelected});

  @override
  State<EmojiPicker> createState() => _EmojiPickerState();
}

class _EmojiPickerState extends State<EmojiPicker> {
  int _index = 0;
  final _scroll = ScrollController();

  void _pick(String e) {
    if (widget.onSelected != null) {
      widget.onSelected!(e);
    } else {
      Navigator.of(context).pop(e);
    }
  }

  void _jump(int i) {
    setState(() => _index = i);
    if (_scroll.hasClients) {
      _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final cat = _categories[_index];
    return SafeArea(
      top: false,
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(color: c.line, borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(children: [
              Text('Emoji', style: TextStyle(color: c.ink, fontSize: 16, fontWeight: FontWeight.w700)),
              const Spacer(),
              Flexible(child: Text(cat.label, textAlign: TextAlign.end, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkSoft, fontSize: 12, fontWeight: FontWeight.w600))),
            ]),
          ),
          Expanded(
            child: GridView.builder(
              controller: _scroll,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 48,
                mainAxisSpacing: 2,
                crossAxisSpacing: 2,
              ),
              itemCount: cat.emojis.length,
              itemBuilder: (ctx, i) {
                final e = cat.emojis[i];
                return InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => _pick(e),
                  child: Center(child: Text(e, style: const TextStyle(fontSize: 26))),
                );
              },
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: c.surface,
              border: Border(top: BorderSide(color: c.line)),
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
              child: Row(
                children: [
                  for (var i = 0; i < _categories.length; i++)
                    GestureDetector(
                      onTap: () => _jump(i),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: i == _index ? c.brand.withValues(alpha: 0.15) : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(_categories[i].icon, style: const TextStyle(fontSize: 20)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

const List<_EmojiCategory> _categories = [
  _EmojiCategory('Smileys & People', '😀', [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎',
    '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐',
    '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱',
    '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑',
    '😲', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩',
    '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '🥴', '😠', '😡',
    '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳', '🥺', '🤠', '🤡',
    '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👹', '👺', '💀', '👻', '👽',
    '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉',
    '🙊', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '🙍',
    '🙎', '🙅', '🙆', '💁', '🙋', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '👷',
    '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🎅', '🤶', '🦸', '🦹',
  ]),
  _EmojiCategory('Gestures', '👍', [
    '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '👏', '🙌', '👐',
    '🤲', '🙏', '✊', '👊', '🤛', '🤜', '💪', '🦾', '✍️', '💅', '🤳', '👂',
    '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸', '❤️',
    '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞',
    '💓', '💗', '💖', '💘', '💝', '💟', '💌', '💢', '💥', '💫', '💦', '💨',
  ]),
  _EmojiCategory('Animals & Nature', '🐶', [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
    '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺',
    '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️',
    '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡',
    '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧',
    '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖',
    '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🦚', '🦜',
    '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎋', '🍃', '🍂',
    '🍁', '🌾', '🌺', '🌻', '🌹', '🥀', '🌷', '🌸', '💐', '🍄', '🌰', '🌍',
    '🌙', '⭐', '🌟', '✨', '⚡', '☄️', '🔥', '🌈', '☀️', '⛅', '☁️', '❄️',
  ]),
  _EmojiCategory('Food & Drink', '🍎', [
    '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑',
    '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽',
    '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳',
    '🧇', '🥞', '🧈', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪',
    '🌮', '🌯', '🥙', '🧆', '🥗', '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱',
    '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🍢', '🍡', '🍧', '🍨', '🍦',
    '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰',
    '☕', '🍵', '🧃', '🥤', '🍶', '🍺', '🍷', '🥂', '🥃', '🍸', '🍹', '🧉',
  ]),
  _EmojiCategory('Activities & Objects', '⚽', [
    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓',
    '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🪁', '🎣', '🤿', '🎽', '🛹', '🛼',
    '🥌', '🎿', '⛷️', '🏂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🏌️', '🏇', '🧘',
    '🏄', '🏊', '🤽', '🚣', '🧗', '🚴', '🚵', '🎪', '🎭', '🎨', '🎬', '🎤',
    '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯',
    '🎳', '🎮', '🎰', '🧩', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💾', '📷',
    '📸', '📹', '🎥', '📞', '☎️', '📺', '📻', '⏰', '⏳', '💡', '🔦', '🕯️',
    '📚', '📖', '📝', '✏️', '🖊️', '🖌️', '📌', '📎', '✂️', '🔒', '🔑', '🔨',
  ]),
  _EmojiCategory('Symbols', '❤️', [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯', '✅', '❌',
    '⭕', '🚫', '❗', '❓', '❕', '❔', '‼️', '⁉️', '💤', '🆗', '🆒', '🆕',
    '🔝', '🔥', '⭐', '🌟', '✨', '⚡', '☀️', '🌙', '🎉', '🎊', '🎁', '🎈',
    '🔔', '🔕', '🎵', '🎶', '➕', '➖', '✖️', '➗', '♾️', '💲', '💱', '™️',
    '©️', '®️', '〽️', '⚠️', '🔰', '♻️', '✳️', '❇️', '✴️', '🔱', '⚜️', '🔆',
    '🕉️', '✡️', '☸️', '☯️', '✝️', '☦️', '☪️', '☮️', '🕎', '🔯', '⛎', '♈',
  ]),
  _EmojiCategory('Faith', '🙏', [
    '🙏', '✝️', '✦', '✨', '🕊️', '😇', '👼', '😌', '🥹', '❤️', '🔥', '⭐',
    '🌟', '💫', '📖', '📜', '🕯️', '⛪', '🛐', '☦️', '✡️', '🕎', '☮️', '🤲',
    '💐', '🌸', '🌅', '🌄', '🌊', '⛰️', '🌾', '🌿', '☘️', '🍞', '🍇', '🐑',
  ]),
];
