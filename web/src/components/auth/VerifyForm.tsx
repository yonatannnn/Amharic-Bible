"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * Confirm a new account with the 6-digit code emailed at signup (mirrors the
 * mobile app). A non-existent email never receives the code, so it can never be
 * verified. Verifying signs the user in, so we route on to onboarding.
 */
export function VerifyForm() {
  const router = useRouter();
  const supabase = createClient();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        type: "signup",
        email,
        token: code.trim(),
      });
      if (error) throw error;
      // Verifying signs us in — continue to set up the profile.
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify. Is the code correct?");
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setNotice("New code sent.");
    } catch {
      setError("Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 text-center">
        <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-gold text-xl text-white">
          ✝
        </span>
        <h1 className="mt-4 text-2xl font-bold">Verify your email</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Enter the 6-digit code we sent to{" "}
          <span className="font-semibold text-ink">{email || "your email"}</span> to
          activate your account.
        </p>
      </div>

      <form onSubmit={verify} className="space-y-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit code"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-center text-lg font-semibold tracking-[0.4em] outline-none focus:border-brand"
        />

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
        )}
        {notice && (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{notice}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "…" : "Verify"}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          onClick={resend}
          disabled={busy}
          className="font-semibold text-brand hover:underline disabled:opacity-60"
        >
          Resend code
        </button>
        <Link href="/login" className="text-ink-soft hover:text-ink">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
