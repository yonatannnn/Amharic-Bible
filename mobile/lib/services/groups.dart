import '../supabase.dart';

class GroupMember {
  final String id;
  final String? name;
  final String? username;
  final String? avatarUrl;
  final String role;
  GroupMember({
    required this.id,
    this.name,
    this.username,
    this.avatarUrl,
    this.role = 'member',
  });
  String get display => name ?? username ?? 'member';
  bool get isOwner => role == 'owner';
}

class GroupInfo {
  final String id;
  final String name;
  final String? avatarUrl;
  final String role;
  final int memberCount;
  final DateTime? lastReadAt;
  GroupInfo({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.role = 'member',
    this.memberCount = 1,
    this.lastReadAt,
  });
  bool get isOwner => role == 'owner';
}

class GroupDetail {
  final String id;
  final String name;
  final String? avatarUrl;
  final String createdBy;
  final List<GroupMember> members;
  final String myRole;
  GroupDetail({
    required this.id,
    required this.name,
    this.avatarUrl,
    required this.createdBy,
    required this.members,
    required this.myRole,
  });
  bool get iAmOwner => myRole == 'owner';
}

class GroupsService {
  GroupsService._();
  static final instance = GroupsService._();

  String get _uid => supabase.auth.currentUser!.id;

  /// All groups I belong to, with role + member count + my last_read_at.
  Future<List<GroupInfo>> getGroups() async {
    final rows = await supabase
        .from('group_members')
        .select('group_id, role, last_read_at, groups(id, name, avatar_url)')
        .eq('user_id', _uid);

    final list = (rows as List).where((r) => r['groups'] != null).toList();
    if (list.isEmpty) return [];

    final ids = list.map((r) => r['group_id'] as String).toList();
    final allMembers = await supabase
        .from('group_members')
        .select('group_id')
        .inFilter('group_id', ids);
    final counts = <String, int>{};
    for (final m in (allMembers as List)) {
      final g = m['group_id'] as String;
      counts[g] = (counts[g] ?? 0) + 1;
    }

    return list.map((r) {
      final g = r['groups'] as Map<String, dynamic>;
      return GroupInfo(
        id: g['id'] as String,
        name: g['name'] as String,
        avatarUrl: g['avatar_url'] as String?,
        role: r['role'] as String,
        memberCount: counts[r['group_id']] ?? 1,
        lastReadAt: r['last_read_at'] != null
            ? DateTime.tryParse(r['last_read_at'] as String)
            : null,
      );
    }).toList();
  }

  Future<GroupDetail?> getGroup(String groupId) async {
    final g = await supabase
        .from('groups')
        .select('id, name, avatar_url, created_by')
        .eq('id', groupId)
        .maybeSingle();
    if (g == null) return null;

    final rows = await supabase
        .from('group_members')
        .select('user_id, role, profiles(id, username, name, avatar_url)')
        .eq('group_id', groupId);

    final members = <GroupMember>[];
    GroupMember? mine;
    for (final r in (rows as List)) {
      final p = r['profiles'] as Map<String, dynamic>?;
      final m = GroupMember(
        id: r['user_id'] as String,
        name: p?['name'] as String?,
        username: p?['username'] as String?,
        avatarUrl: p?['avatar_url'] as String?,
        role: r['role'] as String,
      );
      members.add(m);
      if (m.id == _uid) mine = m;
    }
    if (mine == null) return null;

    return GroupDetail(
      id: g['id'] as String,
      name: g['name'] as String,
      avatarUrl: g['avatar_url'] as String?,
      createdBy: g['created_by'] as String,
      members: members,
      myRole: mine.role,
    );
  }

  /// Returns the new group id. Caller becomes owner.
  Future<String> createGroup(String name, List<String> memberIds) async {
    final gid = await supabase.rpc('create_group', params: {
      'p_name': name,
      'p_members': memberIds,
    });
    return gid as String;
  }

  Future<void> addMember(String groupId, String userId) async {
    await supabase.rpc('add_group_member',
        params: {'p_group': groupId, 'p_user': userId});
  }

  Future<void> removeMember(String groupId, String userId) async {
    await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
  }

  Future<void> leave(String groupId) => removeMember(groupId, _uid);

  Future<void> deleteGroup(String groupId) async {
    await supabase.from('groups').delete().eq('id', groupId);
  }

  Future<void> rename(String groupId, String name) async {
    await supabase.from('groups').update({'name': name}).eq('id', groupId);
  }

  Future<void> markRead(String groupId) async {
    await supabase
        .from('group_members')
        .update({'last_read_at': DateTime.now().toIso8601String()})
        .eq('group_id', groupId)
        .eq('user_id', _uid);
  }

  Future<Map<String, dynamic>> sendText(String groupId, String text) async {
    return await supabase.from('group_messages').insert({
      'group_id': groupId,
      'sender_id': _uid,
      'type': 'text',
      'text': text,
    }).select().single();
  }

  Future<Map<String, dynamic>> shareVerse(
      String groupId, int book, int chapter, int start, int end) async {
    return await supabase.from('group_messages').insert({
      'group_id': groupId,
      'sender_id': _uid,
      'type': 'verse',
      'book': book,
      'chapter': chapter,
      'verse_start': start,
      'verse_end': end,
    }).select().single();
  }

  /// Search profiles by username (excludes me). Mirrors FriendsService.search.
  Future<List<Map<String, dynamic>>> searchProfiles(String term) async {
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
}
