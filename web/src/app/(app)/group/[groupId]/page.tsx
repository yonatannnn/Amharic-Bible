import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getGroup } from "@/lib/groups";
import { GroupRoom, type GroupMessage } from "@/components/app/GroupRoom";

export const metadata = { title: "Group · መጽሐፍ ቅዱስ" };

export default async function GroupThread({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const group = await getGroup(groupId);
  if (!group) notFound();

  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("group_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(200);

  return (
    <GroupRoom
      groupId={groupId}
      myId={me.id}
      group={{
        name: group.name,
        avatar_url: group.avatar_url,
        memberCount: group.members.length,
      }}
      members={group.members}
      initialMessages={(messages as GroupMessage[]) ?? []}
    />
  );
}
