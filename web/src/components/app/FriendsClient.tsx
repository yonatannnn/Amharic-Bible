"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { FriendInfo, IncomingRequest, OutgoingRequest } from "@/lib/friends";
import { ClickableAvatar } from "./ClickableAvatar";

type SearchRow = {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

export function FriendsClient({
  myId,
  myUsername,
  friends,
  incoming,
  outgoing,
}: {
  myId: string;
  myUsername: string;
  friends: FriendInfo[];
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [reqTab, setReqTab] = useState<"received" | "sent">("received");

  const friendIds = new Set(friends.map((f) => f.friend.id));
  const outgoingIds = new Set(outgoing.map((o) => o.addressee.id));
  const incomingByUser = new Map(incoming.map((i) => [i.requester.id, i.id]));
  const [inviteUrl, setInviteUrl] = useState("");
  useEffect(() => {
    setInviteUrl(`${window.location.origin}/add/${myUsername}`);
  }, [myUsername]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  async function search(value: string) {
    setQ(value);
    const term = value.trim().toLowerCase().replace(/^@+/, "");
    if (term.length < 2) return setResults([]);
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, name, avatar_url")
      .ilike("username", `%${term}%`)
      .neq("id", myId)
      .limit(8);
    setResults(((data as SearchRow[]) ?? []).filter((r) => !friendIds.has(r.id)));
    setSearching(false);
  }

  async function sendRequest(addresseeId: string) {
    const { error } = await supabase.from("friendships").insert({
      requester_id: myId,
      addressee_id: addresseeId,
      status: "pending",
    });
    if (error)
      flash(error.message.includes("duplicate") ? "Request already exists" : error.message);
    else {
      setSentTo((s) => new Set(s).add(addresseeId));
      flash("Request sent 🙌");
    }
  }

  async function respond(id: string, status: "accepted" | "declined") {
    await supabase
      .from("friendships")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  async function cancelRequest(id: string) {
    await supabase.from("friendships").delete().eq("id", id);
    flash("Request cancelled");
    router.refresh();
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl);
    flash("Invite link copied");
  }

  async function shareInvite() {
    const text = `Add me on መጽሐፍ ቅዱስ — let's keep a verse streak: ${inviteUrl}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* user dismissed */
      }
    } else {
      navigator.clipboard.writeText(inviteUrl);
      flash("Invite link copied");
    }
  }

  return (
    <div className="mt-7">
      {/* ── Your friends ───────────────────────────────── */}
      <section>
        <SectionTitle title="Your friends" count={friends.length || undefined} />
        {friends.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
              {friends.map((f, i) => (
                <div
                  key={f.friendshipId}
                  className={`flex items-center gap-3.5 px-3.5 py-2.5 ${
                    i > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <ClickableAvatar
                    name={f.friend.name ?? f.friend.username}
                    url={f.friend.avatar_url}
                    size={46}
                  />
                  <Link href={`/friend/${f.friendshipId}`} className="min-w-0 flex-1">
                    <div className="truncate font-semibold hover:underline">
                      {f.friend.name ?? f.friend.username}
                    </div>
                    <div className="truncate text-sm text-ink-faint">
                      @{f.friend.username}
                    </div>
                  </Link>
                  <span className="flex items-center gap-1 text-sm font-bold text-ink-soft">
                    🔥 {f.streak?.count ?? 0}
                  </span>
                  <Link
                    href={`/chat/${f.friendshipId}`}
                    className="shrink-0 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-ink transition hover:brightness-110"
                  >
                    Chat
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-2 px-1 text-[11px] text-ink-faint">
              Open a friend to view your streak or remove them.
            </p>
          </>
        ) : (
          <div className="rounded-[18px] border border-line bg-surface px-5 py-8 text-center">
            <div className="font-display text-4xl text-gold/50">✦</div>
            <h3 className="amharic mt-2.5 text-lg font-bold">No friends yet</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Search a username below, or share your invite link.
            </p>
          </div>
        )}
      </section>

      {/* ── Requests ───────────────────────────────────── */}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <>
          <Divider />
          <section>
            <SectionTitle title="Requests" />
            <div className="mb-3.5 flex gap-2">
              {(["received", "sent"] as const).map((t) => {
                const active = reqTab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setReqTab(t)}
                    className={`rounded-[10px] border px-3.5 py-1.5 text-sm font-semibold transition ${
                      active
                        ? "border-brand bg-brand text-brand-ink"
                        : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {t === "received" ? "Received" : "Sent"} ·{" "}
                    {t === "received" ? incoming.length : outgoing.length}
                  </button>
                );
              })}
            </div>

            {reqTab === "received" ? (
              incoming.length === 0 ? (
                <p className="px-1 text-sm text-ink-faint">No requests received.</p>
              ) : (
                <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
                  {incoming.map((r, i) => (
                    <div
                      key={r.id}
                      className={`px-3.5 py-3 ${i > 0 ? "border-t border-line" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <ClickableAvatar
                          name={r.requester.name ?? r.requester.username}
                          url={r.requester.avatar_url}
                          size={42}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">
                            {r.requester.name ?? r.requester.username}
                          </div>
                          <div className="truncate text-sm text-ink-faint">
                            @{r.requester.username}
                          </div>
                        </div>
                      </div>
                      {/* actions below the name (roomy, never crowds it) */}
                      <div className="mt-2.5 flex gap-2.5">
                        <button
                          onClick={() => respond(r.id, "accepted")}
                          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-brand-ink transition hover:brightness-110"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => respond(r.id, "declined")}
                          className="flex-1 rounded-xl border border-line py-2 text-sm font-semibold text-ink-soft transition hover:border-red-400 hover:text-red-500"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : outgoing.length === 0 ? (
              <p className="px-1 text-sm text-ink-faint">No requests sent.</p>
            ) : (
              <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
                {outgoing.map((r, i) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 px-3.5 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <ClickableAvatar
                      name={r.addressee.name ?? r.addressee.username}
                      url={r.addressee.avatar_url}
                      size={42}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {r.addressee.name ?? r.addressee.username}
                      </div>
                      <div className="truncate text-sm text-ink-faint">
                        @{r.addressee.username}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-ink-faint">Pending</span>
                    <button
                      onClick={() => cancelRequest(r.id)}
                      className="px-1 text-ink-faint transition hover:text-red-500"
                      title="Cancel request"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Add a friend ───────────────────────────────── */}
      <Divider />
      <section>
        <SectionTitle title="Add a friend" />
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 focus-within:border-brand">
          <span className="text-ink-faint">🔍</span>
          <span className="text-ink-faint">@</span>
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="search a username"
            autoCapitalize="none"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
          />
          {searching && <div className="spinner !h-4 !w-4 !border-2" />}
        </div>

        <div className="mt-3 space-y-2.5">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              <ClickableAvatar name={r.name ?? r.username} url={r.avatar_url} size={42} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.name ?? r.username}</div>
                <div className="truncate text-sm text-ink-faint">@{r.username}</div>
              </div>
              {(() => {
                const alreadySent = sentTo.has(r.id) || outgoingIds.has(r.id);
                const incomingId = incomingByUser.get(r.id);
                if (alreadySent)
                  return (
                    <span className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-ink-faint">
                      Pending
                    </span>
                  );
                if (incomingId)
                  return (
                    <button
                      onClick={() => respond(incomingId, "accepted")}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition hover:brightness-110"
                    >
                      Accept
                    </button>
                  );
                return (
                  <button
                    onClick={() => sendRequest(r.id)}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition hover:brightness-110"
                  >
                    Add
                  </button>
                );
              })()}
            </div>
          ))}
          {q.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="px-1 text-sm text-ink-faint">No one new found for “{q}”.</p>
          )}
        </div>
      </section>

      {/* ── Invite ─────────────────────────────────────── */}
      <Divider />
      <section>
        <SectionTitle title="Invite a friend" />
        <div className="rounded-[18px] border border-gold/40 bg-gold-soft/40 p-4">
          <p className="text-sm text-ink-soft">
            Send this link — whoever opens it is paired with you instantly.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5 pl-4">
            <span className="flex-1 truncate text-sm text-ink-soft">{inviteUrl}</span>
            <button
              onClick={copyInvite}
              className="rounded-lg p-2 text-ink-soft transition hover:bg-surface-2"
              title="Copy link"
            >
              📋
            </button>
          </div>
          <button
            onClick={shareInvite}
            className="mt-2.5 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:brightness-110"
          >
            ↗ Share invite
          </button>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">
          {count}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="my-7 h-px bg-line" />;
}
