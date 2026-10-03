import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: the `middleware` convention was renamed to `proxy`.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, image files, API routes (they do
    // their own auth), and the bundled scripture data in /public — the Bible
    // text, the ግጻዌ lectionary and the ስንክሳር. Those are fetched server-side
    // during render, so an auth redirect on them breaks the page.
    "/((?!_next/static|_next/image|api|bible/|gitsawe/|sinksar/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
