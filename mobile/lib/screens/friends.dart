import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/friends.dart';
import '../widgets/reveal.dart';
import '../widgets/friend_avatar.dart';
import '../providers.dart';
import 'chat_thread.dart';

const _webBase = 'https://amharic-bible-eta.vercel.app';

class FriendsScreen extends ConsumerStatefulWidget {
  const FriendsScreen({super.key});
  @override
  ConsumerState<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends ConsumerState<FriendsScreen> {
  final _svc = FriendsService.instance;
  List<FriendInfo> _friends = [];
  List<Map<String, dynamic>> _incoming = [];
  List<Map<String, dynamic>> _outgoing = [];
  List<Map<String, dynamic>> _results = [];
  final _search = TextEditingController();
  Timer? _debounce;
  int _reqTab = 0; // 0 received, 1 sent
  bool _loading = true;
  String? _username;
  RealtimeChannel? _rt;

  @override
  void initState() {
    super.initState();
    _load();
    // live: streak counts + friend requests update without a manual refresh
    _rt = supabase
        .channel('friends-screen')
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'streaks',
            callback: (_) => _load())
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'friendships',
            callback: (_) => _load())
        .subscribe();
  }

  @override
  void dispose() {
    if (_rt != null) supabase.removeChannel(_rt!);
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final f = await _svc.getFriends(force: true);
    final inc = await _svc.incomingRequests();
    final out = await _svc.outgoingRequests();
    final p = await supabase
        .from('profiles')
        .select('username')
        .eq('id', supabase.auth.currentUser!.id)
        .maybeSingle();
    if (!mounted) return;
    setState(() {
      _friends = f;
      _incoming = inc;
      _outgoing = out;
      _username = p?['username'] as String?;
      _loading = false;
    });
    // Keep the shared friends provider (used by the share flow) in sync.
    ref.invalidate(friendsProvider);
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final r = await _svc.search(v);
      if (mounted) setState(() => _results = r);
    });
  }

  Set<String> get _friendIds => _friends.map((f) => f.friendId).toSet();
  Set<String> get _sentIds => _outgoing.map((o) => (o['addressee'] as Map)['id'] as String).toSet();
  Map<String, String> get _incomingByUser =>
      {for (final r in _incoming) (r['requester'] as Map)['id'] as String: r['id'] as String};

  String? get _inviteLink => _username != null ? '$_webBase/add/$_username' : null;

  Future<void> _confirmRemove(FriendInfo f) async {
    final c = colorsOf(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: Text('Remove ${f.display}?'),
        content: Text(
          'This removes ${f.display}, your streak together, and your chat history. This can\'t be undone.',
          style: TextStyle(color: c.inkSoft),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _svc.deleteFriendship(f.friendshipId);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final hasRequests = _incoming.isNotEmpty || _outgoing.isNotEmpty;
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
            children: [
              Reveal(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('• ጓደኝነት · FELLOWSHIP', style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                  const SizedBox(height: 6),
                  Text('Friends', style: display(context, size: 28, weight: FontWeight.w700)),
                ]),
              ),
              const SizedBox(height: 26),

              // ── Your friends ──────────────────────────────
              Reveal(
                delay: const Duration(milliseconds: 60),
                child: _section(c, 'Your friends',
                    count: _friends.isNotEmpty ? _friends.length : null,
                    child: _friends.isNotEmpty
                        ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            _card(c, [for (var i = 0; i < _friends.length; i++) _friendRow(c, _friends[i], i > 0)]),
                            const SizedBox(height: 8),
                            Text('Long-press a friend to remove.', style: TextStyle(color: c.inkFaint, fontSize: 11)),
                          ])
                        : _emptyFriends(c)),
              ),

              // ── Requests ──────────────────────────────────
              if (hasRequests) ...[
                _divider(c),
                _section(c, 'Requests', child: Column(children: [
                  _reqTabs(c),
                  const SizedBox(height: 10),
                  _requestsList(c),
                ])),
              ],

              // ── Add a friend ──────────────────────────────
              _divider(c),
              _section(c, 'Add a friend', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                TextField(
                  controller: _search,
                  onChanged: _onSearch,
                  style: const TextStyle(fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'search a username',
                    prefixText: '@',
                    prefixIcon: Icon(Icons.search, size: 18, color: c.inkFaint),
                    isDense: true,
                    filled: true,
                    fillColor: c.surface2,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.brand)),
                  ),
                ),
                if (_results.isNotEmpty) const SizedBox(height: 12),
                for (final r in _results) _searchRow(c, r),
              ])),

              // ── Invite ────────────────────────────────────
              _divider(c),
              _section(c, 'Invite a friend', child: _inviteCard(c)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyFriends(AppColors c) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
      decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(18)),
      child: Column(children: [
        Text('✦', style: display(context, size: 40, color: c.gold.withValues(alpha: 0.5))),
        const SizedBox(height: 10),
        Text('No friends yet', style: amharic(context, size: 17, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Search a username below, or share your invite link.',
            textAlign: TextAlign.center, style: TextStyle(color: c.inkSoft, fontSize: 13)),
      ]),
    );
  }

  Widget _inviteCard(AppColors c) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.goldSoft.withValues(alpha: 0.4),
        border: Border.all(color: c.gold.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Send this link — whoever opens it pairs with you instantly.',
            style: TextStyle(color: c.inkSoft, fontSize: 13)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 4, 6, 4),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: c.line)),
          child: Row(children: [
            Expanded(child: Text(_inviteLink ?? '…', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkSoft, fontSize: 13))),
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: _inviteLink == null ? null : () {
                Clipboard.setData(ClipboardData(text: _inviteLink!));
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invite link copied'), behavior: SnackBarBehavior.floating));
              },
              icon: Icon(Icons.copy, size: 18, color: c.inkSoft),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _inviteLink == null ? null : () => SharePlus.instance.share(
                ShareParams(text: 'Add me on መጽሐፍ ቅዱስ — let\'s keep a verse streak: $_inviteLink')),
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
            icon: const Icon(Icons.ios_share, size: 18),
            label: const Text('Share invite'),
          ),
        ),
      ]),
    );
  }

  Widget _section(AppColors c, String title, {int? count, required Widget child}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(title, style: display(context, size: 19, weight: FontWeight.w700)),
        if (count != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
            decoration: BoxDecoration(color: c.brandSoft, borderRadius: BorderRadius.circular(20)),
            child: Text('$count', style: TextStyle(color: c.brand, fontWeight: FontWeight.w700, fontSize: 13)),
          ),
        ],
      ]),
      const SizedBox(height: 14),
      child,
    ]);
  }

  Widget _divider(AppColors c) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 26),
        child: Container(height: 1, color: c.line),
      );

  Widget _card(AppColors c, List<Widget> children) => Container(
        decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(18)),
        child: Column(children: children),
      );

  Widget _avatar(AppColors c, String? name, String? url, {double r = 22}) => CircleAvatar(
        radius: r, backgroundColor: c.good,
        backgroundImage: url != null ? NetworkImage(url) : null,
        child: url == null ? Text((name ?? '?')[0].toUpperCase(), style: TextStyle(color: Colors.white, fontSize: r * 0.7, fontWeight: FontWeight.bold)) : null,
      );

  Widget _friendRow(AppColors c, FriendInfo f, bool border) {
    return InkWell(
      onLongPress: () => _confirmRemove(f),
      child: Container(
        decoration: BoxDecoration(border: border ? Border(top: BorderSide(color: c.line)) : null),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(children: [
          FriendAvatar(friend: f, radius: 23),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(f.display, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('@${f.username}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkFaint, fontSize: 13)),
          ])),
          Text('🔥 ${f.streakCount}', style: TextStyle(color: c.inkSoft, fontWeight: FontWeight.bold)),
          const SizedBox(width: 10),
          FilledButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(
                builder: (_) => ChatThreadScreen(friendshipId: f.friendshipId, friend: f))),
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8), visualDensity: VisualDensity.compact),
            child: const Text('Chat'),
          ),
        ]),
      ),
    );
  }

  Widget _reqTabs(AppColors c) {
    return Row(children: [
      for (var i = 0; i < 2; i++)
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: GestureDetector(
            onTap: () => setState(() => _reqTab = i),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: _reqTab == i ? c.brand : c.surface,
                border: Border.all(color: _reqTab == i ? c.brand : c.line),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${i == 0 ? "Received" : "Sent"} · ${i == 0 ? _incoming.length : _outgoing.length}',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: _reqTab == i ? c.brandInk : c.inkSoft,
                ),
              ),
            ),
          ),
        ),
    ]);
  }

  Widget _requestsList(AppColors c) {
    final list = _reqTab == 0 ? _incoming : _outgoing;
    if (list.isEmpty) return const SizedBox.shrink();
    return _card(c, [
      for (var i = 0; i < list.length; i++)
        _requestRow(c, list[i], _reqTab == 0, i > 0),
    ]);
  }

  Widget _requestRow(AppColors c, Map<String, dynamic> r, bool received, bool border) {
    final p = (received ? r['requester'] : r['addressee']) as Map;
    final name = (p['name'] ?? p['username']) as String?;
    return Container(
      decoration: BoxDecoration(border: border ? Border(top: BorderSide(color: c.line)) : null),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _avatar(c, name, p['avatar_url'] as String?, r: 21),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('@${p['username']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkFaint, fontSize: 13)),
          ])),
          if (!received) ...[
            Text('Pending', style: TextStyle(color: c.inkFaint, fontSize: 12)),
            IconButton(onPressed: () async { await _svc.deleteFriendship(r['id'] as String); _load(); }, icon: Icon(Icons.close, color: c.inkFaint)),
          ],
        ]),
        // Accept / Decline sit on their own row beneath the name so a long
        // name never collides with the buttons.
        if (received) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: FilledButton(
              onPressed: () async { await _svc.respond(r['id'] as String, 'accepted'); _load(); },
              style: FilledButton.styleFrom(
                backgroundColor: c.brand, foregroundColor: c.brandInk,
                padding: const EdgeInsets.symmetric(vertical: 10)),
              child: const Text('Accept'),
            )),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton(
              onPressed: () async { await _svc.respond(r['id'] as String, 'declined'); _load(); },
              style: OutlinedButton.styleFrom(
                foregroundColor: c.inkSoft, side: BorderSide(color: c.line),
                padding: const EdgeInsets.symmetric(vertical: 10)),
              child: const Text('Decline'),
            )),
          ]),
        ],
      ]),
    );
  }

  Widget _searchRow(AppColors c, Map<String, dynamic> r) {
    final id = r['id'] as String;
    final name = (r['name'] ?? r['username']) as String?;
    if (_friendIds.contains(id)) return const SizedBox();
    final sent = _sentIds.contains(id);
    final incomingId = _incomingByUser[id];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        _avatar(c, name, r['avatar_url'] as String?, r: 21),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('@${r['username']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkFaint, fontSize: 13)),
        ])),
        if (sent)
          Text('Pending', style: TextStyle(color: c.inkFaint, fontSize: 13, fontWeight: FontWeight.w600))
        else if (incomingId != null)
          FilledButton(
            onPressed: () async { await _svc.respond(incomingId, 'accepted'); _load(); },
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, visualDensity: VisualDensity.compact),
            child: const Text('Accept'),
          )
        else
          FilledButton(
            onPressed: () async { await _svc.sendRequest(id); _load(); },
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, visualDensity: VisualDensity.compact),
            child: const Text('Add'),
          ),
      ]),
    );
  }
}
