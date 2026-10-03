"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Streak } from "@/lib/friends";

export function StreakCard({
  friendshipId,
  friendName,
  streak,
  iAmRequester,
}: {
  friendshipId: string;
  friendName: string;
  streak: Streak | null;
  iAmRequester: boolean;
}) {
  const count = streak?.count ?? 0;
  const meShared = streak
    ? iAmRequester
      ? streak.requester_shared
      : streak.addressee_shared
    : false;
  const friendShared = streak
    ? iAmRequester
      ? streak.addressee_shared
      : streak.requester_shared
    : false;

  const broken = streak?.broken ?? false;
  const deadline = streak?.window_deadline
    ? new Date(streak.window_deadline)
    : null;

  // A broken streak stays restorable for 48h, even after a fresh streak has
  // started — so the Restore option survives the next verse you send.
  const restorableCount = streak?.restorable_count ?? 0;
  const restorableAt = streak?.restorable_at
    ? new Date(streak.restorable_at)
    : null;
  const canRestore =
    restorableCount > 0 &&
    restorableAt !== null &&
    Date.now() - restorableAt.getTime() < 48 * 3_600_000 &&
    (streak?.restores_remaining ?? 0) > 0;
  const showRestore = broken || canRestore;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      {/* hero */}
      <div className="relative overflow-hidden px-6 py-8 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: broken
              ? "radial-gradient(120% 120% at 50% -10%, color-mix(in srgb, var(--ink-faint) 16%, transparent), transparent 60%)"
              : "radial-gradient(120% 130% at 50% -20%, color-mix(in srgb, var(--ember) 30%, transparent), color-mix(in srgb, var(--brand) 16%, transparent) 45%, transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="text-4xl drop-shadow-sm">{broken ? "🕯️" : "🔥"}</div>
          <div className="mt-1 font-display text-6xl font-semibold tabular-nums text-ink">
            {count}
          </div>
          <div className="mt-1 text-sm font-medium text-ink-soft">
            {broken ? "streak broken" : "day streak"} with{" "}
            <span className="font-semibold text-ink">{friendName}</span>
          </div>
          {streak && deadline && !broken && (
            <Countdown deadline={deadline} bothShared={meShared && friendShared} />
          )}
        </div>
      </div>

      <div className="border-t border-line px-5 pb-5 pt-4">
        {showRestore ? (
          <RestoreRow
            friendshipId={friendshipId}
            restores={streak?.restores_remaining ?? 0}
            streakValue={restorableCount > 0 ? restorableCount : count}
          />
        ) : (
          <div className="mb-4 flex items-center justify-center gap-3 text-sm">
            <ShareState who="You" shared={meShared} />
            <span className="text-ink-faint">·</span>
            <ShareState who={friendName} shared={friendShared} />
          </div>
        )}
        <Link
          href={`/chat/${friendshipId}`}
          className="block w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110"
        >
          {meShared ? "Open chat" : "Share a verse to keep the streak →"}
        </Link>
      </div>
    </div>
  );
}

function ShareState({ who, shared }: { who: string; shared: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
          shared ? "bg-good/20 text-good" : "bg-surface-2 text-ink-faint"
        }`}
      >
        {shared ? "✓" : "○"}
      </span>
      <span className={shared ? "font-medium text-ink" : "text-ink-faint"}>
        {who}
      </span>
    </span>
  );
}

function Countdown({
  deadline,
  bothShared,
}: {
  deadline: Date;
  bothShared: boolean;
}) {
  const [left, setLeft] = useState("");
  const [low, setLow] = useState(false);

  useEffect(() => {
    const tick = () => {
      const ms = deadline.getTime() - Date.now();
      if (ms <= 0) return setLeft("expired");
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(`${h}h ${m}m`);
      setLow(ms < 4 * 3_600_000);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [deadline]);

  if (bothShared)
    return (
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-good/15 px-3 py-1 text-sm font-medium text-good">
        ✓ Locked in for today
      </div>
    );

  return (
    <div
      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        low ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-soft"
      }`}
    >
      ⏳ {left} left to keep it
    </div>
  );
}

function RestoreRow({
  friendshipId,
  restores,
  streakValue,
}: {
  friendshipId: string;
  restores: number;
  streakValue: number;
}) {
  return (
    <form
      action="/api/streak/restore"
      method="post"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"
    >
      <input type="hidden" name="friendshipId" value={friendshipId} />
      <span className="text-sm text-ink-soft">
        Restore your {streakValue > 0 ? <b className="text-ink">{streakValue}</b> : null}-day streak? <b className="text-ink">{restores}</b> left this month
      </span>
      <button
        type="submit"
        disabled={restores <= 0}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
      >
        Restore
      </button>
    </form>
  );
}
