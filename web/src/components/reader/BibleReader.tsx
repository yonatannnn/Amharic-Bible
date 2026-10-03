"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBooks,
  getBook,
  type Book,
  type BookRef,
} from "@/lib/bible";
import { BOOK_COUNT } from "@/lib/bibleCanon";
import { useSettings } from "@/lib/useSettings";
import { SettingsPanel } from "./SettingsPanel";
import { createClient } from "@/lib/supabase/client";
import { ShareBar, type ShareFriend } from "./ShareBar";
import { SavedDrawer } from "./SavedDrawer";
import { verseRows } from "@/lib/verseRows";

type View =
  | { kind: "welcome" }
  | { kind: "chapters"; book: number }
  | { kind: "reading"; book: number; chapter: number }
  | { kind: "search"; query: string };

type SearchHit = {
  book: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
};

const cache = new Map<number, Book>();
async function bookCached(num: number) {
  if (cache.has(num)) return cache.get(num)!;
  const b = await getBook(num);
  cache.set(num, b);
  return b;
}

export function BibleReader() {
  const { settings, update } = useSettings();
  const [books, setBooks] = useState<BookRef[]>([]);
  const [view, setView] = useState<View>({ kind: "welcome" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [shareFriends, setShareFriends] = useState<ShareFriend[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  // Deep link: /read?b=<book>&c=<chapter> opens that chapter directly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = parseInt(params.get("b") ?? "");
    const c = parseInt(params.get("c") ?? "");
    if (b >= 1 && b <= BOOK_COUNT && c >= 1) {
      setView({ kind: "reading", book: b, chapter: c });
    }
  }, []);

  // If signed in with a friend, enable "Share with friend" from the reader.
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: rows } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      if (!rows || rows.length === 0) return;
      const friendIds = rows.map((r) =>
        r.requester_id === user.id ? r.addressee_id : r.requester_id,
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, username")
        .in("id", friendIds);
      const pById = new Map((profiles ?? []).map((p) => [p.id, p]));
      setShareFriends(
        rows.map((r) => {
          const fid = r.requester_id === user.id ? r.addressee_id : r.requester_id;
          const p = pById.get(fid);
          return {
            friendshipId: r.id,
            friendName: p?.name ?? p?.username ?? "your friend",
          };
        }),
      );
    })();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const bookName = useCallback(
    (num: number) => books.find((b) => b.num === num)?.name ?? `Book ${num}`,
    [books],
  );

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f
      ? books.filter(
          (b) => b.name.toLowerCase().includes(f) || String(b.num).includes(f),
        )
      : books;
  }, [books, filter]);

  return (
    <div className="flex h-[calc(100dvh-0px)] flex-col">
      {/* top bar */}
      <header className="flex h-15 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-xl text-xl text-ink-soft hover:bg-surface-2 lg:hidden"
          aria-label="Books"
        >
          ☰
        </button>
        <a href="/" className="flex items-center gap-2.5 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-brand to-gold text-[17px] text-white">
            ✝
          </span>
          <span className="amharic hidden text-[15px] leading-tight sm:block">
            መጽሐፍ ቅዱስ
          </span>
        </a>

        <SearchBox
          books={books}
          onResults={(query) => setView({ kind: "search", query })}
        />

        {userId && (
          <Link
            href="/home"
            className="grid h-10 w-10 place-items-center rounded-xl text-lg text-ink-soft hover:bg-surface-2"
            title="Home"
          >
            🏠
          </Link>
        )}
        {userId && (
          <button
            onClick={() => setSavedOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-lg text-ink-soft hover:bg-surface-2"
            title="Saved"
          >
            🔖
          </button>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl text-lg text-ink-soft hover:bg-surface-2"
          title="Reading settings"
        >
          ⚙️
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* sidebar */}
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-0 left-0 top-15 z-40 flex w-72 flex-col border-r border-line bg-surface transition-transform lg:static lg:top-0 lg:translate-x-0`}
        >
          <div className="flex items-center gap-2 px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
            <span className="h-1 w-1 rounded-full bg-gold" />
            መጻሕፍት · Books
          </div>
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-transparent bg-surface-2 px-3 py-2 focus-within:border-brand">
            <span className="text-ink-faint">🔎</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter books…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <nav className="flex-1 overflow-y-auto px-2.5 pb-5">
            {books.length === 0 ? (
              <div className="grid place-items-center py-10">
                <div className="spinner" />
              </div>
            ) : (
              filtered.map((b) => {
                const active =
                  (view.kind === "chapters" || view.kind === "reading") &&
                  view.book === b.num;
                return (
                  <button
                    key={b.num}
                    onClick={() => {
                      setView({ kind: "chapters", book: b.num });
                      setSidebarOpen(false);
                    }}
                    className={`group mb-0.5 flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${
                      active
                        ? "bg-brand-soft text-brand"
                        : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-display text-xs font-semibold ${
                        active
                          ? "bg-brand text-brand-ink"
                          : "bg-surface-2 text-ink-faint group-hover:text-gold"
                      }`}
                    >
                      {b.num}
                    </span>
                    <span className="amharic text-[15px] font-medium leading-tight">
                      {b.name}
                    </span>
                  </button>
                );
              })
            )}
          </nav>
          {userId && (
            <div className="grid grid-cols-4 gap-1 border-t border-line p-2">
              {[
                { href: "/home", icon: "🏠", label: "Home" },
                { href: "/chat", icon: "💬", label: "Chat" },
                { href: "/friends", icon: "👥", label: "Friends" },
                { href: "/profile", icon: "👤", label: "Profile" },
              ].map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium text-ink-soft transition hover:bg-surface-2 hover:text-brand"
                >
                  <span className="text-base">{n.icon}</span>
                  {n.label}
                </Link>
              ))}
            </div>
          )}
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 top-15 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* reader surface */}
        <main className="flex-1 overflow-y-auto">
          {view.kind === "welcome" && <Welcome />}
          {view.kind === "chapters" && (
            <ChapterPicker
              book={view.book}
              bookName={bookName(view.book)}
              onPick={(chapter) =>
                setView({ kind: "reading", book: view.book, chapter })
              }
            />
          )}
          {view.kind === "reading" && (
            <ChapterReader
              book={view.book}
              chapter={view.chapter}
              bookName={bookName(view.book)}
              shareFriends={shareFriends}
              userId={userId}
              savedVersion={savedVersion}
              onToast={showToast}
              onSaved={() => setSavedVersion((v) => v + 1)}
              onNavigate={(chapter) =>
                setView({ kind: "reading", book: view.book, chapter })
              }
              onBack={() => setView({ kind: "chapters", book: view.book })}
            />
          )}
          {view.kind === "search" && (
            <SearchResults
              query={view.query}
              books={books}
              onOpen={(b, c, v) => {
                setView({ kind: "reading", book: b, chapter: c });
                setTimeout(() => {
                  const el = document.getElementById(`v-${v}`);
                  el?.scrollIntoView({ block: "center" });
                  el?.classList.add("flash");
                  setTimeout(() => el?.classList.remove("flash"), 1200);
                }, 350);
              }}
            />
          )}
        </main>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        update={update}
      />

      {userId && (
        <SavedDrawer
          open={savedOpen}
          onClose={() => setSavedOpen(false)}
          userId={userId}
          version={savedVersion}
          bookName={bookName}
          onJump={(b, c, v) => {
            setSavedOpen(false);
            setView({ kind: "reading", book: b, chapter: c });
            setTimeout(() => {
              const el = document.getElementById(`v-${v}`);
              el?.scrollIntoView({ block: "center" });
              el?.classList.add("flash");
              setTimeout(() => el?.classList.remove("flash"), 1200);
            }, 350);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- search box (debounced) ---------------- */
function SearchBox({
  books,
  onResults,
}: {
  books: BookRef[];
  onResults: (query: string) => void;
}) {
  const [q, setQ] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div className="mx-auto flex max-w-lg flex-1 items-center gap-2 rounded-full border border-transparent bg-surface-2 px-4 py-2.5 focus-within:border-brand">
      <span className="text-ink-faint">🔍</span>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const val = e.target.value.trim();
          if (val.length >= 2)
            timer.current = setTimeout(() => onResults(val), 400);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim().length >= 2) onResults(q.trim());
        }}
        disabled={books.length === 0}
        placeholder="በመጽሐፍ ቅዱስ ይፈልጉ… (search the Bible)"
        className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}

/* ---------------- welcome ---------------- */
function Welcome() {
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div className="max-w-sm">
        <div className="font-display text-7xl leading-none text-gold/50">✦</div>
        <h3 className="amharic mt-5 text-2xl font-bold text-ink">እንኳን ደህና መጡ</h3>
        <div className="gold-rule mx-auto mt-4 w-24" />
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Choose a book from the list, or search the whole of Scripture above.
        </p>
      </div>
    </div>
  );
}

/* ---------------- chapter picker ---------------- */
function ChapterPicker({
  book,
  bookName,
  onPick,
}: {
  book: number;
  bookName: string;
  onPick: (chapter: number) => void;
}) {
  const [data, setData] = useState<Book | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    setErr(false);
    setData(null);
    bookCached(book).then(setData).catch(() => setErr(true));
  }, [book]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <RetryBox onRetry={load} />;
  if (!data)
    return (
      <div className="grid h-1/2 place-items-center">
        <div className="spinner" />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-7 pb-28 pt-10">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        <span className="h-1 w-1 rounded-full bg-gold" />
        መጽሐፍ · Book {book}
      </div>
      <h1 className="amharic mt-2 text-4xl font-bold leading-tight text-ink">
        {data.title || bookName}
      </h1>
      <p className="mt-1.5 font-display text-sm italic text-ink-faint">
        {data.chapters.length} chapters
      </p>
      <div className="gold-rule mt-5" />

      <div className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        ምዕራፍ ይምረጡ · Select a chapter
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2.5">
        {data.chapters.map((c, i) => (
          <button
            key={i}
            onClick={() => onPick(i + 1)}
            className="group aspect-square rounded-xl border border-line bg-surface font-display text-lg font-semibold text-ink-soft shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:bg-brand hover:text-brand-ink"
          >
            {c.chapter || i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function RetryBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid h-1/2 place-items-center px-6 text-center">
      <div>
        <div className="text-4xl opacity-60">📡</div>
        <p className="mt-2 text-sm text-ink-soft">
          Couldn&apos;t reach the Bible server.
        </p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/* ---------------- chapter reader ---------------- */
function ChapterReader({
  book,
  chapter,
  bookName,
  shareFriends,
  userId,
  savedVersion,
  onToast,
  onSaved,
  onNavigate,
  onBack,
}: {
  book: number;
  chapter: number;
  bookName: string;
  shareFriends: ShareFriend[];
  userId: string | null;
  savedVersion: number;
  onToast: (msg: string) => void;
  onSaved: () => void;
  onNavigate: (chapter: number) => void;
  onBack: () => void;
}) {
  const [data, setData] = useState<Book | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setErr(false);
    setData(null);
    bookCached(book).then(setData).catch(() => setErr(true));
  }, [book]);
  useEffect(() => {
    load();
  }, [load]);

  // load this user's highlights for the current chapter
  useEffect(() => {
    if (!userId) {
      setHighlighted(new Set());
      return;
    }
    const supabase = createClient();
    supabase
      .from("saved_verses")
      .select("verse_start, verse_end")
      .eq("user_id", userId)
      .eq("kind", "highlight")
      .eq("book", book)
      .eq("chapter", chapter)
      .then(({ data: rows }) => {
        const set = new Set<number>();
        (rows ?? []).forEach((r) => {
          for (let n = r.verse_start; n <= r.verse_end; n++) set.add(n);
        });
        setHighlighted(set);
      });
  }, [userId, book, chapter, savedVersion]);

  const chap = data?.chapters[chapter - 1];
  const total = data?.chapters.length ?? 0;

  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
    setSel(null);
  }, [chapter, book]);

  function tapVerse(n: number) {
    setSel((prev) => {
      if (!prev) return { start: n, end: n };
      if (prev.start === prev.end) {
        if (n === prev.start) return null; // tap again to deselect
        return { start: Math.min(prev.start, n), end: Math.max(prev.start, n) };
      }
      return { start: n, end: n };
    });
  }

  if (err) return <RetryBox onRetry={load} />;
  if (!data || !chap)
    return (
      <div className="grid h-1/2 place-items-center">
        <div className="spinner" />
      </div>
    );

  const selText = sel
    ? chap.verses.slice(sel.start - 1, sel.end).join(" ")
    : "";
  const selRange = sel
    ? sel.start === sel.end
      ? `${sel.start}`
      : `${sel.start}-${sel.end}`
    : "";
  let selHighlighted = false;
  if (sel) {
    for (let n = sel.start; n <= sel.end; n++) {
      if (highlighted.has(n)) {
        selHighlighted = true;
        break;
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-7 pb-28 pt-9">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-brand"
      >
        ← {data.title || bookName}
      </button>
      <div className="mt-3 flex items-baseline gap-3">
        <h1 className="amharic text-3xl font-bold text-ink">
          {data.title || bookName}
        </h1>
        <span className="font-display text-2xl italic text-brand">{chapter}</span>
      </div>
      <div className="gold-rule mt-4" />
      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
        Tap a verse to bookmark, highlight, or share
      </p>

      <div className="reader-text mt-5 text-ink">
        {verseRows(chap.verses).map((row) => {
          const n = row.start;
          const selected = sel != null && row.end >= sel.start && row.start <= sel.end;
          const isHl = highlighted.has(n);
          return (
            <div
              key={n}
              id={`v-${n}`}
              onClick={() => tapVerse(n)}
              className={`flex cursor-pointer gap-3 rounded-lg px-2 py-1 transition-colors [&.flash]:bg-brand-soft ${
                selected
                  ? "bg-brand text-brand-ink"
                  : isHl
                    ? "bg-highlight hover:brightness-[0.97]"
                    : "hover:bg-surface-2"
              }`}
            >
              <span
                className={`w-6 shrink-0 select-none pt-[0.34em] text-right font-sans text-[0.56em] font-bold tabular-nums ${
                  selected ? "text-brand-ink/70" : "text-gold/70"
                }`}
              >
                {row.label}
              </span>
              <span className="flex-1">{row.text}</span>
            </div>
          );
        })}
      </div>

      {sel && (
        <ShareBar
          label={`${data.title || bookName} ${chapter}:${selRange}`}
          text={selText}
          book={book}
          chapter={chapter}
          verseStart={sel.start}
          verseEnd={sel.end}
          friends={shareFriends}
          userId={userId}
          highlighted={selHighlighted}
          onToast={onToast}
          onSaved={onSaved}
          onClear={() => setSel(null)}
        />
      )}

      <div className="mt-10">
        <div className="gold-rule" />
        <div className="mt-5 flex justify-between gap-3">
          <button
            disabled={chapter <= 1}
            onClick={() => onNavigate(chapter - 1)}
            className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium text-ink-soft shadow-card transition enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40"
          >
            ← <span className="amharic">ቀዳሚ</span>
          </button>
          <button
            disabled={chapter >= total}
            onClick={() => onNavigate(chapter + 1)}
            className="flex flex-1 items-center justify-end gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium text-ink-soft shadow-card transition enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40"
          >
            <span className="amharic">ቀጣይ</span> →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- search results ---------------- */
function SearchResults({
  query,
  books,
  onOpen,
}: {
  query: string;
  books: BookRef[];
  onOpen: (book: number, chapter: number, verse: number) => void;
}) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHits([]);
    setProgress(0);
    setDone(false);
    (async () => {
      const found: SearchHit[] = [];
      for (let i = 0; i < books.length; i++) {
        if (cancelled) return;
        const b = books[i];
        setProgress(Math.round(((i + 1) / books.length) * 100));
        try {
          const book = await bookCached(b.num);
          book.chapters.forEach((ch, ci) =>
            ch.verses.forEach((v, vi) => {
              if (v.includes(query))
                found.push({
                  book: b.num,
                  bookName: book.title || b.name,
                  chapter: ci + 1,
                  verse: vi + 1,
                  text: v,
                });
            }),
          );
          if (i % 4 === 0) setHits([...found]);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) {
        setHits(found);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, books]);

  return (
    <div className="mx-auto max-w-2xl px-7 pb-28 pt-9">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {done
          ? `${hits.length} ውጤቶች · ${hits.length} result${hits.length === 1 ? "" : "s"} for “${query}”`
          : "Searching the whole Bible…"}
      </div>
      {!done && (
        <div className="my-3.5 h-1 overflow-hidden rounded bg-surface-2">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="mt-3 space-y-2.5">
        {hits.slice(0, 300).map((h, i) => (
          <button
            key={i}
            onClick={() => onOpen(h.book, h.chapter, h.verse)}
            className="block w-full rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:translate-x-0.5 hover:border-brand"
          >
            <div className="mb-1.5 font-display text-xs font-semibold italic text-gold">
              {h.bookName} {h.chapter}:{h.verse}
            </div>
            <div
              className="amharic text-base leading-relaxed text-ink"
              dangerouslySetInnerHTML={{ __html: mark(h.text, query) }}
            />
          </button>
        ))}
        {done && hits.length === 0 && (
          <div className="grid place-items-center py-14 text-center text-ink-faint">
            <div>
              <div className="mb-3 text-5xl opacity-55">🔍</div>
              <p>No verses found for “{query}”.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function mark(text: string, q: string) {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g");
    return safe.replace(
      re,
      '<mark class="rounded bg-highlight px-0.5 text-ink">$1</mark>',
    );
  } catch {
    return safe;
  }
}
