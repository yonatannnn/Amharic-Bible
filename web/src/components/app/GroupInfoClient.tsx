"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClickableAvatar } from "./ClickableAvatar";
import type { GroupMember } from "@/lib/groups";

type Profile = {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

export function GroupInfoClient({
  myId,
  group,
}: {
  myId: string;
  group: {
    id: string;
    name: string;
    avatar_url: string | null;
    created_by: string;
    members: GroupMember[];
    myRole: string;
  };
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [members, setMembers] = useState<GroupMember[]>(group.members);
  const [name, setName] = useState(group.name);
  const [editingName, setEditingName] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = group.myRole === "owner";
  const memberIds = new Set(members.map((m) => m.id));

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

  async function addMember(p: Profile) {
    if (memberIds.has(p.id) || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("add_group_member", {
      p_group: group.id,
      p_user: p.id,
    });
    setBusy(false);
    if (!error) {
      setMembers((prev) => [...prev, { ...p, role: "member" }]);
      setTerm("");
      setResults([]);
    }
  }

  async function removeMember(id: string) {
    if (busy) return;
    setBusy(true);
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", id);
    setBusy(false);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function saveName() {
    const next = name.trim();
    setEditingName(false);
    if (!next || next === group.name) return;
    await supabase.from("groups").update({ name: next }).eq("id", group.id);
    router.refresh();
  }

  async function leave() {
    if (!confirm("Leave this group? You'll need to be re-added to rejoin.")) return;
    setBusy(true);
    await supabase
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", myId);
    router.push("/chat");
    router.refresh();
  }

  async function deleteGroup() {
    if (!confirm("Delete this group for everyone? This can't be undone.")) return;
    setBusy(true);
    await supabase.from("groups").delete().eq("id", group.id);
    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="flex items-center gap-3">
        <Link
          href={`/group/${group.id}`}
          className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-surface-2"
        >
          ←
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Group info</h1>
      </div>

      {/* name */}
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-gold text-2xl font-bold text-white">
          {group.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              autoFocus
              className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 outline-none focus:border-brand"
            />
          ) : (
            <button
              onClick={() => isOwner && setEditingName(true)}
              className={`truncate text-left text-lg font-bold ${isOwner ? "hover:underline" : ""}`}
            >
              {group.name}
            </button>
          )}
          <div className="text-xs text-ink-faint">
            {members.length} member{members.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* members */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Members
      </h2>
      <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
        {members.map((m, i) => (
          <div
            key={m.id}
            className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <ClickableAvatar name={m.name ?? m.username ?? "?"} url={m.avatar_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {m.name ?? m.username}
                {m.id === myId && <span className="text-ink-faint"> (you)</span>}
              </div>
              <div className="truncate text-xs text-ink-faint">@{m.username}</div>
            </div>
            {m.role === "owner" ? (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
                Owner
              </span>
            ) : (
              isOwner && (
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-sm text-red-500 hover:underline"
                >
                  Remove
                </button>
              )
            )}
          </div>
        ))}
      </div>

      {/* add members */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Add members
      </h2>
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search a username…"
        className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-brand"
      />
      <div className="mt-2 space-y-1">
        {results
          .filter((p) => !memberIds.has(p.id))
          .map((p) => (
            <button
              key={p.id}
              onClick={() => addMember(p)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2"
            >
              <ClickableAvatar name={p.name ?? p.username ?? "?"} url={p.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name ?? p.username}</div>
                <div className="truncate text-xs text-ink-faint">@{p.username}</div>
              </div>
              <span className="grid h-6 w-6 place-items-center rounded-full border border-line text-sm text-ink-faint">
                +
              </span>
            </button>
          ))}
      </div>

      {/* danger zone */}
      <div className="mt-10 space-y-2">
        <button
          onClick={leave}
          className="w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold text-red-500 hover:bg-surface-2"
        >
          Leave group
        </button>
        {isOwner && (
          <button
            onClick={deleteGroup}
            className="w-full rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/20"
          >
            Delete group
          </button>
        )}
      </div>
    </div>
  );
}
