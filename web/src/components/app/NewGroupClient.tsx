"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClickableAvatar } from "./ClickableAvatar";

type Profile = {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

export function NewGroupClient({ myId }: { myId: string }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const t = term.replace(/^@+/, "").trim().toLowerCase();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .ilike("username", `%${t}%`)
        .neq("id", myId)
        .limit(8);
      setResults((data as Profile[]) ?? []);
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [term, supabase, myId]);

  const selectedIds = new Set(selected.map((s) => s.id));

  function toggle(p: Profile) {
    setSelected((prev) =>
      prev.some((s) => s.id === p.id) ? prev.filter((s) => s.id !== p.id) : [...prev, p],
    );
  }

  async function create() {
    if (!name.trim() || selected.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_group", {
      p_name: name.trim(),
      p_members: selected.map((s) => s.id),
    });
    if (error || !data) {
      setError(error?.message ?? "Couldn't create the group.");
      setCreating(false);
      return;
    }
    router.push(`/group/${data as string}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/chat"
          className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-surface-2"
        >
          ←
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">New group</h1>
      </div>

      {/* name */}
      <label className="mt-6 block text-sm font-semibold text-ink-soft">Group name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Morning Devotions"
        maxLength={60}
        className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-brand"
      />

      {/* selected chips */}
      {selected.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {selected.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s)}
              className="flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-1 pr-3 text-sm text-brand"
            >
              <ClickableAvatar name={s.name ?? s.username ?? "?"} url={s.avatar_url} size={22} />
              {s.name ?? s.username}
              <span className="text-ink-faint">✕</span>
            </button>
          ))}
        </div>
      )}

      {/* member search */}
      <label className="mt-6 block text-sm font-semibold text-ink-soft">Add members</label>
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search a username…"
        className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-brand"
      />

      <div className="mt-3 space-y-1">
        {results.map((p) => {
          const on = selectedIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2"
            >
              <ClickableAvatar name={p.name ?? p.username ?? "?"} url={p.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name ?? p.username}</div>
                <div className="truncate text-xs text-ink-faint">@{p.username}</div>
              </div>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-sm ${
                  on ? "border-brand bg-brand text-white" : "border-line text-ink-faint"
                }`}
              >
                {on ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={create}
        disabled={!name.trim() || selected.length === 0 || creating}
        className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40"
      >
        {creating
          ? "Creating…"
          : `Create group${selected.length ? ` · ${selected.length} member${selected.length === 1 ? "" : "s"}` : ""}`}
      </button>
    </div>
  );
}
