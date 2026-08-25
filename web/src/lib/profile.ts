import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
  timezone: string | null;
  is_admin: boolean;
};

/** Current authed user's profile, or null if signed out. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, name, avatar_url, email, timezone, is_admin")
    .eq("id", user.id)
    .single();

  // Profile row is created by a DB trigger on signup; fall back to user data.
  return (
    data ?? {
      id: user.id,
      username: null,
      name: (user.user_metadata?.name as string) ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
      email: user.email ?? null,
      timezone: null,
      is_admin: false,
    }
  );
}
