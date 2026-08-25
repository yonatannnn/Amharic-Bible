import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/friends.dart';
import '../services/groups.dart';
import '../widgets/friend_avatar.dart';
import '../providers.dart';
import 'chat_thread.dart';
import 'group_thread.dart';
import 'new_group.dart';

/// A unified conversation row — either a 1:1 friend chat or a group chat.
class _ChatItem {
  final String kind; // 'dm' | 'group'
  final String id;
  final String title;
  final String preview;
  final String sortKey;
  final int unread;
  final int? streak; // dm only
  final int? memberCount; // group only
  final FriendInfo? friend;
  final GroupInfo? group;
  _ChatItem({
    required this.kind,
    required this.id,
    required this.title,
    required this.preview,
    required this.sortKey,
    required this.unread,
    this.streak,
    this.memberCount,
    this.friend,
    this.group,
  });
}

class ChatListScreen extends ConsumerStatefulWidget {
  const ChatListScreen({super.key});
  @override
  ConsumerState<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends ConsumerState<ChatListScreen> {
  List<_ChatItem>? _items;
  RealtimeChannel? _channel;
  String get _uid => supabase.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _load();
    _channel = supabase
        .channel('chats-list')
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'messages',
            callback: (_) => _load())
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'group_messages',
            callback: (_) => _load())
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'group_members',
            callback: (_) { ref.invalidate(groupsProvider); _load(); })
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'streaks',
            callback: (_) { ref.invalidate(friendsProvider); _load(); })
        .subscribe();
  }

  @override
  void dispose() {
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  Future<void> _load() async {
    final friends = await ref.read(friendsProvider.future);
    final groups = await ref.read(groupsProvider.future);
    final items = <_ChatItem>[];

    // ---- direct messages ----
    if (friends.isNotEmpty) {
      final fids = friends.map((f) => f.friendshipId).toList();
      final msgs = await supabase
          .from('messages')
          .select('friendship_id, type, text, sender_id, created_at, read_at')
          .inFilter('friendship_id', fids)
          .order('created_at', ascending: false)
          .limit(400);
      final last = <String, Map<String, dynamic>>{};
      final unread = <String, int>{};
      for (final m in (msgs as List)) {
        final fid = m['friendship_id'] as String;
        last.putIfAbsent(fid, () => m as Map<String, dynamic>);
        if (m['sender_id'] != _uid && m['read_at'] == null) {
          unread[fid] = (unread[fid] ?? 0) + 1;
        }
      }
      for (final f in friends) {
        final lm = last[f.friendshipId];
        items.add(_ChatItem(
          kind: 'dm',
          id: f.friendshipId,
          title: f.display,
          preview: _preview(lm, 'Share a verse to start your streak'),
          sortKey: lm?['created_at'] as String? ?? '',
          unread: unread[f.friendshipId] ?? 0,
          streak: f.streakCount,
          friend: f,
        ));
      }
    }

    // ---- groups ----
    if (groups.isNotEmpty) {
      final gids = groups.map((g) => g.id).toList();
      final gmsgs = await supabase
          .from('group_messages')
          .select('group_id, type, text, sender_id, created_at')
          .inFilter('group_id', gids)
          .order('created_at', ascending: false)
          .limit(400);
      final rows = (gmsgs as List).cast<Map<String, dynamic>>();
      final last = <String, Map<String, dynamic>>{};
      for (final m in rows) {
        last.putIfAbsent(m['group_id'] as String, () => m);
      }
      for (final g in groups) {
        final since = g.lastReadAt?.millisecondsSinceEpoch ?? 0;
        final unread = rows
            .where((m) =>
                m['group_id'] == g.id &&
                m['sender_id'] != _uid &&
                DateTime.parse(m['created_at'] as String).millisecondsSinceEpoch > since)
            .length;
        final lm = last[g.id];
        items.add(_ChatItem(
          kind: 'group',
          id: g.id,
          title: g.name,
          preview: _preview(lm, 'Share a verse to get started'),
          sortKey: lm?['created_at'] as String? ?? '',
          unread: unread,
          memberCount: g.memberCount,
          group: g,
        ));
      }
    }

    items.sort((a, b) => b.sortKey.compareTo(a.sortKey));
    if (mounted) setState(() => _items = items);
  }

  String _preview(Map<String, dynamic>? m, String empty) {
    if (m == null) return empty;
    final mine = m['sender_id'] == _uid ? 'You: ' : '';
    if (m['type'] == 'verse') return '$mine📖 Shared a verse';
    if (m['type'] == 'image') return '$mine🖼 Photo';
    return '$mine${m['text'] ?? ''}';
  }

  void _newGroup() {
    Navigator.push(context, MaterialPageRoute(builder: (_) => const NewGroupScreen()))
        .then((_) { ref.invalidate(groupsProvider); _load(); });
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    ref.listen(friendsProvider, (prev, next) { if (next.hasValue) _load(); });
    ref.listen(groupsProvider, (prev, next) { if (next.hasValue) _load(); });

    if (_items == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: _newGroup,
        backgroundColor: c.brand,
        foregroundColor: c.brandInk,
        tooltip: 'New group',
        child: const Icon(Icons.group_add),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(friendsProvider);
            ref.invalidate(groupsProvider);
            await _load();
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('• መልእክቶች · MESSAGES', style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                const SizedBox(height: 6),
                Text('Chats', style: display(context, size: 28, weight: FontWeight.w700)),
              ]),
              const SizedBox(height: 18),
              if (_items!.isEmpty)
                _empty(c)
              else
                Container(
                  decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(20)),
                  child: Column(children: [
                    for (var i = 0; i < _items!.length; i++) _row(c, _items![i], i > 0),
                  ]),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _empty(AppColors c) {
    return Padding(
      padding: const EdgeInsets.only(top: 60),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('✦', style: display(context, size: 48, color: c.gold.withValues(alpha: 0.5))),
        const SizedBox(height: 12),
        Text('ገና ውይይት የለም', style: amharic(context, size: 18, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Add a friend or start a group to begin.', style: TextStyle(color: c.inkSoft)),
      ]),
    );
  }

  Widget _row(AppColors c, _ChatItem it, bool border) {
    final lmTime = it.sortKey.isNotEmpty
        ? DateFormat('h:mm a').format(DateTime.parse(it.sortKey).toLocal())
        : '';
    return InkWell(
      onTap: () {
        if (it.kind == 'dm') {
          Navigator.push(context, MaterialPageRoute(
              builder: (_) => ChatThreadScreen(friendshipId: it.id, friend: it.friend!)))
              .then((_) => _load());
        } else {
          Navigator.push(context, MaterialPageRoute(
              builder: (_) => GroupThreadScreen(group: it.group!)))
              .then((_) => _load());
        }
      },
      child: Container(
        decoration: BoxDecoration(border: border ? Border(top: BorderSide(color: c.line)) : null),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          if (it.kind == 'dm')
            FriendAvatar(friend: it.friend!, radius: 25)
          else
            _GroupAvatarSquare(name: it.title, url: it.group?.avatarUrl, radius: 25),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              if (it.kind == 'group') ...[
                Icon(Icons.group, size: 14, color: c.inkFaint),
                const SizedBox(width: 4),
              ],
              Expanded(child: Text(it.title, style: const TextStyle(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
              Text(lmTime, style: TextStyle(color: c.inkFaint, fontSize: 11)),
            ]),
            const SizedBox(height: 2),
            Row(children: [
              Expanded(child: Text(it.preview,
                  style: TextStyle(color: it.unread > 0 ? c.ink : c.inkFaint, fontWeight: it.unread > 0 ? FontWeight.w600 : null, fontSize: 13),
                  overflow: TextOverflow.ellipsis)),
              if (it.streak != null)
                Text('🔥 ${it.streak}', style: TextStyle(color: c.inkSoft, fontSize: 12)),
              if (it.unread > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                  constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                  child: Text('${it.unread}', textAlign: TextAlign.center, style: TextStyle(color: c.brandInk, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ]),
          ])),
        ]),
      ),
    );
  }
}

class _GroupAvatarSquare extends StatelessWidget {
  final String name;
  final String? url;
  final double radius;
  const _GroupAvatarSquare({required this.name, this.url, this.radius = 25});

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    if (url != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(radius * 0.55),
        child: Image.network(url!, width: radius * 2, height: radius * 2, fit: BoxFit.cover),
      );
    }
    return Container(
      width: radius * 2, height: radius * 2,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.brand, c.gold]),
        borderRadius: BorderRadius.circular(radius * 0.55),
      ),
      child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: TextStyle(color: Colors.white, fontSize: radius * 0.8, fontWeight: FontWeight.bold)),
    );
  }
}
