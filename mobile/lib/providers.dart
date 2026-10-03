import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase.dart';
import 'services/friends.dart';
import 'services/groups.dart';
import 'services/daily.dart';
import 'services/gitsawe.dart';

/// Auth state stream — drives routing in AuthGate.
final authChangesProvider = StreamProvider<AuthState>((ref) {
  return supabase.auth.onAuthStateChange;
});

/// The signed-in user's profile (name, username, avatar). Null when signed out.
///
/// The timeout matters: with no connection the PostgREST request hangs rather
/// than failing, which left the app on the splash spinner indefinitely. Timing
/// out turns that into an error the gate can actually show and retry.
final profileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final uid = supabase.auth.currentUser?.id;
  if (uid == null) return null;
  return supabase
      .from('profiles')
      .select('id, name, username, avatar_url, is_admin')
      .eq('id', uid)
      .maybeSingle()
      .timeout(const Duration(seconds: 12));
});

/// Today's rotating verse (read from the DB pool, with a fallback).
final dailyVerseProvider = FutureProvider<DailyVerse?>((ref) {
  return DailyService.instance.getDailyVerse();
});

/// The groups I belong to (verse-sharing group chats). Refreshable.
final groupsProvider =
    AsyncNotifierProvider<GroupsNotifier, List<GroupInfo>>(GroupsNotifier.new);

class GroupsNotifier extends AsyncNotifier<List<GroupInfo>> {
  @override
  Future<List<GroupInfo>> build() {
    return GroupsService.instance.getGroups();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => GroupsService.instance.getGroups());
  }
}

/// Today's ግጻዌ readings (lectionary + ስንክሳር), from the bundled data.
final gitsaweProvider = FutureProvider<TodaysGitsawe?>((ref) {
  return GitsaweService.instance.today();
});

/// Today's chapter + reading-streak state.
final todaysReadingProvider = FutureProvider<TodaysReading?>((ref) {
  return DailyService.instance.getTodaysReading();
});

/// The most urgent streak the user still needs to keep alive today
/// (an active streak whose window is closing and they haven't shared yet).
class StreakReminder {
  final FriendInfo friend;
  final DateTime deadline;
  final int count;
  StreakReminder(this.friend, this.deadline, this.count);
}

final urgentStreakProvider = FutureProvider<StreakReminder?>((ref) async {
  final uid = supabase.auth.currentUser?.id;
  if (uid == null) return null;
  final friends = await ref.watch(friendsProvider.future);
  if (friends.isEmpty) return null;
  final rows = await supabase
      .from('streaks')
      .select('count, window_deadline, requester_shared, addressee_shared, friendship_id, friendships(requester_id, addressee_id)')
      .gt('count', 0)
      .eq('broken', false)
      // only nudge inside the grace window (deadline 11 AM, grace starts 6 AM)
      .gt('window_deadline', DateTime.now().toIso8601String())
      .lt('window_deadline', DateTime.now().add(const Duration(hours: 5)).toIso8601String())
      .order('window_deadline', ascending: true);
  for (final r in (rows as List)) {
    final f = r['friendships'] as Map?;
    if (f == null) continue;
    final iAmRequester = f['requester_id'] == uid;
    final iShared = iAmRequester ? r['requester_shared'] == true : r['addressee_shared'] == true;
    if (iShared) continue; // already did my part this window
    final fid = r['friendship_id'] as String;
    FriendInfo? friend;
    for (final x in friends) {
      if (x.friendshipId == fid) { friend = x; break; }
    }
    if (friend == null) continue;
    return StreakReminder(friend, DateTime.parse(r['window_deadline'] as String), r['count'] as int);
  }
  return null;
});

/// The user's friends list — a single shared source of truth across the
/// share bar, chat list, friends screen, verse picker and profile.
/// Loading/error are handled via [AsyncValue], so the UI never reads null data.
final friendsProvider =
    AsyncNotifierProvider<FriendsNotifier, List<FriendInfo>>(FriendsNotifier.new);

class FriendsNotifier extends AsyncNotifier<List<FriendInfo>> {
  @override
  Future<List<FriendInfo>> build() {
    return FriendsService.instance.getFriends(force: true);
  }

  /// Re-fetch from the network and update every listener.
  Future<void> refresh() async {
    state = await AsyncValue.guard(() => FriendsService.instance.getFriends(force: true));
  }
}
