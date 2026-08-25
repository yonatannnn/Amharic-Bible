import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { getGroup } from "@/lib/groups";
import { GroupInfoClient } from "@/components/app/GroupInfoClient";

export const metadata = { title: "Group info · መጽሐፍ ቅዱስ" };

export default async function GroupInfoPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const group = await getGroup(groupId);
  if (!group) notFound();

  return (
    <GroupInfoClient
      myId={me.id}
      group={{
        id: group.id,
        name: group.name,
        avatar_url: group.avatar_url,
        created_by: group.created_by,
        members: group.members,
        myRole: group.myRole,
      }}
    />
  );
}
