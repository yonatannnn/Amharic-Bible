import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase.dart';
import '../theme.dart';
import '../widgets/cross_logo.dart';

/// Confirm a new account with the 6-digit code emailed at signup.
/// A non-existent email never receives the code, so it can never be verified.
/// Verifying signs the user in, so AuthGate then shows the app.
class VerifyEmailScreen extends StatefulWidget {
  final String email;
  const VerifyEmailScreen({super.key, required this.email});
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (code.length < 6) {
      setState(() => _error = 'Enter the 6-digit code from your email');
      return;
    }
    setState(() { _busy = true; _error = null; _notice = null; });
    try {
      await supabase.auth.verifyOTP(type: OtpType.signup, email: widget.email, token: code);
      if (!mounted) return;
      // Verifying signs us in on this device; pop so AuthGate shows the app.
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Email verified — welcome!'), behavior: SnackBarBehavior.floating),
      );
    } on AuthException catch (e) {
      setState(() { _busy = false; _error = e.message; });
    } catch (_) {
      setState(() { _busy = false; _error = 'Could not verify. Is the code correct?'; });
    }
  }

  Future<void> _resend() async {
    setState(() { _busy = true; _error = null; _notice = null; });
    try {
      await supabase.auth.resend(type: OtpType.signup, email: widget.email);
      setState(() { _busy = false; _notice = 'New code sent.'; });
    } catch (_) {
      setState(() { _busy = false; _error = 'Could not resend the code.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: c.canvas, surfaceTintColor: c.canvas, elevation: 0),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const CrossLogo(size: 52),
              const SizedBox(height: 18),
              Text('Verify your email', style: display(context, size: 24, weight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(
                'Enter the 6-digit code we sent to ${widget.email} to activate your account.',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.inkSoft, fontSize: 14),
              ),
              const SizedBox(height: 26),
              _field(c, _code, '6-digit code', TextInputType.number),
              if (_error != null) ...[
                const SizedBox(height: 12),
                _banner(_error!, Colors.red),
              ],
              if (_notice != null) ...[
                const SizedBox(height: 12),
                _banner(_notice!, c.brand),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : _verify,
                  style: FilledButton.styleFrom(
                    backgroundColor: c.brand,
                    foregroundColor: c.brandInk,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(_busy ? '…' : 'Verify'),
                ),
              ),
              const SizedBox(height: 14),
              GestureDetector(
                onTap: _busy ? null : _resend,
                child: Text('Resend code', style: TextStyle(color: c.brand, fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _field(AppColors c, TextEditingController ctl, String hint, TextInputType kt) {
    return TextField(
      controller: ctl,
      keyboardType: kt,
      style: TextStyle(color: c.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: c.inkFaint),
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
