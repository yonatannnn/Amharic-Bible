import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/bible.dart';
import '../services/friends.dart';
import '../widgets/friend_avatar.dart';
import '../widgets/emoji_picker.dart';
import 'verse_picker.dart';

class ChatThreadScreen extends StatefulWidget {
  final String friendshipId;
  final FriendInfo friend;
  const ChatThreadScreen({super.key, required this.friendshipId, required this.friend});
  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _msgs = <Map<String, dynamic>>[];
  /// messageId -> list of {user_id, emoji}
  final _reactions = <String, List<Map<String, dynamic>>>{};
  final _text = TextEditingController();
  final _scroll = ScrollController();
  RealtimeChannel? _channel;
  int _streak = 0;
  bool _loaded = false;
  bool _broken = false;
  DateTime? _brokenAt;
  int _restoresLeft = 3;
  bool _restoring = false;
  String get _uid => supabase.auth.currentUser!.id;

  String get _thisMonth =>
      '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}';
  bool get _restorable =>
      _broken && _brokenAt != null &&
      DateTime.now().isBefore(_brokenAt!.add(const Duration(hours: 48))) && _restoresLeft > 0;

  @override
  void initState() {
    super.initState();
    _streak = widget.friend.streakCount;
    _load();
    _loadReactions();
    _subscribe();
    _refreshStreak();
  }

