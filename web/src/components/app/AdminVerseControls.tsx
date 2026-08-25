"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VersePicker, type PickedVerse } from "@/components/app/VersePicker";

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

/**
 * Admin-only controls overlaid on the verse-of-the-day hero (mirrors mobile):
 *  • Change today's verse — override the current 12h window immediately
 *  • Telegram queue — manage the daily 6 AM broadcast
 */
export function AdminVerseControls() {
  const router = useRouter();
  const supabase = createClient();
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }

  async function setOverride(v: PickedVerse) {
    setPicking(false);
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const windowIndex = Math.floor(Date.now() / TWELVE_HOURS);
    const { error } = await supabase.from("daily_verse_override").upsert({
      id: 1,
      book: v.book,
      chapter: v.chapter,
      verse: v.verse,
      window_index: windowIndex,
      set_by: user?.id ?? null,
      set_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      flash("Could not update");
    } else {
      flash("Verse updated");
      router.refresh();
    }
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          disabled={busy}
          className="grid h-7 w-7 place-items-center rounded-full text-gold-soft transition hover:bg-white/10 disabled:opacity-50"
          aria-label="Admin verse controls"
        >
          {/* pencil */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>

        {menu && (
          <>
            <button
              className="fixed inset-0 z-[60] cursor-default"
              aria-hidden
              onClick={() => setMenu(false)}
            />
            <div className="absolute right-0 top-9 z-[70] w-56 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop">
              <button
                onClick={() => {
                  setMenu(false);
                  setPicking(true);
                }}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="text-brand">⇄</span>
                <span>
                  <span className="block font-medium">Change today&apos;s verse</span>
                  <span className="block text-xs text-ink-faint">
                    Override the in-app verse now
                  </span>
                </span>
              </button>
              <a
                href="/telegram"
                className="flex w-full items-start gap-2 border-t border-line px-3 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="text-brand">➤</span>
                <span>
                  <span className="block font-medium">Telegram queue</span>
                  <span className="block text-xs text-ink-faint">
                    Manage the daily 6 AM broadcast
                  </span>
                </span>
              </a>
            </div>
          </>
        )}
      </div>

      {picking && (
        <VersePicker
          title="Change today's verse"
          confirmLabel="Set"
          onPick={setOverride}
          onClose={() => setPicking(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </>
  );
}
