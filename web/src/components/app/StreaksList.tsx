import Link from "next/link";
import type { FriendInfo } from "@/lib/friends";
import { ClickableAvatar } from "./ClickableAvatar";

function status(f: FriendInfo): { label: string; tone: string } {
  const s = f.streak;
  if (!s || s.count === 0) return { label: "start a streak", tone: "text-ink-faint" };
  if (s.broken) return { label: "broken", tone: "text-red-500" };
  const meShared = f.iAmRequester ? s.requester_shared : s.addressee_shared;
  return meShared
    ? { label: "✓ shared today", tone: "text-good" }
    : { label: "your turn →", tone: "text-brand" };
}

export function StreaksList({ friends }: { friends: FriendInfo[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="border-b border-line px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
        🔥 Your streaks
      </div>
      {friends.map((f, i) => {
        const st = status(f);
        return (
          <Link
            key={f.friendshipId}
            href={`/chat/${f.friendshipId}`}
            className={`flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-surface-2 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <ClickableAvatar
              name={f.friend.name ?? f.friend.username}
              url={f.friend.avatar_url}
              size={44}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">
                {f.friend.name ?? f.friend.username}
              </div>
              <div className={`text-sm ${st.tone}`}>{st.label}</div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-ember/20 to-brand/15 px-3 py-1.5 font-display text-base font-bold text-ink">
              🔥 {f.streak?.count ?? 0}
            </div>
          </Link>
        );
      })}
    </section>
  );
}