  Future<void> _restore() async {
    setState(() => _restoring = true);
    final ok = await supabase.rpc('restore_streak', params: {'p_friendship': widget.friendshipId});
    if (!mounted) return;
    setState(() => _restoring = false);
    await _refreshStreak();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok == true ? 'Streak restored 🔥' : 'Couldn\'t restore — the 48h window may have passed.'),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final rows = await supabase
        .from('messages')
        .select()
        .eq('friendship_id', widget.friendshipId)
        .order('created_at', ascending: true)
        .limit(300);
    if (!mounted) return;
    setState(() {
      _loaded = true;
      _msgs
        ..clear()
        ..addAll((rows as List).cast<Map<String, dynamic>>());
    });
    _markRead();
    // No scroll needed: the reversed list opens at the newest message.
  }

  Future<void> _loadReactions() async {
    final rows = await supabase
        .from('message_reactions')
        .select('message_id,user_id,emoji')
        .eq('friendship_id', widget.friendshipId);
    if (!mounted) return;
    setState(() {
      _reactions.clear();
      for (final r in (rows as List).cast<Map<String, dynamic>>()) {
        _reactions.putIfAbsent(r['message_id'] as String, () => [])
            .add({'user_id': r['user_id'], 'emoji': r['emoji']});
      }
    });
  }

  /// Apply a single realtime reaction change to local state.
  void _applyReaction(PostgresChangePayload payload) {
    final isDelete = payload.eventType == PostgresChangeEvent.delete;
    final rec = isDelete ? payload.oldRecord : payload.newRecord;
    final msgId = rec['message_id'] as String?;
    final userId = rec['user_id'] as String?;
    if (msgId == null || userId == null) return;
    setState(() {
      final list = _reactions.putIfAbsent(msgId, () => []);
      list.removeWhere((x) => x['user_id'] == userId);
      if (!isDelete) {
        list.add({'user_id': userId, 'emoji': rec['emoji']});
      }
      if (list.isEmpty) _reactions.remove(msgId);
    });
  }

  /// Toggle/replace the current user's reaction on a message.
  Future<void> _react(String messageId, String emoji) async {
    final mine = _reactions[messageId]?.firstWhere(
      (x) => x['user_id'] == _uid,
      orElse: () => const {},
    );
    final already = mine != null && mine.isNotEmpty ? mine['emoji'] as String? : null;

    // Optimistic local update.
    setState(() {
      final list = _reactions.putIfAbsent(messageId, () => []);
      list.removeWhere((x) => x['user_id'] == _uid);
      if (already != emoji) list.add({'user_id': _uid, 'emoji': emoji});
      if (list.isEmpty) _reactions.remove(messageId);
    });

    if (already == emoji) {
      await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', _uid);
    } else {
      await supabase.from('message_reactions').upsert({
        'message_id': messageId,
        'user_id': _uid,
        'friendship_id': widget.friendshipId,
        'emoji': emoji,
      }, onConflict: 'message_id,user_id');
    }
  }

  void _subscribe() {
    _channel = supabase
        .channel('chat:${widget.friendshipId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'messages',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'friendship_id', value: widget.friendshipId),
          callback: (payload) {
            final m = payload.newRecord;
            if (m.isEmpty) return;
            final idx = _msgs.indexWhere((x) => x['id'] == m['id']);
            if (idx >= 0) {
              setState(() => _msgs[idx] = m); // e.g. read_at updated
              return;
            }
            final atBottom = !_scroll.hasClients || _scroll.offset < 300;
            setState(() => _msgs.add(m));
            if (m['type'] == 'verse') _refreshStreak();
            if (m['sender_id'] != _uid) _markRead();
            if (atBottom) _scrollToBottom();
          },
        )
        // live streak count (covers shares, breaks at 11 AM, and restores)
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'streaks',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'friendship_id', value: widget.friendshipId),
          callback: (_) => _refreshStreak(),
        )
        // live emoji reactions
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'message_reactions',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'friendship_id', value: widget.friendshipId),
          callback: (payload) {
            if (!mounted) return;
            _applyReaction(payload);
          },
        )
        .subscribe();
  }

  Future<void> _refreshStreak() async {
    final s = await supabase
        .from('streaks')
        .select('count, broken, broken_at, restores_remaining, restore_period')
        .eq('friendship_id', widget.friendshipId)
        .maybeSingle();
    if (!mounted || s == null) return;
    setState(() {
      _streak = s['count'] as int;
      _broken = s['broken'] == true;
      _brokenAt = s['broken_at'] != null ? DateTime.tryParse(s['broken_at'] as String) : null;
      _restoresLeft = (s['restore_period'] == _thisMonth) ? (s['restores_remaining'] ?? 3) as int : 3;
    });
  }

  Future<void> _markRead() async {
    await supabase
        .from('messages')
        .update({'read_at': DateTime.now().toIso8601String()})
        .eq('friendship_id', widget.friendshipId)
        .eq('sender_id', widget.friend.friendId)
        .isFilter('read_at', null);
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    _text.clear();
    final data = await supabase.from('messages').insert({
      'friendship_id': widget.friendshipId,
      'sender_id': _uid,
      'type': 'text',
      'text': body,
    }).select().single();
    if (!_msgs.any((x) => x['id'] == data['id'])) {
      setState(() => _msgs.add(data));
      _scrollToBottom();
    }
  }

  void _shareVerse() {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => VersePickerScreen(friendshipId: widget.friendshipId, friend: widget.friend),
    ));
  }

  /// Quick-access emojis shown as a row at the top of the actions sheet.
  static const _quickEmojis = ['❤️', '😂', '🙏', '🔥', '😮', '😢', '👍'];

  /// Actions for any message (long-press): react, copy, and (own text) edit.
  void _messageActions(Map<String, dynamic> msg) {
    final c = colorsOf(context);
    final id = msg['id'] as String;
    final mine = msg['sender_id'] == _uid;
    final isText = msg['type'] == 'text';
    final myEmoji = _reactions[id]
        ?.firstWhere((x) => x['user_id'] == _uid, orElse: () => const {})['emoji'] as String?;

    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 12),
          // Quick reaction row.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Wrap(alignment: WrapAlignment.spaceEvenly, spacing: 4, runSpacing: 4, children: [
              for (final e in _quickEmojis)
                GestureDetector(
                  onTap: () { Navigator.pop(ctx); _react(id, e); },
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: myEmoji == e ? c.brand.withValues(alpha: 0.16) : Colors.transparent,
                      shape: BoxShape.circle,
                    ),
                    child: Text(e, style: const TextStyle(fontSize: 26)),
                  ),
                ),
              GestureDetector(
                onTap: () async {
                  Navigator.pop(ctx);
                  final picked = await showEmojiPicker(context);
                  if (picked != null) _react(id, picked);
                },
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: c.surface2, shape: BoxShape.circle),
                  child: Icon(Icons.add, size: 24, color: c.inkSoft),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 6),
          Divider(color: c.line, height: 1),
          if (mine && isText)
            ListTile(
              leading: Icon(Icons.edit_outlined, color: c.ink),
              title: const Text('Edit message'),
              onTap: () { Navigator.pop(ctx); _editMessage(msg); },
            ),
          ListTile(
            leading: Icon(Icons.copy, color: c.ink),
            title: const Text('Copy'),
            onTap: () { Navigator.pop(ctx); _copyMessage(msg); },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  /// Copy any message to the clipboard and confirm with a SnackBar.
  Future<void> _copyMessage(Map<String, dynamic> msg) async {
    String text;
    if (msg['type'] == 'verse') {
      final name = BibleService.instance.bookNameSync(msg['book'] as int) ?? 'Book ${msg['book']}';
      final start = msg['verse_start'];
      final end = msg['verse_end'];
      final range = (end != null && end != start) ? '$start-$end' : '$start';
      String body = '';
      try {
        final b = await BibleService.instance.getBook(msg['book'] as int);
        final ch = b.chapters[(msg['chapter'] as int) - 1];
        final s = (msg['verse_start'] as int) - 1;
        final e = (msg['verse_end'] as int? ?? msg['verse_start'] as int) - 1;
        body = ch.verses.sublist(s, e + 1).join(' ');
      } catch (_) {}
      text = '$name ${msg['chapter']}:$range — $body'.trim();
    } else {
      text = msg['text'] as String? ?? '';
    }
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Copied'),
      behavior: SnackBarBehavior.floating,
      duration: Duration(seconds: 1),
    ));
  }

  Future<void> _editMessage(Map<String, dynamic> msg) async {
    final c = colorsOf(context);
    final ctl = TextEditingController(text: msg['text'] as String? ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: const Text('Edit message'),
        content: TextField(
          controller: ctl,
          autofocus: true,
          maxLines: null,
          decoration: InputDecoration(
            filled: true, fillColor: c.surface2,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.brand)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctl.text.trim()),
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (result == null || result.isEmpty || result == msg['text']) return;
    final idx = _msgs.indexWhere((x) => x['id'] == msg['id']);
    if (idx >= 0) setState(() => _msgs[idx] = {..._msgs[idx], 'text': result});
    await supabase.from('messages').update({'text': result}).eq('id', msg['id'] as String);
  }

  // With a reversed list, the newest message sits at offset 0 (the bottom).
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(0, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        titleSpacing: 0,
        title: Row(children: [
          FriendAvatar(friend: widget.friend, radius: 18),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(widget.friend.display, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text('@${widget.friend.username}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: c.inkFaint, fontWeight: FontWeight.normal)),
          ])),
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [c.ember.withValues(alpha: 0.22), c.brand.withValues(alpha: 0.15)]),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('🔥 $_streak', style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ]),
      ),
      body: Column(children: [
        if (_restorable) _restoreBanner(c),
        Expanded(
          child: Container(
            color: c.canvas,
            child: !_loaded
                ? const Center(child: CircularProgressIndicator())
                : _msgs.isEmpty
                    ? _emptyState(c)
                    : ListView(
                        controller: _scroll,
                        reverse: true,
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                        children: _buildItems(c).reversed.toList(),
                      ),
          ),
        ),
        _composer(c),
      ]),
    );
  }

  Widget _restoreBanner(AppColors c) {
    return Container(
      color: c.ember.withValues(alpha: 0.14),
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      child: Row(children: [
        const Text('💔', style: TextStyle(fontSize: 18)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text('Your $_streak-day streak broke', style: TextStyle(color: c.ink, fontWeight: FontWeight.w700, fontSize: 13)),
          Text('$_restoresLeft restore${_restoresLeft == 1 ? '' : 's'} left this month', style: TextStyle(color: c.inkSoft, fontSize: 11)),
        ])),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: _restoring ? null : _restore,
          style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, visualDensity: VisualDensity.compact),
          child: Text(_restoring ? '…' : 'Restore'),
        ),
      ]),
    );
  }

  Widget _emptyState(AppColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('✦', style: display(context, size: 44, color: c.gold.withValues(alpha: 0.5))),
          const SizedBox(height: 12),
          Text('Share a verse to begin', style: amharic(context, size: 18, weight: FontWeight.w700), textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text('Send ${widget.friend.display} a verse each day to keep your streak alive.',
              textAlign: TextAlign.center, style: TextStyle(color: c.inkSoft)),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _shareVerse,
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
            icon: const Text('📖'),
            label: const Text('Share a verse'),
          ),
        ]),
      ),
    );
  }

  List<Widget> _buildItems(AppColors c) {
    final items = <Widget>[];
    DateTime? lastDay;
    for (var i = 0; i < _msgs.length; i++) {
      final m = _msgs[i];
      final dt = DateTime.parse(m['created_at'] as String).toLocal();
      final day = DateTime(dt.year, dt.month, dt.day);
      if (lastDay == null || day != lastDay) {
        items.add(_DateSeparator(day: day));
        lastDay = day;
      }
      final mine = m['sender_id'] == _uid;
      final next = i + 1 < _msgs.length ? _msgs[i + 1] : null;
      final nextDt = next != null ? DateTime.parse(next['created_at'] as String).toLocal() : null;
      final showMeta = next == null ||
          next['sender_id'] != m['sender_id'] ||
          nextDt!.difference(dt).inMinutes.abs() > 4 ||
          DateTime(nextDt.year, nextDt.month, nextDt.day) != day;
      items.add(_Bubble(
        msg: m,
        mine: mine,
        showMeta: showMeta,
        reactions: _reactions[m['id']] ?? const [],
        myId: _uid,
        onLongPress: () => _messageActions(m),
        onReactionTap: (emoji) => _react(m['id'] as String, emoji),
      ));
    }
    return items;
  }

  Widget _composer(AppColors c) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.line))),
        padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
        child: Row(children: [
          IconButton(
            onPressed: _shareVerse,
            tooltip: 'Share a verse',
            icon: const Text('📖', style: TextStyle(fontSize: 20)),
          ),
          Expanded(
            child: TextField(
              controller: _text,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(),
              minLines: 1,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Message…', filled: true, fillColor: c.surface2, isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.brand)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _send,
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, shape: const CircleBorder(), padding: const EdgeInsets.all(12)),
            child: const Icon(Icons.arrow_upward, size: 20),
          ),
        ]),
      ),
    );
  }
}

