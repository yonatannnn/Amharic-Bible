"use client";

import { useEffect, useState } from "react";
import { getBooks, getBook, type BookRef } from "@/lib/bible";

export type PickedVerse = {
  book: number;
  chapter: number;
  verse: number;
  text: string;
  label: string;
};

/**
 * Full-screen modal that walks book → chapter → verse and returns the pick.
 * Mirrors the mobile AdminVersePicker. Verse text comes from the content API.
 */
export function VersePicker({
  title,
  confirmLabel,
  onPick,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  onPick: (v: PickedVerse) => void;
  onClose: () => void;
}) {
  const [books, setBooks] = useState<BookRef[]>([]);
  const [book, setBook] = useState<BookRef | null>(null);
  const [chapters, setChapters] = useState<string[][]>([]); // verses per chapter
  const [chapter, setChapter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBooks()
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, []);

  async function openBook(b: BookRef) {
    setLoading(true);
    try {
      const full = await getBook(b.num);
      setChapters(full.chapters.map((c) => c.verses));
      setBook(b);
      setChapter(null);
    } catch {
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }

  function back() {
    if (chapter !== null) setChapter(null);
    else if (book) {
      setBook(null);
      setChapters([]);
    } else onClose();
  }

  const verses = chapter !== null ? chapters[chapter - 1] ?? [] : [];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-canvas">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          onClick={back}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
          aria-label="Back"
        >
          ←
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">
            {book
              ? chapter !== null
                ? `${book.name} ${chapter}`
                : book.name
              : title}
          </h2>
          <p className="text-xs text-ink-faint">
            {chapter !== null
              ? `Tap a verse to ${confirmLabel.toLowerCase()}`
              : book
                ? "Choose a chapter"
                : "Choose a book"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-ink-faint">Loading…</p>
        ) : chapter !== null ? (
          <ol className="space-y-1">
            {verses.map((text, i) => {
              const n = i + 1;
              return (
                <li key={n}>
                  <button
                    onClick={() =>
                      onPick({
                        book: book!.num,
                        chapter,
                        verse: n,
                        text,
                        label: `${book!.name} ${chapter}:${n}`,
                      })
                    }
                    className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-gold/70">
                      {n}
                    </span>
                    <span className="amharic flex-1 text-[0.95rem] leading-relaxed">
                      {text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : book ? (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {chapters.map((_, i) => {
              const n = i + 1;
              return (
                <button
                  key={n}
                  onClick={() => setChapter(n)}
                  className="aspect-square rounded-xl border border-line bg-surface text-sm font-semibold transition hover:border-brand hover:text-brand"
                >
                  {n}
                </button>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-1">
            {books.map((b) => (
              <li key={b.num}>
                <button
                  onClick={() => openBook(b)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface-2"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-ink-soft">
                    {b.num}
                  </span>
                  <span className="amharic font-medium">{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
