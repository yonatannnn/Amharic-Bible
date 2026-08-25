import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const friendshipId = form.get("friendshipId") as string;
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`, 303);

  await supabase.rpc("restore_streak", { p_friendship: friendshipId });

  return NextResponse.redirect(`${origin}/home`, 303);
}
