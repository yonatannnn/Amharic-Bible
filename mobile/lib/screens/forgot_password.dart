import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase.dart';
import '../theme.dart';
import '../widgets/cross_logo.dart';

/// In-app password reset: email a 6-digit code, verify it, set a new password —
/// all on the phone (no web redirect, no signing in elsewhere).
class ForgotPasswordScreen extends StatefulWidget {
  final String? initialEmail;
  const ForgotPasswordScreen({super.key, this.initialEmail});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  int _step = 0; // 0 = enter email, 1 = enter code + new password
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail ?? '';
  }

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your email');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setState(() { _busy = false; _step = 1; });
    } catch (_) {
      setState(() { _busy = false; _error = 'Could not send the code. Check the email.'; });
    }
  }

  Future<void> _reset() async {
    final code = _code.text.trim();
    if (code.length < 6) {
      setState(() => _error = 'Enter the 6-digit code from your email');
      return;
    }
    if (_password.text.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await supabase.auth.verifyOTP(
        type: OtpType.recovery,
        email: _email.text.trim(),
        token: code,
      );
      await supabase.auth.updateUser(UserAttributes(password: _password.text));
      if (!mounted) return;
      // Verifying signs us in on this device; pop back so AuthGate shows the app.
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated — you\'re signed in'), behavior: SnackBarBehavior.floating),
      );
    } on AuthException catch (e) {
      setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      setState(() { _busy = false; _error = 'Could not reset. Is the code correct?'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: c.canvas,
        surfaceTintColor: c.canvas,
        elevation: 0,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const CrossLogo(size: 52),
              const SizedBox(height: 18),
              Text('Reset password', style: display(context, size: 24, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(
                _step == 0
                    ? 'We\'ll email you a 6-digit code.'
                    : 'Enter the code we sent to ${_email.text.trim()} and choose a new password.',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.inkSoft, fontSize: 14),
              ),
              const SizedBox(height: 26),
              if (_step == 0) ...[
                _field(c, _email, 'Email', TextInputType.emailAddress),
              ] else ...[
                _field(c, _code, '6-digit code', TextInputType.number),
                const SizedBox(height: 12),
                _field(c, _password, 'New password', TextInputType.text,
                    obscure: !_showPassword,
                    suffix: IconButton(
                      icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20, color: c.inkFaint),
                      onPressed: () => setState(() => _showPassword = !_showPassword),
                    )),
                const SizedBox(height: 12),
                _field(c, _confirm, 'Confirm new password', TextInputType.text, obscure: !_showPassword),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                _banner(_error!, Colors.red),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : (_step == 0 ? _sendCode : _reset),
                  style: FilledButton.styleFrom(
                    backgroundColor: c.brand,
                    foregroundColor: c.brandInk,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(_busy ? '…' : (_step == 0 ? 'Send code' : 'Reset password')),
                ),
              ),
              if (_step == 1) ...[
                const SizedBox(height: 14),
                GestureDetector(
                  onTap: _busy ? null : _sendCode,
                  child: Text('Resend code', style: TextStyle(color: c.brand, fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }

  Widget _field(AppColors c, TextEditingController ctl, String hint, TextInputType kt,
      {bool obscure = false, Widget? suffix}) {
    return TextField(
      controller: ctl,
      keyboardType: kt,
      obscureText: obscure,
      style: TextStyle(color: c.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: c.inkFaint),
        suffixIcon: suffix,
        filled: true,
        fillColor: c.surface2,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.line)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: c.brand)),
      ),
    );
  }

  Widget _banner(String msg, Color color) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
      child: Text(msg, style: TextStyle(color: color, fontSize: 13)),
    );
  }
}
