import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { NewGroupClient } from "@/components/app/NewGroupClient";

export const metadata = { title: "New group · መጽሐፍ ቅዱስ" };

export default async function NewGroupPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  return <NewGroupClient myId={me.id} />;
}
