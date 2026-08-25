"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startProgress } from "@/lib/progress";
import { CropModal } from "./CropModal";
import { ImageLightbox } from "./ImageLightbox";

type UsernameStatus = "idle" | "checking" | "ok" | "taken" | "invalid" | "unchanged";

export function ProfileEditor({
  userId,
  initialName,
  initialUsername,
  initialAvatar,
}: {
  userId: string;
  initialName: string;
  initialUsername: string;
  initialAvatar: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [avatar, setAvatar] = useState<string | null>(initialAvatar);
  const [uStatus, setUStatus] = useState<UsernameStatus>("unchanged");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewing, setViewing] = useState(false);

  // normalize: drop any leading @, lowercase
  const clean = username.replace(/^@+/, "").trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,20}$/.test(clean);
  const changed = clean !== initialUsername.toLowerCase();

  // live username availability
  useEffect(() => {
    if (!changed) return setUStatus("unchanged");
    if (!clean) return setUStatus("idle");
    if (!valid) return setUStatus("invalid");
    setUStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", clean)
        .neq("id", userId)
        .maybeSingle();
      setUStatus(data ? "taken" : "ok");
    }, 350);
    return () => clearTimeout(t);
  }, [clean, valid, changed, supabase, userId]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10 MB.");
      return;
    }
    setError(null);
    // open the cropper with the chosen image
    setCropSrc(URL.createObjectURL(file));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadCropped(blob: Blob) {
    setCropSrc(null);
    setUploading(true);
    try {
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("images")
        .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("images").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      setAvatar(publicUrl);
      flash("Photo updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatar(null);
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    flash("Photo removed");
    router.refresh();
  }

  const usernameBlocksSave =
    changed && uStatus !== "ok"; // changed username must resolve to available

  async function save() {
    if (usernameBlocksSave) return;
    setBusy(true);
    setError(null);
    const patch: Record<string, string | null> = { name: name.trim() || null };
    if (changed && uStatus === "ok") patch.username = clean;

    const { error: err } = await supabase.from("profiles").update(patch).eq("id", userId);
    setBusy(false);
    if (err) {
      setError(err.message.includes("duplicate") ? "That username is taken." : err.message);
      return;
    }
    if (patch.username) setUsername(clean);
    flash("Profile saved");
    router.refresh();
  }

  async function signOut() {
    startProgress();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = (name || clean || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      {/* avatar */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <button
            onClick={() => (avatar ? setMenuOpen((v) => !v) : fileRef.current?.click())}
            className="group relative h-24 w-24 overflow-hidden rounded-full"
            title={avatar ? "Photo options" : "Add photo"}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center bg-gradient-to-br from-emerald-400 to-good text-4xl font-bold text-white">
                {initial}
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
              {uploading ? "…" : avatar ? "Options" : "📷 Add"}
            </span>
          </button>

          {menuOpen && avatar && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-1/2 top-full z-20 mt-2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
                <MenuItem
                  icon="👁"
                  label="View photo"
                  onClick={() => {
                    setMenuOpen(false);
                    setViewing(true);
                  }}
                />
                <MenuItem
                  icon="📷"
                  label="Change photo"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                />
                <MenuItem
                  icon="🗑"
                  label="Remove photo"
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    removeAvatar();
                  }}
                />
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="hidden"
        />
        <h2 className="mt-3 font-display text-2xl font-bold text-ink">
          {name || "Reader"}
        </h2>
        <p className="text-sm text-ink-faint">@{clean || "username"}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {avatar ? "Tap your photo to view or change" : "Tap to add a photo"}
        </p>
      </div>

      <div className="gold-rule" />

      {/* name */}
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
          Display name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
        />
      </div>

      {/* username */}
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
          Username
        </label>
        <div className="flex items-center rounded-xl border border-line bg-surface-2 px-4 focus-within:border-brand">
          <span className="text-ink-faint">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            className="w-full bg-transparent px-1 py-3 text-sm outline-none"
          />
          <UStatusDot status={uStatus} />
        </div>
        <p className="mt-1.5 h-4 text-xs">
          {uStatus === "invalid" && (
            <span className="text-warn">3–20 chars: a–z, 0–9, _</span>
          )}
          {uStatus === "taken" && <span className="text-red-500">@{clean} is taken</span>}
          {uStatus === "ok" && <span className="text-good">@{clean} is available</span>}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      <button
        onClick={save}
        disabled={busy || usernameBlocksSave}
        className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>

      <button
        onClick={signOut}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink-soft hover:bg-surface-2"
      >
        Sign out
      </button>

      {viewing && avatar && (
        <ImageLightbox src={avatar} onClose={() => setViewing(false)} />
      )}

      {cropSrc && (
        <CropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={uploadCropped}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-surface-2 ${
        danger ? "text-red-500" : "text-ink"
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function UStatusDot({ status }: { status: UsernameStatus }) {
  if (status === "checking")
    return <span className="h-2 w-2 animate-pulse rounded-full bg-ink-faint" />;
  if (status === "ok") return <span className="text-good">✓</span>;
  if (status === "taken" || status === "invalid")
    return <span className="text-red-500">✕</span>;
  return null;
}
