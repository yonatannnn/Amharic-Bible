"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getBooks, getBook, type Book, type BookRef } from "@/lib/bible";
import { ClickableAvatar } from "./ClickableAvatar";
import { VerseRangePicker } from "./VerseRangePicker";
import { EmojiPicker } from "./EmojiPicker";

export type Reaction = { user_id: string; emoji: string };

export type ChatMessage = {
  id: string;
  friendship_id: string;
  sender_id: string;
  type: "verse" | "text" | "image";
  book: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  text: string | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
};

const bookCache = new Map<number, Book>();
async function bookCached(n: number) {
  if (bookCache.has(n)) return bookCache.get(n)!;
  const b = await getBook(n);
  bookCache.set(n, b);
  return b;
}

export function ChatRoom({
  friendshipId,
  myId,
  friend,
  initialMessages,
  initialStreak,
}: {
  friendshipId: string;
  myId: string;
  friend: { id: string; name: string; username: string; avatar_url: string | null };
  initialMessages: ChatMessage[];
  initialStreak: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streak, setStreak] = useState(initialStreak);
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const [books, setBooks] = useState<BookRef[]>([]);
  // messageId -> reactions[]
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const seen = useRef(new Set(initialMessages.map((m) => m.id)));
  const bottomRef = useRef<HTMLDivElement>(null);

  // local helper: merge/replace one user's reaction for a message
  const applyReaction = useCallback(
    (messageId: string, userId: string, emoji: string | null) => {
      setReactions((prev) => {
        const list = prev[messageId] ?? [];
        const without = list.filter((r) => r.user_id !== userId);
        const next = emoji ? [...without, { user_id: userId, emoji }] : without;
        return { ...prev, [messageId]: next };
      });
    },
    [],
  );

  // load all reactions for this friendship on mount
  useEffect(() => {
    supabase
      .from("message_reactions")
      .select("message_id,user_id,emoji")
      .eq("friendship_id", friendshipId)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, Reaction[]> = {};
        for (const r of data as { message_id: string; user_id: string; emoji: string }[]) {
          (map[r.message_id] ??= []).push({ user_id: r.user_id, emoji: r.emoji });
        }
        setReactions(map);
      });
  }, [supabase, friendshipId]);

  // toggle the current user's reaction on a message (optimistic)
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const mine = (reactions[messageId] ?? []).find((r) => r.user_id === myId);
      if (mine && mine.emoji === emoji) {
        applyReaction(messageId, myId, null);
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", myId);
      } else {
        applyReaction(messageId, myId, emoji);
        await supabase.from("message_reactions").upsert(
          { message_id: messageId, user_id: myId, friendship_id: friendshipId, emoji },
          { onConflict: "message_id,user_id" },
        );
      }
    },
    [reactions, myId, friendshipId, supabase, applyReaction],
  );

  const bookName = useCallback(
    (n: number | null) => (n ? books.find((b) => b.num === n)?.name ?? `Book ${n}` : ""),
    [books],
  );

  useEffect(() => {
    getBooks().then(setBooks).catch(() => {});
  }, []);

  // mark the friend's messages as read
  const markRead = useCallback(async () => {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("friendship_id", friendshipId)
      .eq("sender_id", friend.id)
      .is("read_at", null);
  }, [supabase, friendshipId, friend.id]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  const refreshStreak = useCallback(async () => {
    const { data } = await supabase
      .from("streaks")
      .select("count")
      .eq("friendship_id", friendshipId)
      .maybeSingle();
    if (data) setStreak(data.count);
  }, [supabase, friendshipId]);

  // realtime: new messages
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${friendshipId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `friendship_id=eq.${friendshipId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (seen.current.has(m.id)) return;
          seen.current.add(m.id);
          setMessages((prev) => [...prev, m]);
          if (m.type === "verse") refreshStreak();
          if (m.sender_id === friend.id) markRead();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `friendship_id=eq.${friendshipId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)),
          );
        },
      )
      // live streak count — covers shares, breaks at 11 AM, and restores
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "streaks",
          filter: `friendship_id=eq.${friendshipId}`,
        },
        () => refreshStreak(),
      )
      // live reactions
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `friendship_id=eq.${friendshipId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const r = payload.old as { message_id?: string; user_id?: string };
            if (r.message_id && r.user_id) applyReaction(r.message_id, r.user_id, null);
          } else {
            const r = payload.new as { message_id: string; user_id: string; emoji: string };
            applyReaction(r.message_id, r.user_id, r.emoji);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, friendshipId, refreshStreak, markRead, friend.id, applyReaction]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function sendText() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data } = await supabase
      .from("messages")
      .insert({ friendship_id: friendshipId, sender_id: myId, type: "text", text: body })
      .select()
      .single();
    if (data) {
      seen.current.add(data.id);
      setMessages((prev) => [...prev, data as ChatMessage]);
    }
  }

  async function sendVerse(book: number, chapter: number, start: number, end: number) {
    setPicking(false);
    const { data } = await supabase
      .from("messages")
      .insert({
        friendship_id: friendshipId,
        sender_id: myId,
        type: "verse",
        book,
        chapter,
        verse_start: start,
        verse_end: end,
      })
      .select()
      .single();
    if (data) {
      seen.current.add(data.id);
      setMessages((prev) => [...prev, data as ChatMessage]);
      refreshStreak();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur-sm">
        <Link
          href="/chat"
          className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-surface-2 lg:hidden"
        >
          ←
        </Link>
        <ClickableAvatar name={friend.name} url={friend.avatar_url} size={42} />
        <Link href={`/friend/${friendshipId}`} className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight hover:underline">
            {friend.name}
          </div>
          <div className="truncate text-xs text-ink-faint">@{friend.username}</div>
        </Link>
        <div className="flex items-center gap-1 rounded-full bg-gradient-to-br from-ember/20 to-brand/15 px-3 py-1.5 font-display text-sm font-bold text-ink">
          🔥 {streak}
        </div>
      </header>

      {/* messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5"
        style={{
          backgroundColor: "var(--canvas)",
          backgroundImage:
            "radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--gold) 8%, transparent), transparent 45%), radial-gradient(circle at 85% 90%, color-mix(in srgb, var(--brand) 7%, transparent), transparent 45%)",
        }}
      >
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-ink-faint">
            <div className="max-w-xs">
              <div className="font-display text-5xl text-gold/50">✦</div>
              <p className="amharic mt-3 font-semibold text-ink-soft">
                ጅምር · A new beginning
              </p>
              <p className="mt-1 text-sm">
                Share a verse to start your streak with {friend.name}.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay =
                !prev || !sameDay(prev.created_at, m.created_at);
              const mine = m.sender_id === myId;
              return (
                <div key={m.id}>
                  {showDay && <DaySeparator iso={m.created_at} />}
                  <Bubble
                    m={m}
                    mine={mine}
                    myId={myId}
                    bookName={bookName}
                    reactions={reactions[m.id] ?? []}
                    onReact={(emoji) => toggleReaction(m.id, emoji)}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <button
            onClick={() => setPicking(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-xl text-brand transition hover:brightness-95"
            title="Share a verse"
          >
            📖
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Message…"
            className="h-11 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-brand"
          />
          <button
            onClick={sendText}
            disabled={!text.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-lg text-brand-ink shadow-card transition hover:brightness-110 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>

      {picking && (
        <VerseRangePicker books={books} onClose={() => setPicking(false)} onSend={sendVerse} />
      )}
    </div>
  );
}

/* ---------------- date helpers ---------------- */
function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function DaySeparator({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  let label = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  if (d.toDateString() === today.toDateString()) label = "Today";
  else if (d.toDateString() === yest.toDateString()) label = "Yesterday";
  return (
    <div className="my-4 flex items-center justify-center">
      <span className="rounded-full bg-surface/80 px-3 py-1 text-[11px] font-medium text-ink-faint shadow-card">
        {label}
      </span>
    </div>
  );
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------------- copy helpers ---------------- */
async function verseTextForCopy(m: ChatMessage, bookName: (n: number | null) => string) {
  if (!m.book || !m.chapter) return "";
  const b = await bookCached(m.book);
  const ch = b.chapters[m.chapter - 1];
  const s = (m.verse_start ?? 1) - 1;
  const e = (m.verse_end ?? m.verse_start ?? 1) - 1;
  const body = ch.verses.slice(s, e + 1).join(" ");
  const range =
    m.verse_end && m.verse_end !== m.verse_start
      ? `${m.verse_start}-${m.verse_end}`
      : `${m.verse_start}`;
  return `${bookName(m.book)} ${m.chapter}:${range} — ${body}`;
}

/* ---------------- message bubble ---------------- */
function Bubble({
  m,
  mine,
  myId,
  bookName,
  reactions,
  onReact,
}: {
  m: ChatMessage;
  mine: boolean;
  myId: string;
  bookName: (n: number | null) => string;
  reactions: Reaction[];
  onReact: (emoji: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    let payload = "";
    if (m.type === "verse") payload = await verseTextForCopy(m, bookName);
    else payload = m.text ?? "";
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard failures */
    }
  }, [m, bookName]);

  let content: React.ReactNode;
  if (m.type === "verse") {
    content = <VerseBubble m={m} mine={mine} bookName={bookName} />;
  } else if (m.type === "image" && m.image_url) {
    content = (
      <a
        href={m.image_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[70%] overflow-hidden rounded-2xl border border-line shadow-card"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.image_url} alt={m.text ?? "verse image"} className="w-full" />
      </a>
    );
  } else {
    content = (
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-card ${
          mine
            ? "rounded-br-md bg-brand text-brand-ink"
            : "rounded-bl-md border border-line bg-surface text-ink"
        }`}
      >
        {m.text}
      </div>
    );
  }

  // toolbar sits beside the bubble; visible on hover (desktop) and always
  // tappable (the affordance keeps its own state open on touch via focus-within)
  const toolbar = (
    <div
      className={`flex items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 ${
        showPicker || copied ? "opacity-100" : ""
      }`}
    >
      <button
        onClick={() => setShowPicker((v) => !v)}
        title="React"
        className="grid h-7 w-7 place-items-center rounded-full text-sm text-ink-soft hover:bg-surface-2"
      >
        😊
      </button>
      <button
        onClick={copy}
        title="Copy"
        className="grid h-7 w-7 place-items-center rounded-full text-sm text-ink-soft hover:bg-surface-2"
      >
        ⧉
      </button>
    </div>
  );

  return (
    <div className={`group mb-1.5 flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`relative flex items-center gap-1 ${mine ? "flex-row" : "flex-row-reverse"}`}>
        {toolbar}
        <div className="relative">
          {content}
          {showPicker && (
            <EmojiPicker
              anchorMine={mine}
              onClose={() => setShowPicker(false)}
              onPick={(emoji) => {
                onReact(emoji);
                setShowPicker(false);
              }}
            />
          )}
        </div>
      </div>

      {/* reaction pills */}
      {reactions.length > 0 && (
        <div className={`mt-0.5 flex flex-wrap gap-1 px-1 ${mine ? "justify-end" : "justify-start"}`}>
          {reactions.map((r) => {
            const isMine = r.user_id === myId;
            return (
              <button
                key={r.user_id}
                onClick={() => isMine && onReact(r.emoji)}
                title={isMine ? "Remove your reaction" : undefined}
                className={`rounded-full border px-1.5 py-0.5 text-xs leading-none shadow-card ${
                  isMine
                    ? "border-brand/40 bg-brand-soft text-brand"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {r.emoji}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-ink-faint">
        <span>{fmtTime(m.created_at)}</span>
        {mine && (
          <span className={m.read_at ? "text-good" : "text-ink-faint"}>
            {m.read_at ? "✓✓" : "✓"}
          </span>
        )}
        {copied && <span className="font-medium text-brand">Copied ✓</span>}
      </div>
    </div>
  );
}

function VerseBubble({
  m,
  mine,
  bookName,
}: {
  m: ChatMessage;
  mine: boolean;
  bookName: (n: number | null) => string;
}) {
  const [verseText, setVerseText] = useState<string | null>(null);
  useEffect(() => {
    if (!m.book || !m.chapter) return;
    bookCached(m.book)
      .then((b) => {
        const ch = b.chapters[m.chapter! - 1];
        const s = (m.verse_start ?? 1) - 1;
        const e = (m.verse_end ?? m.verse_start ?? 1) - 1;
        setVerseText(ch.verses.slice(s, e + 1).join(" "));
      })
      .catch(() => setVerseText("…"));
  }, [m]);

  const range =
    m.verse_end && m.verse_end !== m.verse_start
      ? `${m.verse_start}-${m.verse_end}`
      : `${m.verse_start}`;

  return (
    <div
      className={`max-w-[80%] overflow-hidden rounded-2xl border ${
        mine ? "rounded-br-md border-brand/30" : "rounded-bl-md border-line"
      } bg-surface`}
    >
      <div className="bg-gradient-to-br from-brand/15 to-gold/5 px-4 pb-3 pt-3">
        <div className="text-xs font-semibold text-brand">
          ✨ {bookName(m.book)} {m.chapter}:{range}
        </div>
        <p className="amharic mt-1.5 text-[15px] leading-relaxed text-ink">
          {verseText ?? "…"}
        </p>
      </div>
    </div>
  );
}

