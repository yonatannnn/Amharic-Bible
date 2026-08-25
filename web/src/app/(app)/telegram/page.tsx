import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { TelegramQueueClient } from "@/components/app/TelegramQueueClient";

export const metadata = { title: "Telegram queue · መጽሐፍ ቅዱስ" };

export default async function TelegramQueuePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_admin) redirect("/home");

  return <TelegramQueueClient />;
}
