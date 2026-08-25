"use client";

import { useEffect, useState } from "react";

/** Consistent confirmation modal for critical/destructive actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  requireText,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string; // if set, user must type this to enable confirm
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  const blocked = requireText
    ? text.trim().toUpperCase() !== requireText.toUpperCase()
    : false;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-pop"
      >
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{message}</p>

        {requireText && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-ink-soft">
              Type{" "}
              <b className={danger ? "text-red-500" : "text-brand"}>{requireText}</b>{" "}
              to confirm
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className={`mt-1.5 w-full rounded-xl border bg-surface-2 px-4 py-2.5 text-sm outline-none ${
                danger
                  ? "border-red-500/30 focus:border-red-500"
                  : "border-line focus:border-brand"
              }`}
            />
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-surface-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked || busy}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
              danger
                ? "bg-red-500 text-white hover:brightness-110"
                : "bg-brand text-brand-ink hover:brightness-110"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
