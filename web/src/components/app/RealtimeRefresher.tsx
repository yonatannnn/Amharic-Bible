"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Invisible helper: re-fetches the current server component whenever a row in
 * one of the given tables changes (RLS scopes events to the user's own data).
 */
export function RealtimeRefresher({ tables }: { tables: string[] }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const key = tables.join(",");

  useEffect(() => {
    const ch = supabase.channel(`rt-refresh:${key}`);
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 250); // small debounce
    };
    key.split(",").forEach((table) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh),
    );
    ch.subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, router, key]);

  return null;
}