class _DateSeparator extends StatelessWidget {
  final DateTime day;
  const _DateSeparator({required this.day});

  String _label() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    if (diff < 7) return DateFormat('EEEE').format(day);
    return DateFormat('MMM d, y').format(day);
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(color: c.surface2, borderRadius: BorderRadius.circular(20)),
        child: Text(_label(), style: TextStyle(color: c.inkSoft, fontSize: 11, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Map<String, dynamic> msg;
  final bool mine;
  final bool showMeta;
  final List<Map<String, dynamic>> reactions;
  final String myId;
  final VoidCallback? onLongPress;
  final ValueChanged<String>? onReactionTap;
  const _Bubble({
    required this.msg,
    required this.mine,
    required this.showMeta,
    this.reactions = const [],
    required this.myId,
    this.onLongPress,
    this.onReactionTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final type = msg['type'] as String;
    final maxW = MediaQuery.of(context).size.width * 0.76;

    Widget content;
    if (type == 'verse') {
      content = _VerseBubble(msg: msg, mine: mine, maxWidth: maxW);
    } else if (type == 'image' && msg['image_url'] != null) {
      content = ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network(msg['image_url'] as String, width: 220));
    } else {
      content = Container(
        constraints: BoxConstraints(maxWidth: maxW),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? c.brand : c.surface,
          border: mine ? null : Border.all(color: c.line),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18), topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(mine ? 18 : 5), bottomRight: Radius.circular(mine ? 5 : 18),
          ),
        ),
        child: Text(msg['text'] as String? ?? '', style: TextStyle(color: mine ? c.brandInk : c.ink, fontSize: 15, height: 1.3)),
      );
    }

