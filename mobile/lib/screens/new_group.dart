import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme.dart';
import '../services/groups.dart';
import '../providers.dart';
import 'group_thread.dart';

class NewGroupScreen extends ConsumerStatefulWidget {
  const NewGroupScreen({super.key});
  @override
  ConsumerState<NewGroupScreen> createState() => _NewGroupScreenState();
}

class _NewGroupScreenState extends ConsumerState<NewGroupScreen> {
  final _name = TextEditingController();
  final _search = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _results = [];
  final List<Map<String, dynamic>> _selected = [];
  bool _creating = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final r = await GroupsService.instance.searchProfiles(v);
      if (mounted) setState(() => _results = r);
    });
  }

  Set<String> get _selectedIds => _selected.map((s) => s['id'] as String).toSet();

  void _toggle(Map<String, dynamic> p) {
    setState(() {
      if (_selectedIds.contains(p['id'])) {
        _selected.removeWhere((s) => s['id'] == p['id']);
      } else {
        _selected.add(p);
      }
    });
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    if (name.isEmpty || _selected.isEmpty || _creating) return;
    setState(() => _creating = true);
    try {
      final gid = await GroupsService.instance
          .createGroup(name, _selected.map((s) => s['id'] as String).toList());
      ref.invalidate(groupsProvider);
      if (!mounted) return;
      final info = GroupInfo(id: gid, name: name, memberCount: _selected.length + 1, role: 'owner');
      Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => GroupThreadScreen(group: info)));
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Couldn\'t create group: $e'), behavior: SnackBarBehavior.floating),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: c.surface,
        title: Text('New group', style: display(context, size: 19, weight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            Text('GROUP NAME', style: TextStyle(color: c.inkFaint, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
            const SizedBox(height: 8),
            TextField(
              controller: _name,
              maxLength: 60,
              decoration: InputDecoration(
                hintText: 'e.g. Morning Devotions',
                filled: true, fillColor: c.surface2, isDense: true, counterText: '',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: BorderSide(color: c.brand)),
              ),
              onChanged: (_) => setState(() {}),
            ),
            if (_selected.isNotEmpty) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 8, runSpacing: 8,
                children: [
                  for (final s in _selected)
                    InputChip(
                      label: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 200),
                        child: Text(s['name'] ?? s['username'] ?? '?', maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      backgroundColor: c.brandSoft,
                      labelStyle: TextStyle(color: c.brand, fontWeight: FontWeight.w600),
                      deleteIconColor: c.brand,
                      onDeleted: () => _toggle(s),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 20),
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
            const SizedBox(height: 12),
            for (final r in _results) _resultRow(c, r),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: FilledButton(
            onPressed: (_name.text.trim().isEmpty || _selected.isEmpty || _creating) ? null : _create,
            style: FilledButton.styleFrom(
              backgroundColor: c.brand, foregroundColor: c.brandInk,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
            ),
            child: Text(_creating
                ? 'Creating…'
                : 'Create group${_selected.isNotEmpty ? ' · ${_selected.length}' : ''}'),
          ),
        ),
      ),
    );
  }

  Widget _resultRow(AppColors c, Map<String, dynamic> r) {
    final on = _selectedIds.contains(r['id']);
    final name = (r['name'] ?? r['username']) as String?;
    return InkWell(
      onTap: () => _toggle(r),
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
          Container(
            width: 26, height: 26, alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? c.brand : Colors.transparent,
              border: Border.all(color: on ? c.brand : c.line),
              shape: BoxShape.circle,
            ),
            child: Icon(on ? Icons.check : Icons.add, size: 16, color: on ? c.brandInk : c.inkFaint),
          ),
        ]),
      ),
    );
  }
}
