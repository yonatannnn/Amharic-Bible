"use client";

import { useEffect, useState } from "react";
import { getBook, type Book, type BookRef } from "@/lib/bible";

const bookCache = new Map<number, Book>();
async function bookCached(n: number) {
  if (bookCache.has(n)) return bookCache.get(n)!;
  const b = await getBook(n);
  bookCache.set(n, b);
  return b;
}

/**
 * Bottom-sheet picker that walks book → chapter → verse(s) and returns a
 * single verse or a range. Shared by the 1:1 chat and group chat composers.
 */
export function VerseRangePicker({
  books,
  onClose,
  onSend,
}: {
  books: BookRef[];
  onClose: () => void;
  onSend: (book: number, chapter: number, start: number, end: number) => void;
}) {
  const [book, setBook] = useState<number | null>(null);
  const [data, setData] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  useEffect(() => {
    if (book == null) return;
    setData(null);
    setChapter(null);
    setStart(null);
    setEnd(null);
    bookCached(book).then(setData).catch(() => {});
  }, [book]);

  const chap = data && chapter ? data.chapters[chapter - 1] : null;

  function tapVerse(v: number) {
    if (start == null || (start != null && end != null)) {
      setStart(v);
      setEnd(v);
    } else if (v >= start) {
      setEnd(v);
    } else {
      setStart(v);
      setEnd(v);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-bold">Share a verse</h3>
          <button onClick={onClose} className="text-ink-soft">
            ✕
          </button>
        </div>

        <div className="flex gap-2 border-b border-line p-3">
          <select
            value={book ?? ""}
            onChange={(e) => setBook(e.target.value ? +e.target.value : null)}
            className="amharic flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none"
          >
            <option value="">Book…</option>
            {books.map((b) => (
              <option key={b.num} value={b.num}>
                {b.num}. {b.name}
              </option>
            ))}
          </select>
          <select
            value={chapter ?? ""}
            onChange={(e) => {
              setChapter(e.target.value ? +e.target.value : null);
              setStart(null);
              setEnd(null);
            }}
            disabled={!data}
            className="w-28 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none disabled:opacity-50"
          >
            <option value="">Ch…</option>
            {data?.chapters.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!chap ? (
            <p className="mt-10 text-center text-sm text-ink-faint">
              Pick a book and chapter, then tap verses (tap two to select a range).
            </p>
          ) : (
            <div className="reader-text">
              {chap.verses.map((v, i) => {
                const n = i + 1;
                const selected =
                  start != null && end != null && n >= start && n <= end;
                return (
                  <span
                    key={i}
                    onClick={() => tapVerse(n)}
                    className={`cursor-pointer rounded-lg px-1 py-0.5 ${
                      selected ? "bg-brand text-white" : "hover:bg-surface-2"
                    }`}
                  >
                    <sup className="mr-1 select-none font-sans text-[0.7em] font-bold opacity-70">
                      {n}
                    </sup>
                    {v}{" "}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-line p-3">
          <button
            disabled={book == null || chapter == null || start == null}
            onClick={() => onSend(book!, chapter!, start!, end ?? start!)}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {start != null
              ? `Share verse${end && end !== start ? `s ${start}-${end}` : ` ${start}`} 🔥`
              : "Select a verse"}
          </button>
        </div>
      </div>
    </div>
  );
}
