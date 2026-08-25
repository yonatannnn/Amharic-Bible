"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { copyText, nativeShare } from "@/lib/share";
import { VerseImageModal } from "./VerseImageModal";

export type ShareFriend = { friendshipId: string; friendName: string };

export function ShareBar({
  label,
  text,
  book,
  chapter,
  verseStart,
  verseEnd,
  friends,
  userId,
  highlighted,
  onToast,
  onSaved,
  onClear,
}: {
  label: string;
  text: string;
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  friends: ShareFriend[];
  userId: string | null;
  highlighted?: boolean;
  onToast: (msg: string) => void;
  onSaved?: () => void;
  onClear: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  // Render into <body> so the fixed bar pins to the viewport, not to a parent
  // with a CSS transform (e.g. the home page's `.rise` reveal animation).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function save(kind: "bookmark" | "highlight") {
    if (!userId) return;
    setMenuOpen(false);
    const supabase = createClient();
    const { error } = await supabase.from("saved_verses").insert({
      user_id: userId,
      kind,
      book,
      chapter,
      verse_start: verseStart,
      verse_end: verseEnd,
    });
    if (error) return onToast("Couldn't save — try again");
    onToast(kind === "bookmark" ? "Bookmarked 🔖" : "Highlighted 🖍");
    onSaved?.();
    if (kind === "highlight") onClear();
  }

  async function unhighlight() {
    if (!userId) return;
    setMenuOpen(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("saved_verses")
      .delete()
      .eq("user_id", userId)
      .eq("kind", "highlight")
      .eq("book", book)
      .eq("chapter", chapter)
      .lte("verse_start", verseEnd)
      .gte("verse_end", verseStart);
    if (error) return onToast("Couldn't update — try again");
    onToast("Highlight removed");
    onSaved?.();
    onClear();
  }

  async function shareWith(f: ShareFriend) {
    if (!userId) return;
    setPickerOpen(false);
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      friendship_id: f.friendshipId,
      sender_id: userId,
      type: "verse",
      book,
      chapter,
      verse_start: verseStart,
      verse_end: verseEnd,
    });
    setSending(false);
    if (error) return onToast("Couldn't share — try again");
    onToast(`Shared with ${firstName(f.friendName)}! 🔥`);
    onClear();
  }

  async function doNativeShare() {
    setMenuOpen(false);
    const ok = await nativeShare(label, text);
    if (!ok) onToast("Sharing not supported here — use a link below");
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 lg:pb-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-pop backdrop-blur">
          <div className="min-w-0 flex-1 px-1.5">
            <div className="text-xs font-semibold text-brand">{label}</div>
            <div className="amharic truncate text-sm text-ink-soft">{text}</div>
          </div>

          {/* share-to-friend */}
          {friends.length === 1 ? (
            <button
              onClick={() => shareWith(friends[0])}
              disabled={sending}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110 disabled:opacity-60"
            >
              {sending ? "…" : `Share with ${firstName(friends[0].friendName)} 🔥`}
            </button>
          ) : friends.length > 1 ? (
            <div className="relative shrink-0">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                disabled={sending}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110 disabled:opacity-60"
              >
                {sending ? "…" : "Share 🔥"}
              </button>
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <div className="absolute bottom-full right-0 z-20 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop">
                    <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      Share with…
                    </div>
                    {friends.map((f) => (
                      <button
                        key={f.friendshipId}
                        onClick={() => shareWith(f)}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-2"
                      >
                        🔥 {f.friendName}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : userId ? (
            <a
              href="/friends"
              className="shrink-0 rounded-xl border border-brand/40 bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand hover:text-brand-ink"
            >
              👥 Add a friend
            </a>
          ) : null}

          {/* more menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-lg hover:bg-brand-soft"
              title="Share options"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full right-0 z-20 mb-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
                  {userId && (
                    <>
                      <Item icon="🔖" label="Bookmark" onClick={() => save("bookmark")} />
                      {highlighted ? (
                        <Item icon="🚫" label="Unhighlight" onClick={unhighlight} />
                      ) : (
                        <Item icon="🖍" label="Highlight" onClick={() => save("highlight")} />
                      )}
                      <div className="my-1 border-t border-line" />
                    </>
                  )}
                  <Item
                    icon="📋"
                    label="Copy"
                    onClick={async () => {
                      setMenuOpen(false);
                      await copyText(label, text);
                      onToast("Copied");
                    }}
                  />
                  <Item
                    icon="🖼"
                    label="Make image"
                    onClick={() => {
                      setMenuOpen(false);
                      setImageOpen(true);
                    }}
                  />
                  <Item icon="🔗" label="More…" onClick={doNativeShare} />
                </div>
              </>
            )}
          </div>

          <button
            onClick={onClear}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-faint hover:bg-surface-2"
            title="Clear"
          >
            ✕
          </button>
        </div>
      </div>

      {imageOpen && (
        <VerseImageModal
          reference={label}
          text={text}
          friends={friends}
          userId={userId}
          onClose={() => setImageOpen(false)}
          onToast={onToast}
        />
      )}
    </>,
    document.body,
  );
}

function Item({
  icon,
  label,
  onClick,
  href,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  href?: string;
}) {
  const cls =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-2";
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
        <span>{icon}</span>
        {label}
      </a>
    );
  return (
    <button onClick={onClick} className={cls}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function firstName(name: string) {
  return name.split(" ")[0];
}
