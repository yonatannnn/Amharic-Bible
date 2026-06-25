import { createClient } from "@/lib/supabase/server";

export type Streak = {
  friendship_id: string;
  count: number;
  longest: number;
  window_deadline: string | null;
  requester_shared: boolean;
  addressee_shared: boolean;
  broken: boolean;
  broken_at: string | null;
  restores_remaining: number;
  restorable_count: number | null;
  restorable_at: string | null;
};

export type FriendInfo = {
  friendshipId: string;
  friend: {
    id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  };
  streak: Streak | null;
  iAmRequester: boolean;
};

/** The user's single accepted friendship (v1 supports one), with friend + streak. */
export async function getMyFriendship(): Promise<FriendInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: f } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();
  if (!f) return null;

  const iAmRequester = f.requester_id === user.id;
  const friendId = iAmRequester ? f.addressee_id : f.requester_id;

  const [{ data: friend }, { data: streak }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, name, avatar_url")
      .eq("id", friendId)
      .single(),
    supabase.from("streaks").select("*").eq("friendship_id", f.id).maybeSingle(),
  ]);

  return {
    friendshipId: f.id,
    friend: friend ?? { id: friendId, username: null, name: null, avatar_url: null },
    streak: (streak as Streak) ?? null,
    iAmRequester,
  };
}

/** All of the user's accepted friendships, each with friend + streak. */
export async function getMyFriends(): Promise<FriendInfo[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  if (!rows || rows.length === 0) return [];

  const friendIds = rows.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id,
  );
  const friendshipIds = rows.map((f) => f.id);

  const [{ data: profiles }, { data: streaks }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, name, avatar_url")
      .in("id", friendIds),
    supabase.from("streaks").select("*").in("friendship_id", friendshipIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const streakByFship = new Map(
    (streaks ?? []).map((s) => [s.friendship_id as string, s as Streak]),
  );

  return rows
    .map((f) => {
      const iAmRequester = f.requester_id === user.id;
      const friendId = iAmRequester ? f.addressee_id : f.requester_id;
      return {
        friendshipId: f.id,
        friend:
          profileById.get(friendId) ??
          { id: friendId, username: null, name: null, avatar_url: null },
        streak: streakByFship.get(f.id) ?? null,
        iAmRequester,
      };
    })
    .sort((a, b) => (b.streak?.count ?? 0) - (a.streak?.count ?? 0));
}

export type IncomingRequest = {
  id: string;
  requester: { id: string; username: string | null; name: string | null; avatar_url: string | null };
};

/** Pending friend requests addressed to the current user. */
export async function getIncomingRequests(): Promise<IncomingRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("friendships")
    .select("id, requester:profiles!friendships_requester_id_fkey(id, username, name, avatar_url)")
    .eq("status", "pending")
    .eq("addressee_id", user.id);

  // Supabase returns the embedded relation as an object.
  return (
    (data as unknown as IncomingRequest[]) ?? []
  );
}

export type OutgoingRequest = {
  id: string;
  addressee: { id: string; username: string | null; name: string | null; avatar_url: string | null };
};

/** Pending friend requests the current user has sent (awaiting acceptance). */
export async function getOutgoingRequests(): Promise<OutgoingRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("friendships")
    .select("id, addressee:profiles!friendships_addressee_id_fkey(id, username, name, avatar_url)")
    .eq("status", "pending")
    .eq("requester_id", user.id);

  return (data as unknown as OutgoingRequest[]) ?? [];
}
