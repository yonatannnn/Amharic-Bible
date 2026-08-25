"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getBook } from "@/lib/bible";
import { VersePicker, type PickedVerse } from "@/components/app/VersePicker";

type QItem = {
  id: number;
  book: number;
  chapter: number;
  verse: number;
  source: string;
  ref: string;
  text: string;
};

/**
 * Admin-only: manage the queue of verses for the daily 6 AM Telegram broadcast.
 * Mirrors the mobile TelegramQueuePage — list, add, AI-generate, reorder, send
 * now, remove, tap to read the full verse. The TOP verse (lowest position) is
 * sent each morning, then removed.
 */
export function TelegramQueueClient() {
  const supabase = createClient();
  const [items, setItems] = useState<QItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<QItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("telegram_queue")
      .select("id, book, chapter, verse, source")
      .order("position", { ascending: true });
    const rows = (data ?? []) as Omit<QItem, "ref" | "text">[];
    const resolved = await Promise.all(
      rows.map(async (r) => {
        let ref = `Book ${r.book} ${r.chapter}:${r.verse}`;
        let text = "";
        try {
          const b = await getBook(r.book);
          ref = `${b.title} ${r.chapter}:${r.verse}`;
          const ch = b.chapters[r.chapter - 1];
          const idx = Math.min(Math.max(r.verse - 1, 0), ch.verses.length - 1);
          text = ch.verses[idx] ?? "";
        } catch {
          /* keep fallback ref */
        }
        return { ...r, ref, text };
      }),
    );
    setItems(resolved);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addManual(v: PickedVerse) {
    setPicking(false);
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("telegram_queue").insert({
      book: v.book,
      chapter: v.chapter,
      verse: v.verse,
      source: "manual",
      set_by: user?.id ?? null,
    });
    await load();
    setBusy(false);
  }

  async function generateAi() {
    setBusy(true);
    const { data } = await supabase.functions.invoke("generate-verses", {
      body: { count: 5 },
    });
    const n = (data?.added as unknown[] | undefined)?.length ?? 0;
    await load();
    setBusy(false);
    flash(n > 0 ? `✨ Added ${n} AI verse${n === 1 ? "" : "s"}` : "Could not generate verses");
  }

  async function remove(it: QItem) {
    setItems((prev) => prev?.filter((x) => x.id !== it.id) ?? null);
    await supabase.from("telegram_queue").delete().eq("id", it.id);
  }

  async function sendNow(it: QItem) {
    if (!confirm(`Broadcast ${it.ref} to all Telegram subscribers now, and remove it from the queue?`))
      return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("telegram-verse", {
      body: { id: it.id, book: it.book, chapter: it.chapter, verse: it.verse },
    });
    await load();
    setBusy(false);
    const sent = data?.sent as number | undefined;
    flash(!error && sent != null ? `📤 Sent to ${sent} subscriber${sent === 1 ? "" : "s"}` : "Send failed");
  }

  async function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      // persist new order: position = array index
      void persistOrder(next);
      return next;
    });
  }

  async function persistOrder(ordered: QItem[]) {
    await Promise.all(
      ordered.map((it, i) => supabase.from("telegram_queue").update({ position: i }).eq("id", it.id)),
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      {busy && (
        <div className="fixed inset-x-0 top-0 z-[80] h-0.5 animate-pulse bg-brand" />
      )}

      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/home"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="text-lg font-bold">Telegram queue</h1>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-sm text-ink-soft">
        <span className="text-gold">⏰</span>
        <p className="leading-snug">
          The top verse is sent to subscribers daily at <b>6:00 AM EAT</b>, then removed.
          Reorder with the arrows; if the queue is empty, an AI verse is sent automatically.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {items === null ? (
          <p className="py-10 text-center text-sm text-ink-faint">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
            <div className="text-4xl">🎵</div>
            <h3 className="mt-3 font-bold">Queue is empty</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
              Add verses or generate with AI. If empty at 6 AM, one AI verse is sent
              automatically.
            </p>
          </div>
        ) : (
          items.map((it, i) => {
            const isAi = it.source === "ai";
            return (
              <div
                key={it.id}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3"
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                    i === 0 ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-faint"
                  }`}
                >
                  {i + 1}
                </span>

                <button onClick={() => setDetail(it)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-brand">{it.ref}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        isAi ? "bg-gold/15 text-gold" : "bg-ink/10 text-ink-soft"
                      }`}
                    >
                      {isAi ? "✨ AI" : "manual"}
                    </span>
                  </div>
                  <p className="amharic mt-0.5 line-clamp-2 text-sm text-ink-soft">{it.text}</p>
                </button>

                <div className="flex shrink-0 flex-col items-center">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-ink disabled:opacity-25"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:text-ink disabled:opacity-25"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    onClick={() => sendNow(it)}
                    disabled={busy}
                    className="rounded-lg bg-brand/10 px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/20 disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => remove(it)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-faint hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* action bar */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={() => setPicking(true)}
          disabled={busy}
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold transition hover:border-brand hover:text-brand disabled:opacity-50"
        >
          + Add verse
        </button>
        <button
          onClick={generateAi}
          disabled={busy}
          className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink transition hover:brightness-110 disabled:opacity-50"
        >
          ✨ Generate AI
        </button>
      </div>

      {picking && (
        <VersePicker
          title="Add to queue"
          confirmLabel="Add"
          onPick={addManual}
          onClose={() => setPicking(false)}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center">
          <button className="absolute inset-0" aria-hidden onClick={() => setDetail(null)} />
          <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 sm:rounded-3xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-brand">{detail.ref}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  detail.source === "ai" ? "bg-gold/15 text-gold" : "bg-ink/10 text-ink-soft"
                }`}
              >
                {detail.source === "ai" ? "✨ AI" : "manual"}
              </span>
            </div>
            <div className="my-3.5 h-px bg-line" />
            <p
              className="amharic leading-loose"
              style={{ fontSize: "var(--reader-size)" }}
            >
              {detail.text}
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}
