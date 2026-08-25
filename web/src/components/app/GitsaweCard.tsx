"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResolvedRef, TodaysGitsawe } from "@/lib/gitsawe";

/**
 * One reading, laid out the way the daily chapter is: a centred heading, then
 * numbered verses. Mirrors GitsaweCard in mobile/lib/widgets/gitsawe_card.dart.
 */
function Reading({ slot, r }: { slot: string; r: ResolvedRef }) {
  return (
    <div className="pt-5">
      <div className="text-center">
        <div className="amharic text-[0.72em] font-semibold uppercase tracking-[0.16em] text-gold">
          {slot}
        </div>
        <Link
          href={`/read?b=${r.bookNum}&c=${r.ref.chapter}`}
          className="amharic mt-1.5 block text-[1.25em] font-bold leading-tight text-ink transition hover:text-brand"
        >
          {r.bookName}
        </Link>
        <div className="font-display mt-0.5 text-[0.9em] italic text-brand">
          {r.chapterLabel}
        </div>
        <div className="mx-auto mt-2.5 h-[2px] w-11 rounded-full bg-gold/55" />
      </div>

      <div className="mt-3.5">
        {(r.verses ?? []).map((v) => (
          <p
            key={v.n}
            className="amharic mb-0.5 text-ink [font-family:var(--reader-font)] [line-height:var(--reader-leading)]"
          >
            <span className="mr-1 align-super text-[0.55em] font-extrabold text-gold/70">
              {v.n}
            </span>
            {v.t}
          </p>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label, open, onClick,
}: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="amharic flex w-full items-center justify-between py-3.5 text-[0.82em] font-semibold text-ink-soft transition hover:text-ink"
    >
      <span>{label}</span>
      <span className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
    </button>
  );
}

export function GitsaweCard({ data }: { data: TodaysGitsawe }) {
  const [openHours, setOpenHours] = useState(false);
  const [openSinksar, setOpenSinksar] = useState(false);

  const readings = data.qidase.flatMap((g) =>
    g.refs.filter((r) => (r.verses?.length ?? 0) > 0).map((r) => ({ slot: g.label, r })),
  );
  const hasHours = data.morning.length > 0 || data.evening.length > 0;

  return (
    <section
      className="rise mt-5 overflow-hidden rounded-3xl border border-line bg-surface px-5 pb-4 pt-[1.1em] shadow-pop"
      style={{ fontSize: "var(--reader-size)" }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="amharic text-[0.72em] font-semibold uppercase tracking-[0.16em] text-gold">
          የዕለቱ ግጻዌ · Today&rsquo;s readings
        </span>
        <span className="amharic ml-auto text-[0.74em] font-medium text-ink-faint">
          {data.dateLabel}
        </span>
      </div>

      {readings.map(({ slot, r }, i) => (
        <div key={`${slot}-${r.label}-${i}`} className={i > 0 ? "mt-5 border-t border-line" : ""}>
          <Reading slot={slot} r={r} />
        </div>
      ))}

      {data.anaphora != null && (
        <div className="amharic mt-3 text-[0.76em] text-ink-faint">
          ቅዳሴ · አናፎራ <span className="font-semibold text-ink-soft">{data.anaphora}</span>
        </div>
      )}

      {hasHours && (
        <div className="mt-3 border-t border-line">
          <Toggle
            label="ንባበ ነግህ ወሰርክ"
            open={openHours}
            onClick={() => setOpenHours((v) => !v)}
          />
          {openHours && (
            <div className="pb-2">
              {data.morning.filter((r) => r.verses?.length).map((r, i) => (
                <div key={`m${i}`} className={i > 0 ? "border-t border-line" : ""}>
                  <Reading slot="ነግህ" r={r} />
                </div>
              ))}
              {data.evening.filter((r) => r.verses?.length).map((r, i) => (
                <div key={`e${i}`} className="border-t border-line">
                  <Reading slot="ሰርክ" r={r} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data.sinksar.length > 0 && (
        <div className="border-t border-line">
          <Toggle
            label={`ስንክሳር · ${data.sinksar.length}`}
            open={openSinksar}
            onClick={() => setOpenSinksar((v) => !v)}
          />
          {openSinksar && (
            <ul className="space-y-2 pb-3">
              {data.sinksar.map((s) => (
                <li key={s.i} className="amharic flex gap-2 text-[0.8em] leading-relaxed text-ink-soft">
                  <span className="text-gold">•</span>
                  <span>{s.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
