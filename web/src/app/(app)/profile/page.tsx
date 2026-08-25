import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getMyFriends } from "@/lib/friends";
import { ProfileEditor } from "@/components/app/ProfileEditor";
import { RealtimeRefresher } from "@/components/app/RealtimeRefresher";

export const metadata = { title: "Profile · መጽሐፍ ቅዱስ" };

export default async function ProfilePage() {
  const [profile, friends] = await Promise.all([
    getCurrentProfile(),
    getMyFriends(),
  ]);

  const supabase = await createClient();
  const { count: versesShared } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", profile!.id)
    .eq("type", "verse");

  const bestStreak = friends.reduce((m, f) => Math.max(m, f.streak?.count ?? 0), 0);
  const longest = friends.reduce((m, f) => Math.max(m, f.streak?.longest ?? 0), 0);

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <RealtimeRefresher tables={["streaks", "friendships", "messages"]} />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            <span className="h-1 w-1 rounded-full bg-gold" />
            መገለጫ · Profile
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">Profile</h1>
        </div>
        <Link
          href="/settings"
          className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-lg text-ink-soft transition hover:border-brand hover:text-brand"
          title="Settings"
        >
          ⚙️
        </Link>
      </div>

      {/* stats */}
      <div className="mt-6 grid grid-cols-4 gap-2.5">
        <Stat n={bestStreak} label="Best 🔥" />
        <Stat n={longest} label="Longest" />
        <Stat n={friends.length} label="Friends" />
        <Stat n={versesShared ?? 0} label="Verses" />
      </div>

      {/* editor */}
      <div className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-card">
        <ProfileEditor
          userId={profile!.id}
          initialName={profile?.name ?? ""}
          initialUsername={profile?.username ?? ""}
          initialAvatar={profile?.avatar_url ?? null}
        />
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center shadow-card">
      <div className="font-display text-2xl font-bold text-brand">{n}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
