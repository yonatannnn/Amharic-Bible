import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/groups.dart';
import '../providers.dart';

class GroupInfoScreen extends ConsumerStatefulWidget {
  final GroupInfo group;
  const GroupInfoScreen({super.key, required this.group});
  @override
  ConsumerState<GroupInfoScreen> createState() => _GroupInfoScreenState();
}

class _GroupInfoScreenState extends ConsumerState<GroupInfoScreen> {
  final _svc = GroupsService.instance;
  final _search = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _results = [];
  GroupDetail? _detail;
  bool _loading = true;
  bool _busy = false;
  String get _uid => supabase.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final d = await _svc.getGroup(widget.group.id);
    if (!mounted) return;
    setState(() { _detail = d; _loading = false; });
  }

  bool get _isOwner => _detail?.iAmOwner ?? false;
  Set<String> get _memberIds => (_detail?.members ?? []).map((m) => m.id).toSet();

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final r = await _svc.searchProfiles(v);
      if (mounted) setState(() => _results = r);
    });
  }

  Future<void> _addMember(Map<String, dynamic> p) async {
    if (_memberIds.contains(p['id']) || _busy) return;
    setState(() => _busy = true);
    await _svc.addMember(widget.group.id, p['id'] as String);
    setState(() { _busy = false; _search.clear(); _results = []; });
    await _load();
    ref.invalidate(groupsProvider);
  }

  Future<void> _removeMember(GroupMember m) async {
    setState(() => _busy = true);
    await _svc.removeMember(widget.group.id, m.id);
    setState(() => _busy = false);
    await _load();
  }

  Future<void> _rename() async {
    final c = colorsOf(context);
    final ctl = TextEditingController(text: _detail?.name ?? widget.group.name);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: const Text('Rename group'),
        content: TextField(controller: ctl, autofocus: true, maxLength: 60, decoration: const InputDecoration(counterText: '')),
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
    if (result == null || result.isEmpty) return;
    await _svc.rename(widget.group.id, result);
    await _load();
    ref.invalidate(groupsProvider);
  }

  Future<void> _leave() async {
    final ok = await _confirm('Leave this group?', 'You\'ll need to be re-added to rejoin.', 'Leave');
    if (ok != true) return;
    await _svc.leave(widget.group.id);
    ref.invalidate(groupsProvider);
    if (mounted) Navigator.popUntil(context, (r) => r.isFirst);
  }

  Future<void> _delete() async {
    final ok = await _confirm('Delete this group?', 'This removes it for everyone and can\'t be undone.', 'Delete');
    if (ok != true) return;
    await _svc.deleteGroup(widget.group.id);
    ref.invalidate(groupsProvider);
    if (mounted) Navigator.popUntil(context, (r) => r.isFirst);
  }

  Future<bool?> _confirm(String title, String body, String action) {
    final c = colorsOf(context);
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: Text(title),
        content: Text(body, style: TextStyle(color: c.inkSoft)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: Text(action),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final d = _detail;
    if (d == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: Text('Group not found')));
    }
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        title: Text('Group info', style: display(context, size: 19, weight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Row(children: [
              Container(
                width: 56, height: 56, alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [c.brand, c.gold]),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(d.name.isNotEmpty ? d.name[0].toUpperCase() : '?',
                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(d.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                  if (_isOwner) ...[
                    const SizedBox(width: 6),
                    GestureDetector(onTap: _rename, child: Icon(Icons.edit_outlined, size: 18, color: c.inkSoft)),
                  ],
                ]),
                Text('${d.members.length} members', style: TextStyle(color: c.inkFaint, fontSize: 13)),
              ])),
            ]),
            const SizedBox(height: 24),

            Text('MEMBERS', style: TextStyle(color: c.inkFaint, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(16)),
              child: Column(children: [
                for (var i = 0; i < d.members.length; i++) _memberRow(c, d.members[i], i > 0),
              ]),
            ),
            const SizedBox(height: 24),

            Text('ADD MEMBERS', style: TextStyle(color: c.inkFaint, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
            const SizedBox(height: 8),
            TextField(
              controller: _search,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Search a username',
                prefixText: '@',
                prefixIcon: Icon(Icons.search, size: 18, color: c.inkFaint),
                filled: true, fillColor: c.surface2, isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.brand)),
              ),
            ),
            const SizedBox(height: 10),
            for (final r in _results.where((r) => !_memberIds.contains(r['id']))) _searchRow(c, r),

            const SizedBox(height: 28),
            OutlinedButton(
              onPressed: _busy ? null : _leave,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red, side: BorderSide(color: c.line),
                padding: const EdgeInsets.symmetric(vertical: 13),
              ),
              child: const Text('Leave group'),
            ),
            if (_isOwner) ...[
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _busy ? null : _delete,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.red.withValues(alpha: 0.12), foregroundColor: Colors.red,
                  padding: const EdgeInsets.symmetric(vertical: 13), elevation: 0,
                ),
                child: const Text('Delete group'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _memberRow(AppColors c, GroupMember m, bool border) {
    return Container(
      decoration: BoxDecoration(border: border ? Border(top: BorderSide(color: c.line)) : null),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(children: [
        CircleAvatar(
          radius: 20, backgroundColor: c.good,
          backgroundImage: m.avatarUrl != null ? NetworkImage(m.avatarUrl!) : null,
          child: m.avatarUrl == null
              ? Text(m.display[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))
              : null,
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m.id == _uid ? '${m.display} (you)' : m.display, style: const TextStyle(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
          Text('@${m.username ?? ''}', style: TextStyle(color: c.inkFaint, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        const SizedBox(width: 8),
        if (m.isOwner)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
            decoration: BoxDecoration(color: c.goldSoft.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(20)),
            child: Text('Owner', style: TextStyle(color: c.gold, fontSize: 11, fontWeight: FontWeight.w700)),
          )
        else if (_isOwner)
          TextButton(
            onPressed: _busy ? null : () => _removeMember(m),
            style: TextButton.styleFrom(foregroundColor: Colors.red, visualDensity: VisualDensity.compact),
            child: const Text('Remove'),
          ),
      ]),
    );
  }

  Widget _searchRow(AppColors c, Map<String, dynamic> r) {
    final name = (r['name'] ?? r['username']) as String?;
    return InkWell(
      onTap: () => _addMember(r),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Row(children: [
          CircleAvatar(
            radius: 20, backgroundColor: c.good,
            backgroundImage: r['avatar_url'] != null ? NetworkImage(r['avatar_url']) : null,
            child: r['avatar_url'] == null
                ? Text((name ?? '?')[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name ?? '', style: const TextStyle(fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('@${r['username']}', style: TextStyle(color: c.inkFaint, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
          const SizedBox(width: 8),
          Icon(Icons.add_circle_outline, color: c.brand),
        ]),
      ),
    );
  }
}
