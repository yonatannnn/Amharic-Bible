import 'dart:async';
import 'package:flutter/material.dart';
import '../supabase.dart';
import '../theme.dart';

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _name = TextEditingController();
  final _username = TextEditingController();
  String _status = 'idle'; // idle, checking, ok, taken, invalid
  bool _busy = false;
  Timer? _debounce;

  String get _clean => _username.text.replaceAll(RegExp(r'^@+'), '').trim().toLowerCase();
  bool get _valid => RegExp(r'^[a-z0-9_]{3,20}$').hasMatch(_clean);

  @override
  void initState() {
    super.initState();
    final user = supabase.auth.currentUser;
    _name.text = (user?.userMetadata?['name'] as String?) ?? '';
    _username.addListener(_onUsernameChange);
  }

  void _onUsernameChange() {
    _debounce?.cancel();
    if (_clean.isEmpty) {
      setState(() => _status = 'idle');
      return;
    }
    if (!_valid) {
      setState(() => _status = 'invalid');
      return;
    }
    setState(() => _status = 'checking');
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      final data = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', _clean)
          .maybeSingle();
      if (mounted) setState(() => _status = data != null ? 'taken' : 'ok');
    });
  }

  Future<void> _save() async {
    if (_status != 'ok') return;
    setState(() => _busy = true);
    await supabase.from('profiles').update({
      'username': _clean,
      'name': _name.text.trim().isEmpty ? null : _name.text.trim(),
    }).eq('id', supabase.auth.currentUser!.id);
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('ሰላም! 👋',
                    style: amharic(context, size: 26, weight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text('Pick a username so friends can find you.',
                    style: TextStyle(color: c.inkSoft, fontSize: 14)),
                const SizedBox(height: 24),
                _label(c, 'Display name'),
                const SizedBox(height: 6),
                _input(c, _name, 'Your name'),
                const SizedBox(height: 16),
                _label(c, 'Username'),
                const SizedBox(height: 6),
                _input(c, _username, 'username', prefix: '@', suffix: _statusIcon(c)),
                const SizedBox(height: 6),
                SizedBox(height: 18, child: _statusText(c)),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: (_status == 'ok' && !_busy) ? _save : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: c.brand,
                      foregroundColor: c.brandInk,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(_busy ? '…' : 'Continue'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget? _statusIcon(AppColors c) {
    switch (_status) {
      case 'checking':
        return const Padding(
          padding: EdgeInsets.all(12),
          child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
        );
      case 'ok':
        return Icon(Icons.check, color: c.good, size: 20);
      case 'taken':
      case 'invalid':
        return const Icon(Icons.close, color: Colors.red, size: 20);
      default:
        return null;
    }
  }

  Widget _statusText(AppColors c) {
    switch (_status) {
      case 'invalid':
        return Text('3–20 chars: a–z, 0–9, _',
            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.warn, fontSize: 12));
      case 'taken':
        return Text('@$_clean is taken',
            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.red, fontSize: 12));
      case 'ok':
        return Text('@$_clean is available',
            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.good, fontSize: 12));
      default:
        return const SizedBox();
    }
  }

  Widget _label(AppColors c, String t) => Align(
        alignment: Alignment.centerLeft,
        child: Text(t, style: TextStyle(color: c.inkSoft, fontWeight: FontWeight.w600, fontSize: 13)),
      );

  Widget _input(AppColors c, TextEditingController ctl, String hint,
      {String? prefix, Widget? suffix}) {
    return TextField(
      controller: ctl,
      style: TextStyle(color: c.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: c.inkFaint),
        prefixText: prefix,
        prefixStyle: TextStyle(color: c.inkFaint),
        suffixIcon: suffix,
        filled: true,
        fillColor: c.surface2,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: c.brand),
        ),
      ),
    );
  }
}