    if (onLongPress != null) {
      content = GestureDetector(
        onLongPress: () { HapticFeedback.mediumImpact(); onLongPress!(); },
        child: content,
      );
    }

    final time = DateFormat('h:mm a').format(DateTime.parse(msg['created_at'] as String).toLocal());
    final read = msg['read_at'] != null;
    return Padding(
      padding: EdgeInsets.only(bottom: showMeta ? 8 : 2, top: 1),
      child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        content,
        if (reactions.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Wrap(
              spacing: 4,
              children: [
                for (final r in reactions)
                  GestureDetector(
                    onTap: (r['user_id'] == myId && onReactionTap != null)
                        ? () { HapticFeedback.selectionClick(); onReactionTap!(r['emoji'] as String); }
                        : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: r['user_id'] == myId ? c.brand.withValues(alpha: 0.14) : c.surface2,
                        border: Border.all(
                          color: r['user_id'] == myId ? c.brand.withValues(alpha: 0.4) : c.line,
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(r['emoji'] as String, style: const TextStyle(fontSize: 14)),
                    ),
                  ),
              ],
            ),
          ),
        if (showMeta)
          Padding(
            padding: const EdgeInsets.only(top: 3, left: 6, right: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(time, style: TextStyle(color: c.inkFaint, fontSize: 10)),
              if (mine) ...[
                const SizedBox(width: 4),
                Icon(read ? Icons.done_all : Icons.done, size: 13, color: read ? c.gold : c.inkFaint),
              ],
            ]),
          ),
      ]),
    );
  }
}

