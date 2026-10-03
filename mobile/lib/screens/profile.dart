import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase.dart';
import '../theme.dart';
import '../providers.dart';
import 'settings.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? _profile;
  int _bestStreak = 0, _longest = 0, _friendsCount = 0, _verses = 0;
  final _name = TextEditingController();
  final _username = TextEditingController();
  String _uStatus = 'unchanged';
  bool _busy = false, _uploading = false;
  Timer? _debounce;
  String _origUsername = '';
  RealtimeChannel? _rt;

  @override
  void initState() {
    super.initState();
    _username.addListener(_onUsername);
    _load();
    // live: streak/verse stats update without overwriting fields being edited
    _rt = supabase
        .channel('profile-screen')
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'streaks',
            callback: (_) => _refreshStats())
        .onPostgresChanges(
            event: PostgresChangeEvent.all, schema: 'public', table: 'friendships',
            callback: (_) {
              ref.invalidate(friendsProvider);
              _refreshStats();
            })
        .subscribe();
  }

  @override
  void dispose() {
    if (_rt != null) supabase.removeChannel(_rt!);
    _debounce?.cancel();
    _name.dispose();
    _username.dispose();
    super.dispose();
  }

  /// Refresh only the numbers (streaks/friends/verses) — never the text fields.
  Future<void> _refreshStats() async {
    final uid = supabase.auth.currentUser!.id;
    final friends = await ref.read(friendsProvider.future);
    final streaks = await supabase
        .from('streaks')
        .select('count, longest')
        .inFilter('friendship_id', friends.map((f) => f.friendshipId).toList());
    final vcount = await supabase
        .from('messages')
        .count(CountOption.exact)
        .eq('sender_id', uid)
        .eq('type', 'verse');
    if (!mounted) return;
    setState(() {
      _friendsCount = friends.length;
      _bestStreak = (streaks as List).fold(0, (m, s) => (s['count'] as int) > m ? s['count'] as int : m);
      _longest = streaks.fold(0, (m, s) => (s['longest'] as int) > m ? s['longest'] as int : m);
      _verses = vcount;
    });
  }

  Future<void> _load() async {
    final uid = supabase.auth.currentUser!.id;
    final p = await ref.read(profileProvider.future);
    final friends = await ref.read(friendsProvider.future);
    final streaks = await supabase
        .from('streaks')
        .select('count, longest')
        .inFilter('friendship_id', friends.map((f) => f.friendshipId).toList());
    final vcount = await supabase
        .from('messages')
        .count(CountOption.exact)
        .eq('sender_id', uid)
        .eq('type', 'verse');
    if (!mounted) return;
    setState(() {
      _profile = p;
      _name.text = (p?['name'] ?? '') as String;
      _username.text = (p?['username'] ?? '') as String;
      _origUsername = (p?['username'] ?? '') as String;
      _friendsCount = friends.length;
      _bestStreak = (streaks as List).fold(0, (m, s) => (s['count'] as int) > m ? s['count'] as int : m);
      _longest = streaks.fold(0, (m, s) => (s['longest'] as int) > m ? s['longest'] as int : m);
      _verses = vcount;
    });
  }

  String get _clean => _username.text.replaceAll(RegExp(r'^@+'), '').trim().toLowerCase();
  bool get _changed => _clean != _origUsername.toLowerCase();

  void _onUsername() {
    _debounce?.cancel();
    if (!_changed) return setState(() => _uStatus = 'unchanged');
    if (!RegExp(r'^[a-z0-9_]{3,20}$').hasMatch(_clean)) return setState(() => _uStatus = 'invalid');
    setState(() => _uStatus = 'checking');
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      final d = await supabase.from('profiles').select('id').ilike('username', _clean).neq('id', supabase.auth.currentUser!.id).maybeSingle();
      if (mounted) setState(() => _uStatus = d != null ? 'taken' : 'ok');
    });
  }

  Future<void> _pickAvatar() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1024, imageQuality: 85);
    if (x == null) return;
    setState(() => _uploading = true);
    try {
      final uid = supabase.auth.currentUser!.id;
      final bytes = await x.readAsBytes();
      final path = '$uid/avatar-${DateTime.now().millisecondsSinceEpoch}.jpg';
      await supabase.storage.from('images').uploadBinary(path, bytes,
          fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true));
      final url = supabase.storage.from('images').getPublicUrl(path);
      await supabase.from('profiles').update({'avatar_url': url}).eq('id', uid);
      setState(() => _profile = {...?_profile, 'avatar_url': url});
      ref.invalidate(profileProvider);
    } catch (_) {
      _snack('Upload failed (run storage.sql?)');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final patch = <String, dynamic>{'name': _name.text.trim().isEmpty ? null : _name.text.trim()};
    if (_changed && _uStatus == 'ok') patch['username'] = _clean;
    await supabase.from('profiles').update(patch).eq('id', supabase.auth.currentUser!.id);
    if (patch['username'] != null) _origUsername = _clean;
    setState(() { _busy = false; _uStatus = 'unchanged'; });
    ref.invalidate(profileProvider);
    _snack('Profile saved');
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final avatar = _profile?['avatar_url'] as String?;
    final base = _name.text.isNotEmpty ? _name.text : _clean;
    final initial = (base.isNotEmpty ? base[0] : '?').toUpperCase();
    return Scaffold(
      body: SafeArea(
        child: _profile == null
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(profileProvider);
                  ref.invalidate(friendsProvider);
                  await _load();
                },
                child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [
                  Row(children: [
                    Expanded(child: Text('Profile', style: display(context, size: 28, weight: FontWeight.w700))),
                    IconButton(
                      tooltip: 'Settings',
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
                      icon: Icon(Icons.settings_outlined, color: c.inkSoft),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  Row(children: [
                    _stat(c, '$_bestStreak', 'Best 🔥'),
                    _stat(c, '$_longest', 'Longest'),
                    _stat(c, '$_friendsCount', 'Friends'),
                    _stat(c, '$_verses', 'Verses'),
                  ]),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(24)),
                    child: Column(children: [
                      GestureDetector(
                        onTap: _uploading ? null : _pickAvatar,
                        child: CircleAvatar(
                          radius: 44,
                          backgroundColor: c.good,
                          backgroundImage: avatar != null ? NetworkImage(avatar) : null,
                          child: _uploading
                              ? const CircularProgressIndicator(color: Colors.white)
                              : (avatar == null
                                  ? Text(initial, style: const TextStyle(fontSize: 34, color: Colors.white, fontWeight: FontWeight.bold))
                                  : null),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('Tap photo to change', style: TextStyle(color: c.inkFaint, fontSize: 12)),
                      const SizedBox(height: 16),
                      _input(c, _name, 'Display name'),
                      const SizedBox(height: 12),
                      _input(c, _username, 'Username', prefix: '@'),
                      SizedBox(height: 18, child: _uText(c)),
                      const SizedBox(height: 8),
                      SizedBox(width: double.infinity, child: FilledButton(
                        onPressed: (_busy || (_changed && _uStatus != 'ok')) ? null : _save,
                        style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk),
                        child: Text(_busy ? 'Saving…' : 'Save changes'),
                      )),
                    ]),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
      ),
    );
  }

  Widget _stat(AppColors c, String n, String label) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(n, maxLines: 1, style: display(context, size: 22, weight: FontWeight.w700, color: c.brand)),
          ),
          const SizedBox(height: 2),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(color: c.inkFaint, fontSize: 11)),
        ]),
      ),
    );
  }

  Widget _uText(AppColors c) {
    switch (_uStatus) {
      case 'invalid': return Text('3–20 chars: a–z, 0–9, _', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.warn, fontSize: 12));
      case 'taken': return Text('@$_clean is taken', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.red, fontSize: 12));
      case 'ok': return Text('@$_clean is available', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.good, fontSize: 12));
      default: return const SizedBox();
    }
  }

  Widget _input(AppColors c, TextEditingController ctl, String hint, {String? prefix}) {
    return TextField(
      controller: ctl,
      onChanged: (_) => setState(() {}),
      style: TextStyle(color: c.ink),
      decoration: InputDecoration(
        hintText: hint, prefixText: prefix, filled: true, fillColor: c.surface2,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.line)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.brand)),
      ),
    );
  }
}
