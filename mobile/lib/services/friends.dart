import '../supabase.dart';

class FriendInfo {
  final String friendshipId;
  final String friendId;
  final String? name;
  final String? username;
  final String? avatarUrl;
  final int streakCount;
  FriendInfo({
    required this.friendshipId,
    required this.friendId,
    this.name,
    this.username,
    this.avatarUrl,
    this.streakCount = 0,
  });
  String get display => name ?? username ?? 'friend';
}

class FriendsService {
  FriendsService._();
  static final instance = FriendsService._();

  String get _uid => supabase.auth.currentUser!.id;

  List<FriendInfo>? _cache;
  List<FriendInfo>? get cached => _cache;
  void invalidate() => _cache = null;

  /// Cached after the first call so the share picker opens instantly.
  /// Pass [force] for screens that need fresh data (Friends list, Chat list).
  Future<List<FriendInfo>> getFriends({bool force = false}) async {
    if (_cache != null && !force) return _cache!;
    final list = await _fetchFriends();
    _cache = list;
    return list;
  }

  Future<List<FriendInfo>> _fetchFriends() async {
    final rows = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id')
        .eq('status', 'accepted')
        .or('requester_id.eq.$_uid,addressee_id.eq.$_uid');
    if ((rows as List).isEmpty) return [];

    final friendIds = rows
        .map((f) => f['requester_id'] == _uid ? f['addressee_id'] : f['requester_id'])
        .toList();
    final fids = rows.map((f) => f['id']).toList();

    final profiles = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .inFilter('id', friendIds);
    final streaks = await supabase
        .from('streaks')
        .select('friendship_id, count')
        .inFilter('friendship_id', fids);

    final pById = {for (final p in profiles as List) p['id']: p};
    final sById = {for (final s in streaks as List) s['friendship_id']: s['count']};

    final list = rows.map((f) {
      final friendId = f['requester_id'] == _uid ? f['addressee_id'] : f['requester_id'];
      final p = pById[friendId];
      return FriendInfo(
        friendshipId: f['id'] as String,
        friendId: friendId as String,
        name: p?['name'] as String?,
        username: p?['username'] as String?,
        avatarUrl: p?['avatar_url'] as String?,
        streakCount: (sById[f['id']] ?? 0) as int,
      );
    }).toList();
    list.sort((a, b) => b.streakCount - a.streakCount);
    return list;
  }

  Future<int> incomingCount() async {
    final rows = await supabase
        .from('friendships')
        .select('id')
        .eq('status', 'pending')
        .eq('addressee_id', _uid);
    return (rows as List).length;
  }

  Future<void> shareVerse(String friendshipId, int book, int chapter, int start, int end) async {
    await supabase.from('messages').insert({
      'friendship_id': friendshipId,
      'sender_id': _uid,
      'type': 'verse',
      'book': book,
      'chapter': chapter,
      'verse_start': start,
      'verse_end': end,
    });
  }

  Future<List<Map<String, dynamic>>> incomingRequests() async {
    final rows = await supabase
        .from('friendships')
        .select('id, requester:profiles!friendships_requester_id_fkey(id, username, name, avatar_url)')
        .eq('status', 'pending')
        .eq('addressee_id', _uid);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> outgoingRequests() async {
    final rows = await supabase
        .from('friendships')
        .select('id, addressee:profiles!friendships_addressee_id_fkey(id, username, name, avatar_url)')
        .eq('status', 'pending')
        .eq('requester_id', _uid);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> search(String term) async {
    final t = term.replaceAll(RegExp(r'^@+'), '').trim().toLowerCase();
    if (t.length < 2) return [];
    final rows = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .ilike('username', '%$t%')
        .neq('id', _uid)
        .limit(8);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  Future<void> sendRequest(String addresseeId) async {
    await supabase.from('friendships').insert({
      'requester_id': _uid,
      'addressee_id': addresseeId,
      'status': 'pending',
    });
  }

  Future<void> respond(String id, String status) async {
    await supabase.from('friendships').update({'status': status}).eq('id', id);
    invalidate();
  }

  Future<void> deleteFriendship(String id) async {
    await supabase.from('friendships').delete().eq('id', id);
    invalidate();
  }
}
