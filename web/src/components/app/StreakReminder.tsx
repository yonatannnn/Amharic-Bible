"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LOW_HOURS = 5; // grace window: 6 AM → 11 AM EAT (deadline is 11 AM)

type StreakState = {
  friendshipId: string;
  friendName: string;
  count: number;
  deadline: string | null;
  meShared: boolean;
  broken: boolean;
};

export function StreakReminder({ myId }: { myId: string }) {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<StreakState | null>(null);
  const [, force] = useState(0); // re-render for the countdown
  const [dismissed, setDismissed] = useState(false);
  const [canNotify, setCanNotify] = useState(false);
  const notifiedFor = useRef<string | null>(null);

  // load all accepted friendships, then surface the most urgent streak
  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
    if (!rows || rows.length === 0) return setState(null);

    const fids = rows.map((r) => r.id);
    const friendIds = rows.map((r) =>
      r.requester_id === myId ? r.addressee_id : r.requester_id,
    );
    const [{ data: streaks }, { data: profiles }] = await Promise.all([
      supabase
        .from("streaks")
        .select(
          "friendship_id, count, window_deadline, requester_shared, addressee_shared, broken",
        )
        .in("friendship_id", fids),
      supabase.from("profiles").select("id, name, username").in("id", friendIds),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const streakByF = new Map((streaks ?? []).map((s) => [s.friendship_id, s]));

    let best: StreakState | null = null;
    let bestDeadline = Infinity;
    for (const r of rows) {
      const s = streakByF.get(r.id);
      if (!s || s.broken || s.count < 1 || !s.window_deadline) continue;
      const iAmRequester = r.requester_id === myId;
      const meShared = iAmRequester ? s.requester_shared : s.addressee_shared;
      if (meShared) continue;
      const dl = new Date(s.window_deadline).getTime();
      if (dl < bestDeadline) {
        bestDeadline = dl;
        const friendId = iAmRequester ? r.addressee_id : r.requester_id;
        const p = profileById.get(friendId);
        best = {
          friendshipId: r.id,
          friendName: p?.name ?? p?.username ?? "your friend",
          count: s.count,
          deadline: s.window_deadline,
          meShared,
          broken: s.broken,
        };
      }
    }
    setState(best);
  }, [supabase, myId]);

  useEffect(() => {
    load();
    if (typeof Notification !== "undefined") {
      setCanNotify(Notification.permission === "granted");
    }
  }, [load]);

  // live streak updates + a ticking clock for the countdown
  useEffect(() => {
    const ch = supabase
      .channel("streak-reminder")
      .on("postgres_changes", { event: "*", schema: "public", table: "streaks" }, load)
      .subscribe();
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(id);
    };
  }, [supabase, load]);

  const msLeft = state?.deadline
    ? new Date(state.deadline).getTime() - Date.now()
    : null;
  const hoursLeft = msLeft != null ? msLeft / 3_600_000 : null;

  const show =
    !!state &&
    !state.broken &&
    !state.meShared &&
    state.count >= 1 &&
    hoursLeft != null &&
    hoursLeft > 0 &&
    hoursLeft <= LOW_HOURS &&
    !dismissed;

  // fire a one-time browser notification per window while the tab is open
  useEffect(() => {
    if (!show || !state || !canNotify || msLeft == null) return;
    if (notifiedFor.current === state.deadline) return;
    notifiedFor.current = state.deadline;
    try {
      new Notification("🔥 Keep your streak!", {
        body: `${fmt(msLeft)} left — share a verse with ${state.friendName}.`,
      });
    } catch {
      /* ignore */
    }
  }, [show, state, canNotify, msLeft]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setCanNotify(p === "granted");
  }

  if (!show || !state || msLeft == null) return null;

  const low = hoursLeft != null && hoursLeft < 2;

  return (
    <div className="fixed inset-x-0 top-0 z-[55] px-3 pt-2">
      <div
        className={`mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-pop backdrop-blur ${
          low
            ? "border-red-500/30 bg-red-500/10"
            : "border-warn/30 bg-warn/10"
        }`}
      >
        <span className="text-2xl">⏳</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">
            {fmt(msLeft)} left to keep your {state.count}🔥 streak
          </div>
          <div className="truncate text-xs text-ink-soft">
            Share a verse with {state.friendName} before the window closes.
          </div>
        </div>
        {!canNotify && (
          <button
            onClick={enableNotifications}
            className="hidden shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-2 sm:block"
            title="Get a browser reminder"
          >
            🔔
          </button>
        )}
        <Link
          href={`/chat/${state.friendshipId}`}
          className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white"
        >
          Share
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-ink-faint hover:text-ink"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function fmt(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
