import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { ChatRoom, type ChatMessage } from "@/components/app/ChatRoom";

export const metadata = { title: "Chat · መጽሐፍ ቅዱስ" };

export default async function ChatThread({
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
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (!f || (f.requester_id !== me.id && f.addressee_id !== me.id)) notFound();

  const friendId = f.requester_id === me.id ? f.addressee_id : f.requester_id;
  const [{ data: friend }, { data: messages }, { data: streak }] = await Promise.all([
    supabase.from("profiles").select("id, username, name, avatar_url").eq("id", friendId).single(),
    supabase
      .from("messages")
      .select("*")
      .eq("friendship_id", friendshipId)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("streaks").select("count, window_deadline, requester_shared, addressee_shared, broken").eq("friendship_id", friendshipId).maybeSingle(),
  ]);

  return (
    <ChatRoom
      friendshipId={friendshipId}
      myId={me.id}
      friend={{
        id: friendId,
        name: friend?.name ?? friend?.username ?? "Friend",
        username: friend?.username ?? "",
        avatar_url: friend?.avatar_url ?? null,
      }}
      initialMessages={(messages as ChatMessage[]) ?? []}
      initialStreak={streak?.count ?? 0}
    />
  );
}
