"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getBook } from "@/lib/bible";

type SavedRow = {
  id: string;
  kind: "bookmark" | "highlight";
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
};

const textCache = new Map<string, string>();

export function SavedDrawer({
  open,
  onClose,
  userId,
  version,
  bookName,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  version: number;
  bookName: (n: number) => string;
  onJump: (book: number, chapter: number, verse: number) => void;
}) {
  const [tab, setTab] = useState<"bookmark" | "highlight">("bookmark");
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("saved_verses")
      .select("id, kind, book, chapter, verse_start, verse_end")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const list = (data as SavedRow[]) ?? [];
        setRows(list);
        setLoading(false);
        // fetch a short preview of each verse
        const out: Record<string, string> = {};
        await Promise.all(
          list.slice(0, 60).map(async (r) => {
            const key = `${r.book}.${r.chapter}.${r.verse_start}`;
            if (textCache.has(key)) {
              out[r.id] = textCache.get(key)!;
              return;
            }
            try {
              const b = await getBook(r.book);
              const t = b.chapters[r.chapter - 1]?.verses[r.verse_start - 1] ?? "";
              textCache.set(key, t);
              out[r.id] = t;
            } catch {
              out[r.id] = "";
            }
          }),
        );
        setPreviews(out);
      });
  }, [open, userId, version]);

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("saved_verses").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const shown = rows.filter((r) => r.kind === tab);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[60] flex w-[380px] max-w-[90vw] flex-col bg-surface shadow-pop transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-[17px] font-bold">🔖 Saved</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-[9px] text-lg text-ink-soft hover:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1.5 p-3">
          {(["bookmark", "highlight"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition ${
                tab === k ? "bg-brand text-white" : "bg-surface-2 text-ink-soft"
              }`}
            >
              {k === "bookmark" ? "🔖 Bookmarks" : "🖍 Highlights"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-5">
          {loading ? (
            <div className="grid place-items-center py-12">
              <div className="spinner" />
            </div>
          ) : shown.length === 0 ? (
            <div className="grid place-items-center py-16 text-center text-ink-faint">
              <div>
                <div className="text-4xl">{tab === "bookmark" ? "🔖" : "🖍"}</div>
                <p className="mt-2 text-sm">
                  No {tab}s yet. Tap a verse while reading to add one.
                </p>
              </div>
            </div>
          ) : (
            shown.map((r) => {
              const range =
                r.verse_end !== r.verse_start
                  ? `${r.verse_start}-${r.verse_end}`
                  : `${r.verse_start}`;
              return (
                <div
                  key={r.id}
                  className="group mb-2 rounded-xl border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onJump(r.book, r.chapter, r.verse_start)}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      {bookName(r.book)} {r.chapter}:{range}
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="text-ink-faint opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                  <button
                    onClick={() => onJump(r.book, r.chapter, r.verse_start)}
                    className="amharic mt-1 line-clamp-2 block text-left text-sm text-ink"
                  >
                    {previews[r.id] ?? "…"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
