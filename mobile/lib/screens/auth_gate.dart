import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../supabase.dart';
import '../theme.dart';
import '../providers.dart';
import '../services/push.dart';
import 'login.dart';
import 'onboarding.dart';
import 'shell.dart';

class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Re-fetch the profile whenever the signed-in user changes.
    ref.listen(authChangesProvider, (prev, next) {
      final event = next.asData?.value.event;
      if (event == AuthChangeEvent.signedIn ||
          event == AuthChangeEvent.signedOut ||
          event == AuthChangeEvent.userUpdated) {
        ref.invalidate(profileProvider);
      }
    });
    ref.watch(authChangesProvider); // rebuild on auth changes

    final session = supabase.auth.currentSession;
    if (session == null) return const LoginScreen();
    return ProfileGate(key: ValueKey(session.user.id));
  }
}

/// Once authenticated, routes to onboarding (no username) or the app shell.
class ProfileGate extends ConsumerWidget {
  const ProfileGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);

    // Deliberately not `profile.when(...)`. Riverpod hangs on to the previous
    // error while it auto-retries a failed provider, so an offline failure sits
    // in loading AND error at the same time — and `when` routes on loading
    // first, which is what left the app spinning on the splash forever.
    // Surface the error as soon as there is one; the spinner is only for the
    // first attempt, before anything has failed.
    final err = profile.error;
    if (err != null) {
      return _ProfileError(
        error: err,
        retrying: profile.isLoading,
        onRetry: () => ref.invalidate(profileProvider),
      );
    }
    if (profile.isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final username = profile.value?['username'] as String?;
    if (username == null || username.isEmpty) {
      return OnboardingScreen(onDone: () => ref.invalidate(profileProvider));
    }
    return const Shell();
  }
}

/// Shown when the profile could not be loaded — almost always a dropped
/// connection, occasionally a session that can no longer be refreshed.
/// Retrying covers the first; signing out is the escape hatch for the second,
/// which retrying alone can never clear.
class _ProfileError extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;

  /// True while another attempt is already in flight — Riverpod retries a
  /// failed provider on its own, so say so rather than looking inert.
  final bool retrying;
  const _ProfileError({
    required this.error,
    required this.onRetry,
    this.retrying = false,
  });

  bool get _looksOffline {
    final s = error.toString().toLowerCase();
    return s.contains('socket') ||
        s.contains('failed host lookup') ||
        s.contains('network') ||
        s.contains('connection') ||
        s.contains('timed out') ||
        s.contains('timeout');
  }

  Future<void> _signOut(BuildContext context) async {
    final c = colorsOf(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surface,
        title: const Text('Sign out?'),
        content: Text("You'll need to sign in again to continue your streaks.",
            style: TextStyle(color: c.inkSoft)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Cancel', style: TextStyle(color: c.inkSoft))),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
                backgroundColor: c.brand, foregroundColor: c.brandInk),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await PushService.instance.unregister();
    await supabase.auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    final offline = _looksOffline;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
                    size: 44, color: c.inkFaint),
                const SizedBox(height: 18),
                Text(
                  offline ? 'ኢንተርኔት የለም' : 'አልተሳካም',
                  textAlign: TextAlign.center,
                  style: amharic(context, size: 22, weight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  offline
                      ? "We couldn't reach the server. Check your connection and try again."
                      : "We couldn't load your profile. Try again in a moment.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.inkSoft, fontSize: 14, height: 1.5),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: retrying ? null : onRetry,
                    style: FilledButton.styleFrom(
                      backgroundColor: c.brand,
                      foregroundColor: c.brandInk,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: retrying
                        ? SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: c.brandInk),
                          )
                        : const Text('Try again'),
                  ),
                ),
                const SizedBox(height: 6),
                TextButton(
                  onPressed: () => _signOut(context),
                  child: Text('Sign out',
                      style: TextStyle(color: c.inkFaint, fontSize: 13)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
