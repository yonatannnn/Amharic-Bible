import { createClient } from "@/lib/supabase/server";

export type GroupMember = {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  role: string;
};

export type GroupInfo = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  memberCount: number;
  lastReadAt: string | null;
};

type MembershipRow = {
  group_id: string;
  role: string;
  last_read_at: string | null;
  groups: { id: string; name: string; avatar_url: string | null } | null;
};

/** All groups the current user belongs to (with role + member count). */
export async function getMyGroups(): Promise<GroupInfo[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, last_read_at, groups(id, name, avatar_url)")
    .eq("user_id", user.id);

  const rows = (memberships as unknown as MembershipRow[]) ?? [];
  const valid = rows.filter((m) => m.groups);
  if (valid.length === 0) return [];

  const groupIds = valid.map((m) => m.group_id);
  const { data: allMembers } = await supabase
    .from("group_members")
    .select("group_id")
    .in("group_id", groupIds);

  const counts = new Map<string, number>();
  for (const r of allMembers ?? [])
    counts.set(r.group_id as string, (counts.get(r.group_id as string) ?? 0) + 1);

  return valid.map((m) => ({
    id: m.groups!.id,
    name: m.groups!.name,
    avatar_url: m.groups!.avatar_url,
    role: m.role,
    memberCount: counts.get(m.group_id) ?? 1,
    lastReadAt: m.last_read_at,
  }));
}

export type GroupDetail = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  members: GroupMember[];
  myRole: string;
};

/** Full group with its member roster, or null if the user isn't a member. */
export async function getGroup(groupId: string): Promise<GroupDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, avatar_url, created_by")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return null;

  const { data: memberRows } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(id, username, name, avatar_url)")
    .eq("group_id", groupId);

  const rows = (memberRows ?? []) as unknown as {
    user_id: string;
    role: string;
    profiles: { id: string; username: string | null; name: string | null; avatar_url: string | null } | null;
  }[];

  const mine = rows.find((r) => r.user_id === user.id);
  if (!mine) return null; // RLS would also hide it, but be explicit

  const members: GroupMember[] = rows.map((r) => ({
    id: r.user_id,
    username: r.profiles?.username ?? null,
    name: r.profiles?.name ?? null,
    avatar_url: r.profiles?.avatar_url ?? null,
    role: r.role,
  }));

  return {
    id: group.id,
    name: group.name,
    avatar_url: group.avatar_url,
    created_by: group.created_by,
    members,
    myRole: mine.role,
  };
}
