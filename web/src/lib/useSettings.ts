"use client";

import { useCallback, useEffect, useState } from "react";

export type ReaderSettings = {
  theme: "light" | "dark";
  font: "sans" | "serif";
  size: number; // px
  lead: number; // line-height * 10
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "light",
  font: "serif",
  size: 16,
  lead: 20,
};

const KEY = "ab_settings";

const FONT_VAR: Record<ReaderSettings["font"], string> = {
  sans: "var(--font-eth-sans)",
  serif: "var(--font-eth-serif)",
};

export function applySettings(s: ReaderSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", s.theme);
  root.style.setProperty("--reader-font", FONT_VAR[s.font]);
  root.style.setProperty("--reader-size", `${s.size}px`);
  root.style.setProperty("--reader-leading", (s.lead / 10).toFixed(1));
}

function read(): ReaderSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const s = read();
    setSettings(s);
    applySettings(s);
  }, []);

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      applySettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
