import { getCurrentProfile } from "@/lib/profile";
import { SettingsClient } from "@/components/app/SettingsClient";

export const metadata = { title: "Settings · መጽሐፍ ቅዱስ" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
        <span className="h-1 w-1 rounded-full bg-gold" />
        ቅንብሮች · Preferences
      </div>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink">Settings</h1>
      <SettingsClient
        userId={profile!.id}
        email={profile?.email ?? ""}
        timezone={profile?.timezone ?? "Africa/Addis_Ababa"}
      />
    </div>
  );
}
