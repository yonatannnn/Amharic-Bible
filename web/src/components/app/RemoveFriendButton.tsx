"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "./ConfirmDialog";

export function RemoveFriendButton({
  friendshipId,
  friendName,
}: {
  friendshipId: string;
  friendName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("friendships").delete().eq("id", friendshipId);
    router.push("/friends");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10"
      >
        Remove friend
      </button>

      <ConfirmDialog
        open={open}
        title={`Remove ${friendName}?`}
        message={
          <>
            This permanently removes <b>{friendName}</b>, your streak together, and
            your chat history. This can&apos;t be undone.
          </>
        }
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
