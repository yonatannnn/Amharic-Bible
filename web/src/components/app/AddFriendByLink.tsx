"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type State =
  | { kind: "working" }
  | { kind: "done"; name: string }
  | { kind: "error"; message: string };

export function AddFriendByLink({ username }: { username: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/add/${username}`);
        return;
      }

      // find target
      const { data: target } = await supabase
        .from("profiles")
        .select("id, name, username")
        .ilike("username", username)
        .maybeSingle();
      if (!target) return setState({ kind: "error", message: "That user doesn't exist." });
      if (target.id === user.id) return setState({ kind: "error", message: "That's you! 🙂" });

      // existing row between us, either direction?
      const { data: existing } = await supabase
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();

      if (existing) {
        if (existing.status !== "accepted") {
          await supabase
            .from("friendships")
            .update({ status: "accepted", updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      } else {
        const { error } = await supabase.from("friendships").insert({
          requester_id: user.id,
          addressee_id: target.id,
          status: "accepted", // invite links pair instantly
        });
        if (error) return setState({ kind: "error", message: error.message });
      }

      setState({ kind: "done", name: target.name ?? target.username ?? "your friend" });
      setTimeout(() => {
        router.push("/home");
        router.refresh();
      }, 1400);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return (
    <div className="w-full max-w-sm text-center">
      {state.kind === "working" && (
        <>
          <div className="spinner mx-auto" />
          <p className="mt-4 text-sm text-ink-soft">Connecting you with @{username}…</p>
        </>
      )}
      {state.kind === "done" && (
        <>
          <div className="text-5xl">🎉</div>
          <h1 className="amharic mt-3 text-xl font-bold">
            You and {state.name} are now friends!
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Share a verse to start your streak…
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <div className="text-5xl">🙁</div>
          <p className="mt-3 text-ink">{state.message}</p>
          <Link
            href="/home"
            className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            Go home
          </Link>
        </>
      )}
    </div>
  );
}