class _VerseBubble extends StatefulWidget {
  final Map<String, dynamic> msg;
  final bool mine;
  final double maxWidth;
  const _VerseBubble({required this.msg, required this.mine, required this.maxWidth});
  @override
  State<_VerseBubble> createState() => _VerseBubbleState();
}

class _VerseBubbleState extends State<_VerseBubble> {
  String? _text;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    try {
      final b = await BibleService.instance.getBook(widget.msg['book'] as int);
      final ch = b.chapters[(widget.msg['chapter'] as int) - 1];
      final s = (widget.msg['verse_start'] as int) - 1;
      final e = (widget.msg['verse_end'] as int? ?? widget.msg['verse_start'] as int) - 1;
      if (mounted) setState(() => _text = ch.verses.sublist(s, e + 1).join(' '));
    } catch (_) {
      if (mounted) setState(() => _text = '…');
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final m = widget.msg;
    final range = (m['verse_end'] != null && m['verse_end'] != m['verse_start'])
        ? '${m['verse_start']}-${m['verse_end']}'
        : '${m['verse_start']}';
    final name = BibleService.instance.bookNameSync(m['book'] as int) ?? 'Book ${m['book']}';
    return Container(
      constraints: BoxConstraints(maxWidth: widget.maxWidth),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [c.brand.withValues(alpha: 0.16), c.gold.withValues(alpha: 0.07)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        border: Border.all(color: c.brand.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisSize: MainAxisSize.min, children: [
          Text('✦ ', style: TextStyle(color: c.gold, fontWeight: FontWeight.w700, fontSize: 12)),
          Flexible(child: Text('$name ${m['chapter']}:$range',
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 12.5))),
        ]),
        const SizedBox(height: 8),
        Text(_text ?? '…', style: amharic(context, size: 15, height: 1.6)),
      ]),
    );
  }
}
