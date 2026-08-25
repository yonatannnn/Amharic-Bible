"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { renderVerseCard, canvasToBlob } from "@/lib/verseImage";
import type { ShareFriend } from "./ShareBar";

export function VerseImageModal({
  reference,
  text,
  friends,
  userId,
  onClose,
  onToast,
}: {
  reference: string;
  text: string;
  friends: ShareFriend[];
  userId: string | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!canvasRef.current) return;
      await renderVerseCard(canvasRef.current, { text, reference });
      setReady(true);
    })();
  }, [text, reference]);

  const fileName = `${reference.replace(/[^\p{L}\d]+/gu, "-")}.png`;

  async function download() {
    const blob = await canvasToBlob(canvasRef.current!);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const blob = await canvasToBlob(canvasRef.current!);
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: reference });
      } catch {
        /* cancelled */
      }
    } else {
      download();
    }
  }

  async function sendToFriend(f: ShareFriend) {
    if (!userId) return;
    setPickOpen(false);
    setBusy(true);
    try {
      const blob = await canvasToBlob(canvasRef.current!);
      const supabase = createClient();
      const path = `${userId}/verse-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("images")
        .upload(path, blob, { contentType: "image/png" });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("images").getPublicUrl(path);
      await supabase.from("messages").insert({
        friendship_id: f.friendshipId,
        sender_id: userId,
        type: "image",
        image_url: publicUrl,
        text: reference,
      });
      onToast(`Sent to ${f.friendName.split(" ")[0]}`);
      onClose();
    } catch {
      onToast("Couldn't send — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-sm flex-col rounded-2xl bg-surface p-4 shadow-pop">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Verse image</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">
            ✕
          </button>
        </div>

        <div className="overflow-hidden rounded-xl bg-surface-2">
          <canvas
            ref={canvasRef}
            className={`aspect-square w-full transition-opacity ${
              ready ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={download}
            disabled={!ready}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
          >
            ⬇ Download
          </button>
          <button
            onClick={share}
            disabled={!ready}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
          >
            🔗 Share
          </button>
          {friends.length === 1 ? (
            <button
              onClick={() => sendToFriend(friends[0])}
              disabled={!ready || busy}
              className="col-span-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              {busy ? "Sending…" : `Send to ${friends[0].friendName.split(" ")[0]}`}
            </button>
          ) : friends.length > 1 ? (
            <div className="relative col-span-2">
              <button
                onClick={() => setPickOpen((v) => !v)}
                disabled={!ready || busy}
                className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send to a friend"}
              </button>
              {pickOpen && (
                <div className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop">
                  {friends.map((f) => (
                    <button
                      key={f.friendshipId}
                      onClick={() => sendToFriend(f)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-2"
                    >
                      📨 {f.friendName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
