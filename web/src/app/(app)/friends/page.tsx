import { getCurrentProfile } from "@/lib/profile";
import {
  getMyFriends,
  getIncomingRequests,
  getOutgoingRequests,
} from "@/lib/friends";
import { FriendsClient } from "@/components/app/FriendsClient";
import { RealtimeRefresher } from "@/components/app/RealtimeRefresher";

export const metadata = { title: "Friends · መጽሐፍ ቅዱስ" };

export default async function FriendsPage() {
  const [profile, friends, requests, sent] = await Promise.all([
    getCurrentProfile(),
    getMyFriends(),
    getIncomingRequests(),
    getOutgoingRequests(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <RealtimeRefresher tables={["friendships", "streaks"]} />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        <span className="h-1 w-1 rounded-full bg-gold" />
        ጓደኝነት · Fellowship
      </div>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink">Friends</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Share a verse with a friend every day to keep your streak alive.
      </p>
      <FriendsClient
        myId={profile!.id}
        myUsername={profile!.username!}
        friends={friends}
        incoming={requests}
        outgoing={sent}
      />
    </div>
  );
}
