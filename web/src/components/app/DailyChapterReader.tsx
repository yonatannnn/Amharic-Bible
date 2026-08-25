"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShareBar, type ShareFriend } from "@/components/reader/ShareBar";

export function DailyChapterReader({
  book,
  chapter,
  bookName,
  verses,
  alreadyReadToday,
  readingStreak,
  userId,
  friends,
}: {
  book: number;
  chapter: number;
  bookName: string;
  verses: string[];
  alreadyReadToday: boolean;
  dayNumber?: number;
  readingStreak: number;
  userId: string;
  friends: ShareFriend[];
}) {
  const router = useRouter();
  const [done, setDone] = useState(alreadyReadToday);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  }

  async function markRead() {
    setBusy(true);
    await fetch("/api/reading/complete", { method: "POST" });
    setBusy(false);
    setDone(true);
    router.refresh();
  }

  function tapVerse(n: number) {
    setSel((prev) => {
      if (!prev) return { start: n, end: n };
      if (prev.start === prev.end) {
        if (n === prev.start) return null;
        return { start: Math.min(prev.start, n), end: Math.max(prev.start, n) };
      }
      return { start: n, end: n };
    });
  }

  const selText = sel ? verses.slice(sel.start - 1, sel.end).join(" ") : "";
  const selRange = sel
    ? sel.start === sel.end
      ? `${sel.start}`
      : `${sel.start}-${sel.end}`
    : "";

  return (
    <section
      className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
      style={{ fontSize: "var(--reader-size)" }}
    >
      {/* header */}
      <div className="relative px-[1.5em] pt-[1.5em]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.68em] font-semibold uppercase tracking-[0.16em] text-gold">
              የዕለቱ ምዕራፍ · Today&apos;s Chapter
            </div>
            <h3 className="amharic mt-[0.4em] text-[1.45em] font-bold leading-tight text-ink">
              {bookName}{" "}
              <span className="font-display italic text-brand">{chapter}</span>
            </h3>
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-ember/20 to-brand/15 px-[1em] py-[0.7em] text-center leading-none">
            <span className="flex items-center gap-[0.25em] font-display text-[1.3em] font-bold text-ink">
              <span>🔥</span>
              <span>{readingStreak}</span>
            </span>
            <span className="mt-[0.6em] text-[0.5em] font-semibold uppercase tracking-[0.12em] text-ink-soft">
              reading streak
            </span>
          </div>
        </div>
        <div className="gold-rule mt-[1em]" />
        <p className="mt-[0.7em] text-[0.62em] uppercase tracking-[0.14em] text-ink-faint">
          Tap a verse to share it 🔥
        </p>
      </div>

      {/* full chapter — verse per line, tappable */}
      <div className="reader-text px-[1.5em] pb-[1.2em] pt-[0.6em] text-ink [font-family:var(--font-eth-serif)]">
        {verses.map((v, i) => {
          const n = i + 1;
          const selected = sel != null && n >= sel.start && n <= sel.end;
          return (
            <div
              key={i}
              onClick={() => tapVerse(n)}
              className={`flex cursor-pointer gap-[0.75em] rounded-lg px-[0.4em] py-[0.15em] transition-colors ${
                selected ? "bg-brand text-brand-ink" : "hover:bg-surface-2"
              }`}
            >
              <span
                className={`w-[1.6em] shrink-0 select-none pt-[0.34em] text-right font-sans text-[0.56em] font-bold tabular-nums ${
                  selected ? "text-brand-ink/70" : "text-gold/70"
                }`}
              >
                {n}
              </span>
              <span className="flex-1">{v}</span>
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center gap-[0.6em] border-t border-line bg-surface-2/40 px-[1.2em] py-[1em] text-[0.9em]">
        <button
          onClick={markRead}
          disabled={busy || done}
          className={`flex-1 rounded-xl px-[1em] py-[0.85em] font-semibold transition disabled:cursor-default ${
            done
              ? "bg-good/15 text-good"
              : "bg-brand text-brand-ink shadow-card hover:brightness-110"
          }`}
        >
          {done ? "✓ Read today" : busy ? "…" : "Mark as read"}
        </button>
        <Link
          href={`/read?b=${book}&c=${chapter}`}
          className="rounded-xl border border-line bg-surface px-[1em] py-[0.85em] font-semibold text-ink-soft transition hover:border-brand hover:text-brand"
        >
          Focus mode →
        </Link>
      </div>

      {sel && (
        <ShareBar
          label={`${bookName} ${chapter}:${selRange}`}
          text={selText}
          book={book}
          chapter={chapter}
          verseStart={sel.start}
          verseEnd={sel.end}
          friends={friends}
          userId={userId}
          onToast={flash}
          onClear={() => setSel(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </section>
  );
}
