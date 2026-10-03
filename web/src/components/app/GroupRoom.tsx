"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getBooks, getBook, type Book, type BookRef } from "@/lib/bible";
import { ClickableAvatar } from "./ClickableAvatar";
import { VerseRangePicker } from "./VerseRangePicker";
import type { GroupMember } from "@/lib/groups";

export type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  type: "verse" | "text" | "image";
  book: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  text: string | null;
  image_url: string | null;
  created_at: string;
};

const bookCache = new Map<number, Book>();
async function bookCached(n: number) {
  if (bookCache.has(n)) return bookCache.get(n)!;
  const b = await getBook(n);
  bookCache.set(n, b);
  return b;
}

export function GroupRoom({
  groupId,
  myId,
  group,
  members,
  initialMessages,
}: {
  groupId: string;
  myId: string;
  group: { name: string; avatar_url: string | null; memberCount: number };
  members: GroupMember[];
  initialMessages: GroupMessage[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<GroupMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const [books, setBooks] = useState<BookRef[]>([]);
  const seen = useRef(new Set(initialMessages.map((m) => m.id)));
  const bottomRef = useRef<HTMLDivElement>(null);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const bookName = useCallback(
    (n: number | null) => (n ? books.find((b) => b.num === n)?.name ?? `Book ${n}` : ""),
    [books],
  );

  useEffect(() => {
    getBooks().then(setBooks).catch(() => {});
  }, []);

  // mark the group read (advances my last_read_at → clears the unread badge)
  const markRead = useCallback(async () => {
    await supabase
      .from("group_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .eq("user_id", myId);
  }, [supabase, groupId, myId]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  // realtime: new messages
  useEffect(() => {
    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const m = payload.new as GroupMessage;
          if (seen.current.has(m.id)) return;
          seen.current.add(m.id);
          setMessages((prev) => [...prev, m]);
          if (m.sender_id !== myId) markRead();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId, markRead, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function sendText() {
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data } = await supabase
      .from("group_messages")
      .insert({ group_id: groupId, sender_id: myId, type: "text", text: body })
      .select()
      .single();
    if (data) {
      seen.current.add(data.id);
      setMessages((prev) => [...prev, data as GroupMessage]);
    }
  }

  async function sendVerse(book: number, chapter: number, start: number, end: number) {
    setPicking(false);
    const { data } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
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
      setMessages((prev) => [...prev, data as GroupMessage]);
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
        <GroupAvatar name={group.name} url={group.avatar_url} size={42} />
        <Link href={`/group/${groupId}/info`} className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight hover:underline">
            {group.name}
          </div>
          <div className="truncate text-xs text-ink-faint">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </div>
        </Link>
        <Link
          href={`/group/${groupId}/info`}
          className="grid h-9 w-9 place-items-center rounded-full text-lg text-ink-soft hover:bg-surface-2"
          title="Group info"
        >
          ⓘ
        </Link>
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
                Share a verse to get {group.name} talking.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.created_at, m.created_at);
              const mine = m.sender_id === myId;
              // show the sender's name/avatar when the author changes
              const showAuthor =
                !mine && (!prev || prev.sender_id !== m.sender_id || showDay);
              return (
                <div key={m.id}>
                  {showDay && <DaySeparator iso={m.created_at} />}
                  <Bubble
                    m={m}
                    mine={mine}
                    showAuthor={showAuthor}
                    sender={memberById.get(m.sender_id)}
                    bookName={bookName}
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

/* ---------------- message bubble ---------------- */
function Bubble({
  m,
  mine,
  showAuthor,
  sender,
  bookName,
}: {
  m: GroupMessage;
  mine: boolean;
  showAuthor: boolean;
  sender?: GroupMember;
  bookName: (n: number | null) => string;
}) {
  const senderName = sender?.name ?? sender?.username ?? "Someone";

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

  return (
    <div className={`mb-1.5 flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
      {!mine && (
        <div className="w-7 shrink-0 self-end">
          {showAuthor && (
            <ClickableAvatar name={senderName} url={sender?.avatar_url ?? null} size={28} />
          )}
        </div>
      )}
      <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
        {showAuthor && (
          <span className="mb-0.5 px-1 text-[11px] font-semibold text-brand">
            {senderName}
          </span>
        )}
        {content}
        <div className="mt-0.5 px-1 text-[10px] text-ink-faint">
          {fmtTime(m.created_at)}
        </div>
      </div>
    </div>
  );
}

function VerseBubble({
  m,
  mine,
  bookName,
}: {
  m: GroupMessage;
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

function GroupAvatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className="grid place-items-center rounded-2xl bg-gradient-to-br from-brand to-gold font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
