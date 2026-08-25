"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function OnboardingForm({
  suggested,
  defaultName,
}: {
  suggested: string;
  defaultName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState(suggested);
  const [name, setName] = useState(defaultName);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = username.trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,20}$/.test(clean);

  useEffect(() => {
    if (!clean) return setStatus("idle");
    if (!valid) return setStatus("invalid");
    setStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", clean)
        .maybeSingle();
      setStatus(data ? "taken" : "ok");
    }, 350);
    return () => clearTimeout(t);
  }, [clean, valid, supabase]);

  async function save() {
    if (status !== "ok") return;
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    const { error } = await supabase
      .from("profiles")
      .update({ username: clean, name: name.trim() || null })
      .eq("id", user.id);

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 text-center">
        <div className="amharic text-2xl font-bold">ሰላም! 👋</div>
        <p className="mt-1 text-sm text-ink-soft">
          Pick a username so friends can find you.
        </p>
      </div>

      <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        Display name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="mb-4 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
      />

      <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        Username
      </label>
      <div className="flex items-center rounded-xl border border-line bg-surface-2 px-4 focus-within:border-brand">
        <span className="text-ink-faint">@</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoCapitalize="none"
          className="w-full bg-transparent px-1 py-3 text-sm outline-none"
        />
        <StatusDot status={status} />
      </div>
      <p className="mt-1.5 h-4 text-xs">
        {status === "invalid" && (
          <span className="text-warn">3–20 chars: a–z, 0–9, _</span>
        )}
        {status === "taken" && <span className="text-red-500">@{clean} is taken</span>}
        {status === "ok" && <span className="text-good">@{clean} is available</span>}
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        onClick={save}
        disabled={status !== "ok" || busy}
        className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "…" : "Continue"}
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "checking")
    return <span className="h-2 w-2 animate-pulse rounded-full bg-ink-faint" />;
  if (status === "ok") return <span className="text-good">✓</span>;
  if (status === "taken" || status === "invalid")
    return <span className="text-red-500">✕</span>;
  return null;
}
