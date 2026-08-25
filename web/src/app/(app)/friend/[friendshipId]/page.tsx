import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { ClickableAvatar } from "@/components/app/ClickableAvatar";
import { StreakHeatmap } from "@/components/app/StreakHeatmap";
import { RemoveFriendButton } from "@/components/app/RemoveFriendButton";
import { RealtimeRefresher } from "@/components/app/RealtimeRefresher";

export const metadata = { title: "Friend · መጽሐፍ ቅዱስ" };

function todayInTz(tz: string | null) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function FriendPage({
  params,
}: {
  params: Promise<{ friendshipId: string }>;
}) {
  const { friendshipId } = await params;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const { data: f } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .eq("id", friendshipId)
    .maybeSingle();
  if (!f || (f.requester_id !== me.id && f.addressee_id !== me.id)) notFound();

  const friendId = f.requester_id === me.id ? f.addressee_id : f.requester_id;
  const [{ data: friend }, { data: streak }, { data: verses }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, username, avatar_url")
      .eq("id", friendId)
      .single(),
    supabase
      .from("streaks")
      .select("count, longest, restores_remaining")
      .eq("friendship_id", friendshipId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("created_at, sender_id")
      .eq("friendship_id", friendshipId)
      .eq("type", "verse")
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  const tz = me.timezone;
  const counts: Record<string, number> = {};
  const dayKey = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(
        new Date(iso),
      );
    } catch {
      return iso.slice(0, 10);
    }
  };
  (verses ?? []).forEach((v) => {
    const k = dayKey(v.created_at as string);
    counts[k] = (counts[k] ?? 0) + 1;
  });

  const totalVerses = verses?.length ?? 0;
  const daysActive = Object.keys(counts).length;
  const myVerses = (verses ?? []).filter((v) => v.sender_id === me.id).length;

  return (
    <div className="mx-auto max-w-2xl px-5 py-7">
      <RealtimeRefresher tables={["streaks", "messages"]} />
      <Link
        href={`/chat/${friendshipId}`}
        className="text-sm font-medium text-brand hover:underline"
      >
        ← Back to chat
      </Link>

      <div className="mt-4 flex flex-col items-center text-center">
        <ClickableAvatar
          name={friend?.name ?? friend?.username ?? null}
          url={friend?.avatar_url ?? null}
          size={88}
        />
        <h1 className="mt-3 text-xl font-bold">
          {friend?.name ?? friend?.username}
        </h1>
        <p className="text-sm text-ink-faint">@{friend?.username}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={streak?.count ?? 0} label="Current 🔥" />
        <Stat n={streak?.longest ?? 0} label="Longest" />
        <Stat n={totalVerses} label="Verses shared" />
        <Stat n={daysActive} label="Days active" />
      </div>

      <section className="mt-7 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sharing activity</h2>
          <span className="text-xs text-ink-faint">last 12 weeks</span>
        </div>
        <StreakHeatmap counts={counts} today={todayInTz(tz)} />
        <p className="mt-4 text-xs text-ink-faint">
          You&apos;ve shared {myVerses} of {totalVerses} verses with{" "}
          {friend?.name ?? friend?.username}.
        </p>
      </section>

      <Link
        href={`/chat/${friendshipId}`}
        className="mt-5 block w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-brand-ink"
      >
        Open chat
      </Link>

      <RemoveFriendButton
        friendshipId={friendshipId}
        friendName={friend?.name ?? friend?.username ?? "this friend"}
      />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center">
      <div className="text-2xl font-bold text-brand">{n}</div>
      <div className="mt-0.5 text-xs text-ink-faint">{label}</div>
    </div>
  );
}
