"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSettings } from "@/lib/useSettings";
import { getBooks, type BookRef } from "@/lib/bible";
import { CHAPTER_COUNTS } from "@/lib/readingPlan";
import { ConfirmDialog } from "./ConfirmDialog";

const ADDIS = "Africa/Addis_Ababa";

/** Today's date as YYYY-MM-DD in Ethiopia time (the shared "reading day"). */
function addisToday(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ADDIS }).format(
      new Date(),
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function SettingsClient({
  userId,
  email,
  timezone,
}: {
  userId: string;
  email: string;
  timezone: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { settings, update } = useSettings();

  const [tz, setTz] = useState(timezone);
  const [zones, setZones] = useState<string[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [books, setBooks] = useState<BookRef[]>([]);
  const [inOrder, setInOrder] = useState(false);
  const [startBook, setStartBook] = useState(1);
  const [startChapter, setStartChapter] = useState(1);

  useEffect(() => {
    try {
      const all: string[] = Intl.supportedValuesOf?.("timeZone") ?? [];
      setZones(all.length ? all : [timezone]);
    } catch {
      setZones([timezone]);
    }
  }, [timezone]);

  // Load book names + this user's existing reading plan.
  useEffect(() => {
    let alive = true;
    getBooks()
      .then((b) => alive && setBooks(b))
      .catch(() => {});
    supabase
      .from("reading_plan")
      .select("mode,start_book,start_chapter")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        setInOrder(data.mode === "consecutive");
        if (data.start_book) setStartBook(data.start_book);
        if (data.start_chapter) setStartChapter(data.start_chapter);
      });
    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  /** Upsert the plan, stamping start_date = today so "today" maps to the start. */
  async function savePlan(next: {
    mode: "random" | "consecutive";
    book: number;
    chapter: number;
  }) {
    const book = Math.min(Math.max(1, next.book), 66);
    const chapter = Math.min(
      Math.max(1, next.chapter),
      CHAPTER_COUNTS[book - 1],
    );
    const { error } = await supabase.from("reading_plan").upsert(
      {
        user_id: userId,
        mode: next.mode,
        start_book: book,
        start_chapter: chapter,
        start_date: addisToday(),
      },
      { onConflict: "user_id" },
    );
    if (error) return flash(error.message);
    flash("Reading plan saved");
  }

  function toggleInOrder(on: boolean) {
    setInOrder(on);
    savePlan({
      mode: on ? "consecutive" : "random",
      book: startBook,
      chapter: startChapter,
    });
  }

  function changeStartBook(book: number) {
    const chapter = Math.min(startChapter, CHAPTER_COUNTS[book - 1]);
    setStartBook(book);
    setStartChapter(chapter);
    if (inOrder) savePlan({ mode: "consecutive", book, chapter });
  }

  function changeStartChapter(chapter: number) {
    setStartChapter(chapter);
    if (inOrder)
      savePlan({ mode: "consecutive", book: startBook, chapter });
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  }

  async function saveTz(value: string) {
    setTz(value);
    await supabase.from("profiles").update({ timezone: value }).eq("id", userId);
    flash("Timezone saved");
  }

  async function changePassword() {
    if (!currentPassword) return flash("Enter your current password");
    if (password.length < 6) return flash("New password must be 6+ characters");
    setPwBusy(true);
    // verify the current password by re-authenticating
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyErr) {
      setPwBusy(false);
      return flash("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) return flash(error.message);
    setCurrentPassword("");
    setPassword("");
    flash("Password updated ✓");
  }

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      return flash(error.message);
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      {/* appearance */}
      <Section title="Appearance">
        <Field label="Theme">
          <Seg
            options={[
              { v: "light", label: "☀️ Light" },
              { v: "dark", label: "🌙 Dark" },
            ]}
            value={settings.theme}
            onChange={(v) => update({ theme: v as "light" | "dark" })}
          />
        </Field>
        <Field label="Typeface">
          <Seg
            options={[
              { v: "sans", label: "Sans" },
              { v: "serif", label: "Serif" },
            ]}
            value={settings.font}
            onChange={(v) => update({ font: v as "sans" | "serif" })}
          />
        </Field>
        <Field label={`Font size · ${settings.size}px`}>
          <input
            type="range"
            min={15}
            max={30}
            value={settings.size}
            onChange={(e) => update({ size: +e.target.value })}
            className="w-full accent-brand"
          />
        </Field>
        <div className="reader-text rounded-xl bg-surface-2 p-3 text-ink">
          በመጀመሪያ እግዚአብሔር ሰማይንና ምድርን ፈጠረ።
        </div>
      </Section>

      {/* daily chapter */}
      <Section title="Daily chapter">
        <Field label="Read the Bible in order">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <span className="text-sm text-ink-soft">
              Advance one chapter each day
            </span>
            <Toggle on={inOrder} onChange={toggleInOrder} />
          </div>
        </Field>
        {inOrder && (
          <Field label="Start from">
            <div className="flex gap-2">
              <select
                value={startBook}
                onChange={(e) => changeStartBook(+e.target.value)}
                className="flex-1 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
              >
                {Array.from({ length: 66 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {books.find((b) => b.num === n)?.name ?? `Book ${n}`}
                  </option>
                ))}
              </select>
              <select
                value={startChapter}
                onChange={(e) => changeStartChapter(+e.target.value)}
                className="w-28 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
              >
                {Array.from(
                  { length: CHAPTER_COUNTS[startBook - 1] },
                  (_, i) => i + 1,
                ).map((c) => (
                  <option key={c} value={c}>
                    Ch {c}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        )}
        <p className="text-[13px] text-ink-faint">
          Today shows your chosen chapter; it advances one chapter each day.
        </p>
      </Section>

      {/* account */}
      <Section title="Account">
        <Field label="Email">
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-soft">
            {email || "—"}
          </div>
        </Field>
        <Field label="Timezone (controls your streak day)">
          <select
            value={tz}
            onChange={(e) => saveTz(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Change password">
          <div className="space-y-2">
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
            />
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="flex-1 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={changePassword}
                disabled={!currentPassword || !password || pwBusy}
                className="rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink transition hover:brightness-110 disabled:opacity-50"
              >
                {pwBusy ? "…" : "Update"}
              </button>
            </div>
          </div>
        </Field>
      </Section>

      {/* danger */}
      <Section title="Danger zone">
        <button
          onClick={() => setDeleteOpen(true)}
          className="w-full rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10"
        >
          Delete account
        </button>
      </Section>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        message="This permanently deletes your account, streaks, messages, and saved verses. This can't be undone."
        confirmLabel="Delete account"
        danger
        requireText="DELETE"
        busy={deleting}
        onConfirm={deleteAccount}
        onCancel={() => setDeleteOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-pop lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        on ? "bg-brand" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1.5 rounded-xl bg-surface-2 p-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-medium transition ${
            value === o.v
              ? "bg-surface text-ink shadow-card dark:bg-brand dark:text-white"
              : "text-ink-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
