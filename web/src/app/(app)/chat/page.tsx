import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyFriends } from "@/lib/friends";
import { getMyGroups } from "@/lib/groups";
import { ClickableAvatar } from "@/components/app/ClickableAvatar";
import { RealtimeRefresher } from "@/components/app/RealtimeRefresher";

export const metadata = { title: "Chats · መጽሐፍ ቅዱስ" };

type Msg = {
  friendship_id: string;
  type: string;
  text: string | null;
  sender_id: string;
  created_at: string;
  read_at: string | null;
};

type GMsg = {
  group_id: string;
  type: string;
  text: string | null;
  sender_id: string;
  created_at: string;
};

type Item = {
  kind: "dm" | "group";
  id: string; // friendshipId or groupId
  href: string;
  title: string;
  avatarName: string;
  avatarUrl: string | null;
  preview: string;
  time: string | null;
  sortKey: string;
  unread: number;
  streak: number | null;
  subtitle: string | null;
};

function previewOf(type: string, text: string | null, mine: boolean): string {
  const p = mine ? "You: " : "";
  if (type === "verse") return `${p}📖 Shared a verse`;
  if (type === "image") return `${p}🖼 Photo`;
  return `${p}${text ?? ""}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ChatIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myId = user!.id;

  const [friends, groups] = await Promise.all([getMyFriends(), getMyGroups()]);

  const items: Item[] = [];

  // ---- direct messages ----
  if (friends.length > 0) {
    const fids = friends.map((f) => f.friendshipId);
    const { data: msgs } = await supabase
      .from("messages")
      .select("friendship_id, type, text, sender_id, created_at, read_at")
      .in("friendship_id", fids)
      .order("created_at", { ascending: false })
      .limit(400);

    const last = new Map<string, Msg>();
    const unread = new Map<string, number>();
    for (const m of (msgs as Msg[]) ?? []) {
      if (!last.has(m.friendship_id)) last.set(m.friendship_id, m);
      if (m.sender_id !== myId && !m.read_at)
        unread.set(m.friendship_id, (unread.get(m.friendship_id) ?? 0) + 1);
    }

    for (const f of friends) {
      const lm = last.get(f.friendshipId);
      items.push({
        kind: "dm",
        id: f.friendshipId,
        href: `/chat/${f.friendshipId}`,
        title: f.friend.name ?? f.friend.username ?? "Friend",
        avatarName: f.friend.name ?? f.friend.username ?? "?",
        avatarUrl: f.friend.avatar_url,
        preview: lm ? previewOf(lm.type, lm.text, lm.sender_id === myId) : "Share a verse to start your streak",
        time: lm ? timeLabel(lm.created_at) : null,
        sortKey: lm?.created_at ?? "",
        unread: unread.get(f.friendshipId) ?? 0,
        streak: f.streak?.count ?? 0,
        subtitle: null,
      });
    }
  }

  // ---- groups ----
  if (groups.length > 0) {
    const gids = groups.map((g) => g.id);
    const { data: gmsgs } = await supabase
      .from("group_messages")
      .select("group_id, type, text, sender_id, created_at")
      .in("group_id", gids)
      .order("created_at", { ascending: false })
      .limit(400);

    const last = new Map<string, GMsg>();
    const unread = new Map<string, number>();
    const allRows = (gmsgs as GMsg[]) ?? [];
    for (const m of allRows) {
      if (!last.has(m.group_id)) last.set(m.group_id, m);
    }
    // unread = messages from others newer than my last_read_at
    for (const g of groups) {
      const since = g.lastReadAt ? new Date(g.lastReadAt).getTime() : 0;
      const n = allRows.filter(
        (m) => m.group_id === g.id && m.sender_id !== myId && new Date(m.created_at).getTime() > since,
      ).length;
      unread.set(g.id, n);
    }

    for (const g of groups) {
      const lm = last.get(g.id);
      items.push({
        kind: "group",
        id: g.id,
        href: `/group/${g.id}`,
        title: g.name,
        avatarName: g.name,
        avatarUrl: g.avatar_url,
        preview: lm ? previewOf(lm.type, lm.text, lm.sender_id === myId) : "Share a verse to get started",
        time: lm ? timeLabel(lm.created_at) : null,
        sortKey: lm?.created_at ?? "",
        unread: unread.get(g.id) ?? 0,
        streak: null,
        subtitle: `${g.memberCount} members`,
      });
    }
  }

  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <RealtimeRefresher tables={["messages", "streaks", "group_messages", "group_members"]} />
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            <span className="h-1 w-1 rounded-full bg-gold" />
            መልእክቶች · Messages
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">Chats</h1>
        </div>
        <Link
          href="/groups/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110"
        >
          + New group
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-16 grid place-items-center px-6 text-center">
          <div className="max-w-xs">
            <div className="font-display text-6xl text-gold/50">✦</div>
            <h2 className="amharic mt-4 text-xl font-bold">ገና ውይይት የለም</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Add a friend or start a group to begin sharing verses.
            </p>
            <Link
              href="/friends"
              className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
            >
              Find a friend
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
          {items.map((it, i) => (
            <Link
              key={`${it.kind}:${it.id}`}
              href={it.href}
              className={`flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-surface-2 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              {it.kind === "group" ? (
                <GroupAvatar name={it.avatarName} url={it.avatarUrl} size={52} />
              ) : (
                <ClickableAvatar name={it.avatarName} url={it.avatarUrl} size={52} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {it.kind === "group" && <span className="text-xs">👥</span>}
                    <span className="truncate font-semibold text-ink">{it.title}</span>
                  </span>
                  {it.time && (
                    <span className="shrink-0 text-[11px] text-ink-faint">{it.time}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      it.unread > 0 ? "font-medium text-ink" : "text-ink-faint"
                    }`}
                  >
                    {it.preview}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {it.streak !== null && (
                      <span className="text-xs font-bold text-ink-soft">🔥 {it.streak}</span>
                    )}
                    {it.unread > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-ink">
                        {it.unread}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupAvatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand to-gold font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
