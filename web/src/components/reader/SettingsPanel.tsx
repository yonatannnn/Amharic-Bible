"use client";

import type { ReaderSettings } from "@/lib/useSettings";

export function SettingsPanel({
  open,
  onClose,
  settings,
  update,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[90vw] flex-col bg-surface shadow-pop transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-[17px] font-bold">⚙️ Reading Settings</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-[9px] text-lg text-ink-soft hover:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <Row label="Theme">
            <Seg
              options={[
                { v: "light", label: "☀️ Light" },
                { v: "dark", label: "🌙 Dark" },
              ]}
              value={settings.theme}
              onChange={(v) => update({ theme: v as ReaderSettings["theme"] })}
            />
          </Row>

          <Row label="Typeface">
            <Seg
              options={[
                { v: "sans", label: "Sans" },
                { v: "serif", label: "Serif" },
              ]}
              value={settings.font}
              onChange={(v) => update({ font: v as ReaderSettings["font"] })}
            />
          </Row>

          <Row label={`Font size · ${settings.size}px`}>
            <input
              type="range"
              min={15}
              max={30}
              value={settings.size}
              onChange={(e) => update({ size: +e.target.value })}
              className="w-full accent-brand"
            />
          </Row>

          <Row label={`Line spacing · ${(settings.lead / 10).toFixed(1)}`}>
            <input
              type="range"
              min={14}
              max={28}
              value={settings.lead}
              onChange={(e) => update({ lead: +e.target.value })}
              className="w-full accent-brand"
            />
          </Row>

          <div className="reader-text mt-3.5 rounded-xl bg-surface-2 p-4 text-ink">
            በመጀመሪያ እግዚአብሔር ሰማይንና ምድርን ፈጠረ።
          </div>
        </div>
      </aside>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <label className="mb-3 block text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 rounded-xl bg-surface-2 p-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-medium transition ${
            value === o.v
              ? "bg-surface text-ink shadow-card dark:bg-brand dark:text-white"
              : "text-ink-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
