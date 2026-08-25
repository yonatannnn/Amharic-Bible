import { getTodaysGitsawe } from "@/lib/gitsawe";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await getTodaysGitsawe();
  return Response.json({
    ok: !!g,
    date: g?.dateLabel ?? null,
    gospel: g?.gospel?.label ?? null,
    verses: g?.gospel?.verses?.length ?? 0,
    readings: g?.qidase.map((q) => q.label) ?? [],
  });
}
