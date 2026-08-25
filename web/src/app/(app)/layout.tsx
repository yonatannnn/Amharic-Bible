import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { AppShell } from "@/components/app/AppShell";
import { StreakReminder } from "@/components/app/StreakReminder";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.username) redirect("/onboarding");

  return (
    <AppShell
      myId={profile.id}
      username={profile.username}
      name={profile.name}
      avatarUrl={profile.avatar_url}
    >
      <StreakReminder myId={profile.id} />
      {children}
    </AppShell>
  );
}
