import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/bible.dart';
import '../services/groups.dart';
import 'group_info.dart';
import 'group_verse_picker.dart';

class GroupThreadScreen extends StatefulWidget {
  final GroupInfo group;
  const GroupThreadScreen({super.key, required this.group});
  @override
  State<GroupThreadScreen> createState() => _GroupThreadScreenState();
}

class _GroupThreadScreenState extends State<GroupThreadScreen> {
  final _msgs = <Map<String, dynamic>>[];
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _members = <String, GroupMember>{};
  RealtimeChannel? _channel;
  bool _loaded = false;
  int _memberCount = 0;
  String _name = '';
  String get _uid => supabase.auth.currentUser!.id;
  String get _gid => widget.group.id;

  @override
  void initState() {
    super.initState();
    _name = widget.group.name;
    _memberCount = widget.group.memberCount;
    _loadMembers();
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    final detail = await GroupsService.instance.getGroup(_gid);
    if (!mounted || detail == null) return;
    setState(() {
      _members
        ..clear()
        ..addEntries(detail.members.map((m) => MapEntry(m.id, m)));
      _name = detail.name;
      _memberCount = detail.members.length;
    });
  }

  Future<void> _load() async {
    final rows = await supabase
        .from('group_messages')
        .select()
        .eq('group_id', _gid)
        .order('created_at', ascending: true)
        .limit(300);
    if (!mounted) return;
    setState(() {
      _loaded = true;
      _msgs
        ..clear()
        ..addAll((rows as List).cast<Map<String, dynamic>>());
    });
    GroupsService.instance.markRead(_gid);
  }

