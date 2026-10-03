import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase.dart';
import '../theme.dart';
import '../services/friends.dart';
import '../services/push.dart';
import 'home.dart';
import 'reader.dart';
import 'chat_list.dart';
import 'friends.dart';
import 'profile.dart';

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;
  int _unread = 0;
  int _requests = 0;
  RealtimeChannel? _channel;

  final _screens = const [
    HomeScreen(),
    ReaderScreen(),
    ChatListScreen(),
    FriendsScreen(),
    ProfileScreen(),
  ];

  String get _uid => supabase.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    // Warm the friends cache so the verse-share picker opens instantly.
    FriendsService.instance.getFriends();
    // Register this device for push + in-app foreground banners.
    PushService.instance.register();
    PushService.instance.setupListeners();
    // Nav badges (unread + friend requests), kept live.
    _loadBadges();
    _channel = supabase
        .channel('shell-badges')
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'messages', callback: (_) => _loadBadges())
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'friendships', callback: (_) => _loadBadges())
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'group_messages', callback: (_) => _loadBadges())
        .onPostgresChanges(event: PostgresChangeEvent.all, schema: 'public', table: 'group_members', callback: (_) => _loadBadges())
        .subscribe();
    // A notification can ask the shell to jump to a tab.
    appTab.addListener(_onTabRequest);
  }

  void _onTabRequest() {
    if (mounted) setState(() => _index = appTab.value);
  }

  @override
  void dispose() {
    appTab.removeListener(_onTabRequest);
    if (_channel != null) supabase.removeChannel(_channel!);
    super.dispose();
  }

  Future<void> _loadBadges() async {
    try {
      // Unread messages from others (RLS limits to my friendships).
      final unread = await supabase
          .from('messages')
          .count(CountOption.exact)
          .neq('sender_id', _uid)
          .isFilter('read_at', null);
      // Pending requests addressed to me.
      final reqs = await supabase
          .from('friendships')
          .count(CountOption.exact)
          .eq('status', 'pending')
          .eq('addressee_id', _uid);
      // Unread group messages (newer than each group's last_read_at).
      final g = await supabase.rpc('group_unread_count');
      final groupUnread = g is int ? g : 0;
      if (mounted) setState(() { _unread = unread + groupUnread; _requests = reqs; });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: c.surface,
          indicatorColor: c.brandSoft,
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: states.contains(WidgetState.selected) ? c.brand : c.inkFaint,
            ),
          ),
        ),
        child: NavigationBar(
          height: 64,
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: [
            _dest(c, Icons.home_outlined, Icons.home, 'Home'),
            _dest(c, Icons.menu_book_outlined, Icons.menu_book, 'Read'),
            _dest(c, Icons.chat_bubble_outline, Icons.chat_bubble, 'Chat', badge: _unread),
            _dest(c, Icons.people_outline, Icons.people, 'Friends', badge: _requests),
            _dest(c, Icons.person_outline, Icons.person, 'Profile'),
          ],
        ),
      ),
    );
  }

  NavigationDestination _dest(
      AppColors c, IconData icon, IconData active, String label, {int badge = 0}) {
    Widget withBadge(Widget child) => badge > 0
        ? Badge(
            label: Text(badge > 99 ? '99+' : '$badge'),
            backgroundColor: c.brand,
            textColor: c.brandInk,
            child: child,
          )
        : child;
    return NavigationDestination(
      icon: withBadge(Icon(icon, color: c.inkFaint)),
      selectedIcon: withBadge(Icon(active, color: c.brand)),
      label: label,
    );
  }
}
