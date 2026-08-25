"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top loading bar (NProgress-style) with a SMOOTH, CSS-driven creep.
 * Starts on internal link clicks / back-forward, completes on route render.
 */
export function TopProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0); // 0..1
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const running = useRef(false);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (running.current) return;
    running.current = true;
    if (hideT.current) clearTimeout(hideT.current);
    setDone(false);
    setVisible(true);
    setWidth(0.02);
    // two frames so the 2% width paints before the long transition to 90%
    requestAnimationFrame(() =>
      requestAnimationFrame(() => running.current && setWidth(0.9)),
    );
  }

  function finish() {
    if (!running.current) return;
    running.current = false;
    setDone(true);
    setWidth(1);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
      setDone(false);
    }, 450);
  }

  // complete whenever the path changes
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // start on internal link clicks + browser back/forward
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || target === "_blank" || a.hasAttribute("download")) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
        start();
      } catch {
        /* ignore */
      }
    }
    const onPop = () => start();
    // imperative triggers for non-link navigations (OAuth, sign-out, etc.)
    const onStart = () => start();
    const onDone = () => finish();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    window.addEventListener("topprogress:start", onStart);
    window.addEventListener("topprogress:done", onDone);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("topprogress:start", onStart);
      window.removeEventListener("topprogress:done", onDone);
      if (hideT.current) clearTimeout(hideT.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className="h-full rounded-r-full bg-brand"
        style={{
          width: `${width * 100}%`,
          opacity: done ? 0 : 1,
          // long, decelerating creep while loading; quick fill + fade on finish
          transition: done
            ? "width 250ms ease-out, opacity 400ms ease 200ms"
            : "width 14s cubic-bezier(0.05, 0.7, 0.1, 1)",
          boxShadow: "0 0 10px var(--brand), 0 0 5px var(--brand)",
        }}
      />
    </div>
  );
}
