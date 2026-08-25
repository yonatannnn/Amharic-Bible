/** GitHub-style heatmap of verse-sharing activity (last 12 weeks). */
export function StreakHeatmap({
  counts,
  today,
}: {
  counts: Record<string, number>;
  today: string; // YYYY-MM-DD in the user's timezone
}) {
  const WEEKS = 12;
  const days = WEEKS * 7;

  // anchor at today (noon UTC avoids DST edges), step back day by day
  const anchor = new Date(`${today}T12:00:00Z`);
  const cells: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(anchor.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: counts[key] ?? 0 });
  }

  // group into weeks (columns of 7)
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const level = (c: number) =>
    c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : 3;
  const colors = [
    "var(--surface-2)",
    "color-mix(in srgb, var(--brand) 35%, var(--surface-2))",
    "color-mix(in srgb, var(--brand) 65%, var(--surface-2))",
    "var(--brand)",
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map((c) => (
              <div
                key={c.date}
                title={`${c.date}: ${c.count} verse${c.count === 1 ? "" : "s"}`}
                className="h-3.5 w-3.5 rounded-[3px]"
                style={{ backgroundColor: colors[level(c.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
        <span>Less</span>
        {colors.map((c, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: c }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
