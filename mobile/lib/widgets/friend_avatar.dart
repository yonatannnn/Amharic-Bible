import 'package:flutter/material.dart';
import '../theme.dart';
import '../services/friends.dart';
import '../screens/friend_profile.dart';

/// A friend's avatar that opens their profile when tapped. Used everywhere
/// a friend's avatar appears (friends list, chat list, chat header).
class FriendAvatar extends StatelessWidget {
  final FriendInfo friend;
  final double radius;
  const FriendAvatar({super.key, required this.friend, this.radius = 24});

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(
        builder: (_) => FriendProfileScreen(friend: friend),
      )),
      child: CircleAvatar(
        radius: radius,
        backgroundColor: c.good,
        backgroundImage: friend.avatarUrl != null ? NetworkImage(friend.avatarUrl!) : null,
        child: friend.avatarUrl == null
            ? Text(friend.display[0].toUpperCase(),
                style: TextStyle(color: Colors.white, fontSize: radius * 0.7, fontWeight: FontWeight.bold))
            : null,
      ),
    );
  }
}
