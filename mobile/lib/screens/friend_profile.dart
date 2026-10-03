import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/friends.dart';
import '../providers.dart';
import 'chat_thread.dart';

class FriendProfileScreen extends ConsumerStatefulWidget {
  final FriendInfo friend;
  const FriendProfileScreen({super.key, required this.friend});
  @override
  ConsumerState<FriendProfileScreen> createState() => _FriendProfileScreenState();
}

class _FriendProfileScreenState extends ConsumerState<FriendProfileScreen> {
  int _current = 0, _longest = 0, _verses = 0;
  Set<String> _days = {};
  bool _loading = true;
  bool _broken = false;
  DateTime? _brokenAt;
  int _restoresLeft = 3;
  bool _restoring = false;
  RealtimeChannel? _rt;

  String get _thisMonth =>
      '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}';

  bool get _restorable =>
      _broken &&
      _brokenAt != null &&
      DateTime.now().isBefore(_brokenAt!.add(const Duration(hours: 48))) &&
      _restoresLeft > 0;

  @override
  void initState() {
    super.initState();
    _current = widget.friend.streakCount;
    _load();
    // live: this friendship's streak + verse-share heatmap update in realtime
    _rt = supabase
        .channel('friend-profile:${widget.friend.friendshipId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all, schema: 'public', table: 'streaks',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'friendship_id', value: widget.friend.friendshipId),
          callback: (_) => _load(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all, schema: 'public', table: 'messages',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'friendship_id', value: widget.friend.friendshipId),
          callback: (_) => _load(),
        )
        .subscribe();
  }

  @override
  void dispose() {
    if (_rt != null) supabase.removeChannel(_rt!);
    super.dispose();
  }

  String _fmt(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    final fid = widget.friend.friendshipId;
    final s = await supabase
        .from('streaks')
        .select('count, longest, broken, broken_at, restores_remaining, restore_period')
        .eq('friendship_id', fid)
        .maybeSingle();
    final msgs = await supabase.from('messages').select('created_at').eq('friendship_id', fid).eq('type', 'verse');
    final days = <String>{};
    for (final m in (msgs as List)) {
      days.add(_fmt(DateTime.parse(m['created_at'] as String).toLocal()));
    }
    if (!mounted) return;
    setState(() {
      _current = (s?['count'] ?? widget.friend.streakCount) as int;
      _longest = (s?['longest'] ?? 0) as int;
      _verses = msgs.length;
      _days = days;
      _broken = s?['broken'] == true;
      _brokenAt = s?['broken_at'] != null ? DateTime.tryParse(s!['broken_at'] as String) : null;
      // restores reset to 3 at the start of each month
      _restoresLeft = (s?['restore_period'] == _thisMonth) ? (s?['restores_remaining'] ?? 3) as int : 3;
      _loading = false;
    });
  }

