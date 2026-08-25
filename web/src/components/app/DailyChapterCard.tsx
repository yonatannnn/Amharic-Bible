"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TodaysReading } from "@/lib/readingPlan";

export function DailyChapterCard({ reading }: { reading: TodaysReading }) {
  const router = useRouter();
  const [done, setDone] = useState(reading.alreadyReadToday);
  const [busy, setBusy] = useState(false);

  async function markRead() {
    setBusy(true);
    await fetch("/api/reading/complete", { method: "POST" });
    setBusy(false);
    setDone(true);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          📖 የዕለቱ ምዕራፍ · Today&apos;s chapter
        </span>
        <span className="text-xs font-medium text-ink-faint">
          Day {reading.dayNumber}
        </span>
      </div>

      <h3 className="amharic mt-2 text-xl font-bold">
        {reading.bookName} {reading.chapter}
      </h3>
      <p className="mt-0.5 text-sm text-ink-soft">
        {reading.totalRead} chapter{reading.totalRead === 1 ? "" : "s"} read so far
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/read?b=${reading.book}&c=${reading.chapter}`}
          className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:brightness-110"
        >
          {done ? "Read again" : "Read now"}
        </Link>
        <button
          onClick={markRead}
          disabled={busy || done}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            done
              ? "bg-good/15 text-good"
              : "border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand"
          } disabled:cursor-default`}
        >
          {done ? "✓ Done today" : busy ? "…" : "Mark read"}
        </button>
      </div>
    </section>
  );
}
