"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX = 90;
const THRESHOLD = 60;

/** True if the nearest scrollable ancestor of `target` is scrolled to the top. */
function nearestScrollerAtTop(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== stop.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      return el.scrollTop <= 0;
    }
    el = el.parentElement;
  }
  return true; // no inner scroller — the main column itself is the scroller
}

/**
 * Native-feeling pull-to-refresh for the app's scroll column. Wraps <main>.
 * Only engages when you start a downward drag at the very top of whatever is
 * scrollable under your finger, so it never hijacks mid-list scrolling (e.g.
 * the chat message list). Touch-only, so desktop is unaffected.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const main = useRef<HTMLElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function onStart(e: React.TouchEvent) {
    if (refreshing) return;
    const el = main.current;
    if (!el || el.scrollTop > 0) {
      startY.current = null;
      return;
    }
    if (!nearestScrollerAtTop(e.target, el)) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
  }

  function onMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    setPull(dy <= 0 ? 0 : Math.min(MAX, dy * 0.5));
  }

  function onEnd() {
    if (startY.current == null) return;
    const go = pull >= THRESHOLD;
    startY.current = null;
    if (go) {
      setRefreshing(true);
      setPull(46);
      router.refresh();
      window.setTimeout(() => {
        setRefreshing(false);
        setPull(0);
      }, 1000);
    } else {
      setPull(0);
    }
  }

  const dragging = startY.current != null;

  return (
    <main
      ref={main}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
      className="relative min-w-0 flex-1 overflow-y-auto overscroll-y-contain"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center"
        style={{
          transform: `translateY(${pull - 34}px)`,
          opacity: Math.min(1, pull / THRESHOLD),
          transition: dragging ? "none" : "transform 0.25s ease, opacity 0.25s ease",
        }}
      >
        <div className="mt-2 grid h-8 w-8 place-items-center rounded-full bg-surface shadow-card">
          <div
            className={`h-4 w-4 rounded-full border-2 border-line border-t-brand ${
              refreshing ? "animate-spin" : ""
            }`}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }}
          />
        </div>
      </div>
      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s ease",
        }}
      >
        {children}
      </div>
    </main>
  );
}