  Future<void> _restore() async {
    setState(() => _restoring = true);
    final ok = await supabase.rpc('restore_streak', params: {'p_friendship': widget.friend.friendshipId});
    if (!mounted) return;
    setState(() => _restoring = false);
    if (ok == true) {
      ref.invalidate(friendsProvider);
      _load();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Streak restored 🔥'), behavior: SnackBarBehavior.floating),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Couldn\'t restore — the 48h window may have passed.'), behavior: SnackBarBehavior.floating),
      );
    }
  }

  Future<void> _remove() async {
    final c = colorsOf(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: Text('Remove ${widget.friend.display}?'),
        content: Text('This removes them, your streak together and your chat history. This can\'t be undone.',
            style: TextStyle(color: c.inkSoft)),
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
      await FriendsService.instance.deleteFriendship(widget.friend.friendshipId);
      ref.invalidate(friendsProvider);
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final f = widget.friend;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.canvas,
        surfaceTintColor: c.canvas,
        elevation: 0,
        actions: [
          IconButton(
            tooltip: 'Remove friend',
            onPressed: _remove,
            icon: Icon(Icons.person_remove_outlined, color: c.inkSoft),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(friendsProvider);
                await _load();
              },
              child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
              children: [
                Center(
                  child: CircleAvatar(
                    radius: 48,
                    backgroundColor: c.good,
                    backgroundImage: f.avatarUrl != null ? NetworkImage(f.avatarUrl!) : null,
                    child: f.avatarUrl == null
                        ? Text(f.display[0].toUpperCase(), style: const TextStyle(fontSize: 38, color: Colors.white, fontWeight: FontWeight.bold))
                        : null,
                  ),
                ),
                const SizedBox(height: 12),
                Center(child: Text(f.display, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: display(context, size: 24, weight: FontWeight.w700))),
                Center(child: Text('@${f.username}', textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.inkFaint, fontSize: 14))),
                if (_restorable) ...[
                  const SizedBox(height: 20),
                  _restoreCard(c),
                ],
                const SizedBox(height: 22),
                Row(children: [
                  _stat(c, '🔥 $_current', 'Streak'),
                  _stat(c, '$_longest', 'Longest'),
                  _stat(c, '$_verses', 'Verses'),
                ]),
                const SizedBox(height: 24),
                Text('VERSE-SHARE CALENDAR', style: TextStyle(color: c.inkFaint, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(18)),
                  child: _Heatmap(days: _days, colors: c),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(
                        builder: (_) => ChatThreadScreen(friendshipId: f.friendshipId, friend: f))),
                    style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, padding: const EdgeInsets.symmetric(vertical: 14)),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text('Open chat'),
                  ),
                ),
              ],
            ),
            ),
    );
  }

  Widget _restoreCard(AppColors c) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.ember.withValues(alpha: 0.18), c.brand.withValues(alpha: 0.12)]),
        border: Border.all(color: c.ember.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('💔', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 8),
          Expanded(child: Text('Your $_current-day streak broke',
              style: display(context, size: 16, weight: FontWeight.w700))),
        ]),
        const SizedBox(height: 6),
        Text(
          'Restore it within 48 hours to pick up where you left off. '
          '$_restoresLeft restore${_restoresLeft == 1 ? '' : 's'} left this month.',
          style: TextStyle(color: c.inkSoft, fontSize: 13, height: 1.4),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _restoring ? null : _restore,
            style: FilledButton.styleFrom(backgroundColor: c.brand, foregroundColor: c.brandInk, padding: const EdgeInsets.symmetric(vertical: 12)),
            icon: _restoring
                ? SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: c.brandInk))
                : const Text('🔥', style: TextStyle(fontSize: 15)),
            label: const Text('Restore streak'),
          ),
        ),
      ]),
    );
  }

  Widget _stat(AppColors c, String n, String label) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: c.surface, border: Border.all(color: c.line), borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          Text(n, style: display(context, size: 20, weight: FontWeight.w700, color: c.brand)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(color: c.inkFaint, fontSize: 11)),
        ]),
      ),
    );
  }
}

/// GitHub-style contribution grid of days a verse was shared.
class _Heatmap extends StatelessWidget {
  final Set<String> days;
  final AppColors colors;
  const _Heatmap({required this.days, required this.colors});

  String _fmt(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    const weeks = 17;
    // Start on the Sunday of the week (weeks-1) ago.
    final startRaw = today.subtract(Duration(days: 7 * (weeks - 1)));
    final start = startRaw.subtract(Duration(days: startRaw.weekday % 7)); // Sun=0
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(weeks, (w) {
          return Column(children: List.generate(7, (d) {
            final date = start.add(Duration(days: w * 7 + d));
            final future = date.isAfter(today);
            final active = days.contains(_fmt(date));
            return Container(
              width: 13,
              height: 13,
              margin: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: future
                    ? Colors.transparent
                    : active
                        ? colors.brand
                        : colors.surface2,
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }));
        }),
      ),
      const SizedBox(height: 10),
      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        Text('less', style: TextStyle(color: colors.inkFaint, fontSize: 10)),
        const SizedBox(width: 6),
        Container(width: 11, height: 11, margin: const EdgeInsets.only(right: 3), decoration: BoxDecoration(color: colors.surface2, borderRadius: BorderRadius.circular(3))),
        Container(width: 11, height: 11, decoration: BoxDecoration(color: colors.brand, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 6),
        Text('shared', style: TextStyle(color: colors.inkFaint, fontSize: 10)),
      ]),
    ]);
  }
}
