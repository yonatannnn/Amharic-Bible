"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { startProgress, doneProgress } from "@/lib/progress";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function handleGoogle() {
    setError(null);
    startProgress(); // show the top bar until the OAuth redirect leaves the page
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      doneProgress();
      setError(error.message);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    startProgress();
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        // If email confirmation is OFF, a session is returned immediately.
        if (data.session) {
          router.push("/onboarding");
          router.refresh();
        } else {
          // Confirmation required — collect the 6-digit code (mirrors mobile).
          router.push(`/verify?email=${encodeURIComponent(email)}`);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/home");
        router.refresh();
      }
    } catch (err) {
      doneProgress();
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 font-bold">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-gold text-xl text-white">
            ✝
          </span>
        </Link>
        <h1 className="amharic mt-4 text-2xl font-bold">
          {isSignup ? "ይመዝገቡ" : "እንኳን ደህና መጡ"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isSignup
            ? "Create your account to start a streak."
            : "Sign in to continue your streak."}
        </p>
      </div>

      <button
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold shadow-card transition hover:bg-surface-2"
      >
        <GoogleIcon /> Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
        <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
        />

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-semibold text-brand hover:underline"
        >
          {isSignup ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