  void _subscribe() {
    _channel = supabase
        .channel('group:$_gid')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'group_messages',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'group_id', value: _gid),
          callback: (payload) {
            final m = payload.newRecord;
            if (m.isEmpty) return;
            if (_msgs.any((x) => x['id'] == m['id'])) return;
            final atBottom = !_scroll.hasClients || _scroll.offset < 300;
            setState(() => _msgs.add(m));
            if (m['sender_id'] != _uid) GroupsService.instance.markRead(_gid);
            if (atBottom) _scrollToBottom();
          },
        )
        .subscribe();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    _text.clear();
    final data = await GroupsService.instance.sendText(_gid, body);
    if (!_msgs.any((x) => x['id'] == data['id'])) {
      setState(() => _msgs.add(data));
      _scrollToBottom();
    }
  }

  void _shareVerse() {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => GroupVersePickerScreen(group: widget.group),
    )).then((_) => _load());
  }

  void _openInfo() {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => GroupInfoScreen(group: widget.group),
    )).then((_) => _loadMembers());
  }

  void _messageActions(Map<String, dynamic> msg) {
    final c = colorsOf(context);
    showModalBottomSheet(
      context: context,
      backgroundColor: c.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 8),
          ListTile(
            leading: Icon(Icons.copy, color: c.ink),
            title: const Text('Copy'),
            onTap: () {
              Clipboard.setData(ClipboardData(text: msg['text'] as String? ?? ''));
              Navigator.pop(ctx);
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

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
        title: InkWell(
          onTap: _openInfo,
          child: Row(children: [
            _GroupAvatar(name: _name, url: widget.group.avatarUrl, radius: 18),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(_name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
              Text('$_memberCount members', style: TextStyle(fontSize: 11, color: c.inkFaint, fontWeight: FontWeight.normal)),
            ])),
          ]),
        ),
        actions: [
          IconButton(onPressed: _openInfo, icon: Icon(Icons.info_outline, color: c.inkSoft)),
        ],
      ),
      body: Column(children: [
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
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                        children: _buildItems(c).reversed.toList(),
                      ),
          ),
        ),
        _composer(c),
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
          Text('Send $_name a verse to get the conversation started.',
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
      final prev = i > 0 ? _msgs[i - 1] : null;
      // Show the author chip when the sender changes (or after a day break).
      final showAuthor = !mine &&
          (prev == null ||
              prev['sender_id'] != m['sender_id'] ||
              DateTime.parse(prev['created_at'] as String).toLocal().day != day.day);
      final next = i + 1 < _msgs.length ? _msgs[i + 1] : null;
      final nextDt = next != null ? DateTime.parse(next['created_at'] as String).toLocal() : null;
      final showMeta = next == null ||
          next['sender_id'] != m['sender_id'] ||
          nextDt!.difference(dt).inMinutes.abs() > 4 ||
          DateTime(nextDt.year, nextDt.month, nextDt.day) != day;
      items.add(_Bubble(
        msg: m,
        mine: mine,
        showAuthor: showAuthor,
        showMeta: showMeta,
        sender: _members[m['sender_id']],
        onLongPress: (mine && m['type'] == 'text') ? () => _messageActions(m) : null,
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
  final bool showAuthor;
  final bool showMeta;
  final GroupMember? sender;
  final VoidCallback? onLongPress;
  const _Bubble({
    required this.msg,
    required this.mine,
    required this.showAuthor,
    required this.showMeta,
    this.sender,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final type = msg['type'] as String;
    final maxW = MediaQuery.of(context).size.width * 0.72;
    final senderName = sender?.display ?? 'Someone';

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

    final bubbleColumn = Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
      if (showAuthor)
        Padding(
          padding: const EdgeInsets.only(left: 6, bottom: 2),
          child: Text(senderName, style: TextStyle(color: c.brand, fontSize: 11.5, fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      content,
      if (showMeta)
        Padding(
          padding: const EdgeInsets.only(top: 3, left: 6, right: 6),
          child: Text(time, style: TextStyle(color: c.inkFaint, fontSize: 10)),
        ),
    ]);

    return Padding(
      padding: EdgeInsets.only(bottom: showMeta ? 8 : 2, top: 1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!mine) ...[
            SizedBox(
              width: 28,
              child: showAuthor
                  ? _GroupMemberAvatar(member: sender, radius: 14)
                  : const SizedBox(),
            ),
            const SizedBox(width: 6),
          ],
          Flexible(child: bubbleColumn),
        ],
      ),
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
      if (mounted) setState(() => _text = ch.verses.sublist(s, e + 1).where((t) => t.trim().isNotEmpty).join(' '));
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
              style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 12.5),
              maxLines: 1, overflow: TextOverflow.ellipsis)),
        ]),
        const SizedBox(height: 8),
        Text(_text ?? '…', style: amharic(context, size: 15, height: 1.6)),
      ]),
    );
  }
}

/// Square gradient avatar for a group (matches the web group avatar).
class _GroupAvatar extends StatelessWidget {
  final String name;
  final String? url;
  final double radius;
  const _GroupAvatar({required this.name, this.url, this.radius = 18});

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    if (url != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius * 0.6),
        child: Image.network(url!, width: radius * 2, height: radius * 2, fit: BoxFit.cover),
      );
    }
    return Container(
      width: radius * 2, height: radius * 2,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.brand, c.gold]),
        borderRadius: BorderRadius.circular(radius * 0.6),
      ),
      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: TextStyle(color: Colors.white, fontSize: radius * 0.9, fontWeight: FontWeight.bold)),
    );
  }
}

class _GroupMemberAvatar extends StatelessWidget {
  final GroupMember? member;
  final double radius;
  const _GroupMemberAvatar({this.member, this.radius = 14});

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final url = member?.avatarUrl;
    final label = (member?.display ?? '?');
    return CircleAvatar(
      radius: radius,
      backgroundColor: c.good,
      backgroundImage: url != null ? NetworkImage(url) : null,
      child: url == null
          ? Text(label.isNotEmpty ? label[0].toUpperCase() : '?',
              style: TextStyle(color: Colors.white, fontSize: radius * 0.8, fontWeight: FontWeight.bold))
          : null,
    );
  }
}
