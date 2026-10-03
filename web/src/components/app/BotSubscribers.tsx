"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Row = {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  active: boolean;
  subscribed_at: string;
};

export type Bot = {
  key: string;
  name: string;
  handle: string;
  rows: Row[];
  error: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

function Stat({ label, value, tone }: { label: string; value: number; tone?: "quiet" }) {
  return (
    <div className="flex-1 rounded-2xl border border-line bg-surface-2 px-4 py-3">
      <div className={`font-display text-2xl font-bold ${tone === "quiet" ? "text-ink-faint" : "text-ink"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: Bot }) {
  const active = bot.rows.filter((r) => r.active);
  const gone = bot.rows.filter((r) => !r.active);

  return (
    <section className="rise mt-5 rounded-3xl border border-line bg-surface p-5 shadow-pop">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="amharic text-lg font-bold text-ink">{bot.name}</h2>
        <span className="text-[12px] text-ink-faint">{bot.handle}</span>
      </div>

      {bot.error ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-soft">
          Could not read this table — {bot.error}
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2.5">
            <Stat label="active" value={active.length} />
            <Stat label="stopped" value={gone.length} tone="quiet" />
            <Stat label="total" value={bot.rows.length} tone="quiet" />
          </div>

          {bot.rows.length === 0 ? (
            <p className="mt-4 text-[13px] text-ink-faint">Nobody has started this bot yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {bot.rows.map((r) => (
                <li key={r.chat_id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.active ? "bg-brand" : "bg-ink-faint/40"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[14px] ${r.active ? "text-ink" : "text-ink-faint line-through"}`}>
                      {r.username ? `@${r.username}` : "(no username)"}
                    </div>
                    <div className="truncate text-[12px] text-ink-faint">
                      {r.first_name || "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[12px] text-ink-faint">
                    {fmtDate(r.subscribed_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function BotSubscribers({ bots, fetchedAt }: { bots: Bot[]; fetchedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Rendered on the client only, so the server and client markup agree.
  const [stamp, setStamp] = useState<string>("");

  useEffect(() => {
    setStamp(new Date(fetchedAt).toLocaleTimeString("en-GB"));
  }, [fetchedAt]);

  const refresh = () => startTransition(() => router.refresh());

  const totalActive = bots.reduce(
    (n, b) => n + b.rows.filter((r) => r.active).length, 0);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Telegram
          </div>
          <h1 className="amharic mt-2 text-3xl font-bold leading-tight text-ink">
            Bot subscribers
          </h1>
          <p className="mt-1 text-[13px] text-ink-faint">
            {totalActive} active across {bots.length} bots
            {stamp && <> · read at {stamp}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-brand-ink transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {bots.map((b) => (
        <BotCard key={b.key} bot={b} />
      ))}

      <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">
        &ldquo;Stopped&rdquo; covers both people who sent /stop and people who blocked the
        bot — Telegram reports the same 403 either way, and the table does not
        record which.
      </p>
    </div>
  );
}
