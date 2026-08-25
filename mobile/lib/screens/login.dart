import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config.dart';
import '../supabase.dart';
import '../theme.dart';
import '../widgets/cross_logo.dart';
import 'forgot_password.dart';
import 'verify_email.dart';

bool _gsiInitialized = false;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _isSignup = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;
  String? _notice;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (email.isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password');
      return;
    }
    if (_isSignup) {
      if (_password.text.length < 6) {
        setState(() => _error = 'Password must be at least 6 characters');
        return;
      }
      if (_password.text != _confirm.text) {
        setState(() => _error = 'Passwords do not match');
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      if (_isSignup) {
        final res = await supabase.auth.signUp(email: email, password: _password.text);
        if (res.session == null) {
          // Email confirmation is required — collect the 6-digit code.
          if (!mounted) return;
          Navigator.push(context, MaterialPageRoute(
            builder: (_) => VerifyEmailScreen(email: email),
          ));
        }
      } else {
        await supabase.auth.signInWithPassword(email: email, password: _password.text);
      }
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Something went wrong');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _forgotPassword() {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => ForgotPasswordScreen(initialEmail: _email.text.trim()),
    ));
  }

  Future<void> _signInWithGoogle() async {
    setState(() { _busy = true; _error = null; _notice = null; });
    try {
      if (!_gsiInitialized) {
        await GoogleSignIn.instance.initialize(serverClientId: Config.googleWebClientId);
        _gsiInitialized = true;
      }
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) {
        setState(() => _error = 'Google sign-in failed (no token).');
        return;
      }
      await supabase.auth.signInWithIdToken(provider: OAuthProvider.google, idToken: idToken);
      // AuthGate routes onward.
    } on GoogleSignInException catch (e) {
      if (e.code != GoogleSignInExceptionCode.canceled) {
        setState(() => _error = 'Google sign-in failed.');
      }
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Google sign-in failed.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
                const CrossLogo(size: 56),
                const SizedBox(height: 18),
                Text(_isSignup ? 'ይመዝገቡ' : 'እንኳን ደህና መጡ',
                    style: amharic(context, size: 24, weight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(
                  _isSignup
                      ? 'Create your account to start a streak.'
                      : 'Sign in to continue your streak.',
                  style: TextStyle(color: c.inkSoft, fontSize: 14),
                ),
                const SizedBox(height: 26),
                _field(c, _email, 'Email', TextInputType.emailAddress),
                const SizedBox(height: 12),
                _field(c, _password, 'Password', TextInputType.text,
                    obscure: !_showPassword,
                    suffix: IconButton(
                      icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20, color: c.inkFaint),
                      onPressed: () => setState(() => _showPassword = !_showPassword),
                    )),
                if (_isSignup) ...[
                  const SizedBox(height: 12),
                  _field(c, _confirm, 'Confirm password', TextInputType.text, obscure: !_showPassword),
                ],
                if (!_isSignup) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: GestureDetector(
                      onTap: _forgotPassword,
                      child: Text('Forgot password?',
                          style: TextStyle(color: c.brand, fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  _banner(_error!, Colors.red),
                ],
                if (_notice != null) ...[
                  const SizedBox(height: 12),
                  _banner(_notice!, c.good),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: c.brand,
                      foregroundColor: c.brandInk,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(_busy
                        ? '…'
                        : _isSignup
                            ? 'Create account'
                            : 'Sign in'),
                  ),
                ),
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(child: Divider(color: c.line)),
                  Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('or', style: TextStyle(color: c.inkFaint, fontSize: 13))),
                  Expanded(child: Divider(color: c.line)),
                ]),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _signInWithGoogle,
                    icon: const Text('G', style: TextStyle(color: Color(0xFF4285F4), fontWeight: FontWeight.w800, fontSize: 18)),
                    label: const Text('Continue with Google'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: c.ink,
                      side: BorderSide(color: c.line),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                GestureDetector(
                  onTap: () => setState(() {
                    _isSignup = !_isSignup;
                    _error = null;
                    _notice = null;
                  }),
                  child: Text.rich(
                    TextSpan(
                      text: _isSignup ? 'Already have an account? ' : 'New here? ',
                      style: TextStyle(color: c.inkSoft, fontSize: 14),
                      children: [
                        TextSpan(
                          text: _isSignup ? 'Sign in' : 'Create one',
                          style: TextStyle(color: c.brand, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
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
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(msg, style: TextStyle(color: color, fontSize: 13)),
    );
  }
}
