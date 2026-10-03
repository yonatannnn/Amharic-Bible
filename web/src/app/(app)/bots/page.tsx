import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { BotSubscribers, type Bot } from "@/components/app/BotSubscribers";

export const metadata = { title: "Bot subscribers · መጽሐፍ ቅዱስ" };

// Always read fresh — a cached count is worse than useless here.
export const dynamic = "force-dynamic";

type Row = {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  active: boolean;
  subscribed_at: string;
};

export default async function BotsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_admin) redirect("/home");

  // Service role: both subscriber tables are RLS-locked to it.
  const supabase = createServiceClient();
  const [verse, gitsawe] = await Promise.all([
    supabase.from("telegram_subscribers")
      .select("chat_id, username, first_name, active, subscribed_at")
      .order("subscribed_at", { ascending: false }),
    supabase.from("gitsawe_subscribers")
      .select("chat_id, username, first_name, active, subscribed_at")
      .order("subscribed_at", { ascending: false }),
  ]);

  const bots: Bot[] = [
    {
      key: "verse",
      name: "የዕለቱ ቃል",
      handle: "verse bot",
      rows: (verse.data ?? []) as Row[],
      error: verse.error?.message ?? null,
    },
    {
      key: "gitsawe",
      name: "ወንጌል",
      handle: "@wenngel_bot",
      rows: (gitsawe.data ?? []) as Row[],
      error: gitsawe.error?.message ?? null,
    },
  ];

  return <BotSubscribers bots={bots} fetchedAt={new Date().toISOString()} />;
}
