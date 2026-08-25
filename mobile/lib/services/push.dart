import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../supabase.dart';
import '../theme.dart';
import 'friends.dart';
import '../screens/chat_thread.dart';

/// Global navigator key so push taps / in-app banners can navigate + overlay.
final navigatorKey = GlobalKey<NavigatorState>();

/// Lets a notification jump the shell to a tab (0=Home … 3=Friends).
final appTab = ValueNotifier<int>(0);

/// Background isolate handler. The system shows notifications that carry a
/// `notification` payload automatically, so there's nothing to do here.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {}

class PushService {
  PushService._();
  static final instance = PushService._();

  bool _ready = false;
  bool _listening = false;

  /// Initialise Firebase + register the background handler. Call once in main().
  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  /// After sign-in: request permission, get the FCM token, store it, and keep
  /// it fresh on refresh.
  Future<void> register() async {
    if (!_ready) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final token = await messaging.getToken();
      if (token != null) await _saveToken(token);
      messaging.onTokenRefresh.listen(_saveToken);
    } catch (_) {}
  }

  Future<void> _saveToken(String token) async {
    final uid = supabase.auth.currentUser?.id;
    if (uid == null) return;
    try {
      await supabase.from('device_tokens').upsert({
        'token': token,
        'user_id': uid,
        'platform': 'android',
        'updated_at': DateTime.now().toIso8601String(),
      });
    } catch (_) {}
  }

  /// Foreground in-app banner + tap-to-open-chat handling.
  void setupListeners() {
    if (!_ready || _listening) return;
    _listening = true;
    FirebaseMessaging.onMessage.listen(_onForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_openChat);
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) _openChat(m);
    });
  }

  void _onForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null) return;
    final avatar = m.data['senderAvatar'] as String?;
    _showBanner(n.title ?? 'New message', n.body ?? '',
        (avatar != null && avatar.isNotEmpty) ? avatar : null, () => _openChat(m));
  }

  Future<void> _openChat(RemoteMessage m) async {
    if (m.data['type'] == 'friend-request') {
      appTab.value = 3; // Friends tab
      navigatorKey.currentState?.popUntil((r) => r.isFirst);
      return;
    }
    final fid = m.data['friendshipId'];
    if (fid == null) return;
    final friends = await FriendsService.instance.getFriends();
    FriendInfo? friend;
    for (final f in friends) {
      if (f.friendshipId == fid) { friend = f; break; }
    }
    if (friend == null) return;
    navigatorKey.currentState?.push(MaterialPageRoute(
      builder: (_) => ChatThreadScreen(friendshipId: fid, friend: friend!),
    ));
  }

  void _showBanner(String title, String body, String? avatarUrl, VoidCallback onTap) {
    final overlay = navigatorKey.currentState?.overlay;
    if (overlay == null) return;
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _InAppBanner(
        title: title,
        body: body,
        avatarUrl: avatarUrl,
        onTap: () { entry.remove(); onTap(); },
        onDismiss: () { if (entry.mounted) entry.remove(); },
      ),
    );
    overlay.insert(entry);
    Future.delayed(const Duration(seconds: 4), () { if (entry.mounted) entry.remove(); });
  }

  /// Remove this device's token on sign-out.
  Future<void> unregister() async {
    if (!_ready) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await supabase.from('device_tokens').delete().eq('token', token);
      }
    } catch (_) {}
  }
}

/// A top in-app notification banner shown for foreground messages.
class _InAppBanner extends StatefulWidget {
  final String title, body;
  final String? avatarUrl;
  final VoidCallback onTap, onDismiss;
  const _InAppBanner({required this.title, required this.body, this.avatarUrl, required this.onTap, required this.onDismiss});
  @override
  State<_InAppBanner> createState() => _InAppBannerState();
}

class _InAppBannerState extends State<_InAppBanner> with SingleTickerProviderStateMixin {
  late final AnimationController _ctl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 280))..forward();
  late final Animation<Offset> _slide =
      Tween(begin: const Offset(0, -1.2), end: Offset.zero).animate(CurvedAnimation(parent: _ctl, curve: Curves.easeOut));

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Positioned(
      top: 0, left: 0, right: 0,
      child: SlideTransition(
        position: _slide,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Material(
              color: Colors.transparent,
              child: Dismissible(
                key: const ValueKey('inapp-banner'),
                direction: DismissDirection.up,
                onDismissed: (_) => widget.onDismiss(),
                child: GestureDetector(
                  onTap: widget.onTap,
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.line),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 6))],
                    ),
                    child: Row(children: [
                      (widget.avatarUrl != null)
                          ? CircleAvatar(radius: 20, backgroundColor: c.good, backgroundImage: NetworkImage(widget.avatarUrl!))
                          : Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(colors: [c.brand, c.gold]),
                                borderRadius: BorderRadius.circular(11),
                              ),
                              child: const Icon(Icons.notifications, color: Colors.white, size: 20),
                            ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: c.ink, fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 1),
                        Text(widget.body, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: c.inkSoft, fontSize: 13)),
                      ])),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
