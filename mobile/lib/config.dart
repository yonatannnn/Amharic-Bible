/// App-wide configuration. The Supabase anon key is a public client key — safe
/// to ship in the app. (The service-role key is server-only and never here.)
class Config {
  static const supabaseUrl = 'https://zzbnwnhwucaneqqaxiqb.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Ym53bmh3dWNhbmVxcWF4aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4OTE0NDMsImV4cCI6MjA3MjQ2NzQ0M30.m9JzMRC_D3hkh2eQdXvVMYuVbKxuzCYhSbDeqGPuJZU';

  // Bible text is bundled in assets/bible/ (offline) — no content API.

  /// Google Web OAuth client ID (serverClientId) — the audience Supabase trusts.
  static const googleWebClientId =
      '591214558585-3oqflll1rtfgobue8pk35ecmgip60vj9.apps.googleusercontent.com';
}
