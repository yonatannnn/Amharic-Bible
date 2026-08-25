"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startProgress } from "@/lib/progress";
import { PullToRefresh } from "./PullToRefresh";

const NAV = [
  { href: "/home", label: "Home", icon: "🏠" },
  { href: "/read", label: "Read", icon: "📖" },
  { href: "/friends", label: "Friends", icon: "👥" },
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export function AppShell({
  children,
  myId,
  username,
  name,
  avatarUrl,
}: {
  children: React.ReactNode;
  myId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);

  const refresh = useCallback(async () => {
    const [{ count: u }, { count: r }, { data: g }] = await Promise.all([
      supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .neq("sender_id", myId)
        .is("read_at", null),
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("addressee_id", myId)
        .eq("status", "pending"),
      supabase.rpc("group_unread_count"),
    ]);
    setUnread((u ?? 0) + (typeof g === "number" ? g : 0));
    setRequests(r ?? 0);
  }, [supabase, myId]);

  // refresh counts on mount and whenever the route changes
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  // live updates for new messages / friend requests
  useEffect(() => {
    const ch = supabase
      .channel("nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, refresh]);

  async function signOut() {
    startProgress(); // show the top bar through sign-out + redirect
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const badgeFor = (href: string) =>
    href === "/chat" ? unread : href === "/friends" ? requests : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      {/* desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex lg:h-full lg:overflow-y-auto">
        <Link href="/home" className="mb-6 flex items-center gap-2.5 px-2 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-gold text-lg text-white">
            ✝
          </span>
          <span className="amharic text-[15px]">መጽሐፍ ቅዱስ</span>
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const badge = badgeFor(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive(n.href)
                    ? "bg-brand-soft text-brand"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="text-lg">{n.icon}</span>
                {n.label}
                {badge > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line pt-3">
          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2"
          >
            <NavAvatar name={name ?? username} url={avatarUrl} size={32} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{name ?? username}</div>
              <div className="truncate text-xs text-ink-faint">@{username}</div>
            </div>
          </Link>
          <Link
            href="/settings"
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            ⚙️ Settings
          </Link>
          <button
            onClick={signOut}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* content — pull down at the top of any page to refresh */}
      <PullToRefresh>{children}</PullToRefresh>

      {/* mobile bottom nav (in-flow, always visible) */}
      <nav className="flex shrink-0 border-t border-line bg-surface lg:hidden">
        {NAV.map((n) => {
          const badge = badgeFor(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                isActive(n.href) ? "text-brand" : "text-ink-faint"
              }`}
            >
              {n.href === "/profile" ? (
                <span
                  className={`rounded-full ${
                    isActive(n.href) ? "ring-2 ring-brand" : ""
                  }`}
                >
                  <NavAvatar name={name ?? username} url={avatarUrl} size={22} />
                </span>
              ) : (
                <span className="text-xl">{n.icon}</span>
              )}
              {n.label}
              {badge > 0 && (
                <span className="absolute right-[22%] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavAvatar({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size: number;
}) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className="grid place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-good font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
