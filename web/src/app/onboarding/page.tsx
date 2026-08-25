import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { OnboardingForm } from "@/components/auth/OnboardingForm";

export const metadata = { title: "Choose a username · መጽሐፍ ቅዱስ" };

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.username) redirect("/home");

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <OnboardingForm
        suggested={
          profile.name?.toLowerCase().replace(/[^a-z0-9_]/g, "") ??
          profile.email?.split("@")[0]?.replace(/[^a-z0-9_]/g, "") ??
          ""
        }
        defaultName={profile.name ?? ""}
      />
    </div>
  );
}
