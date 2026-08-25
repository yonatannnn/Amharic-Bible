import { Suspense } from "react";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { getMyFriends, getIncomingRequests } from "@/lib/friends";
import { getDailyVerse } from "@/lib/dailyVerse";
import { getTodaysReading } from "@/lib/readingPlan";
import { getTodaysGitsawe } from "@/lib/gitsawe";
import { getChapter } from "@/lib/bible";
import { StreakCard } from "@/components/app/StreakCard";
import { StreaksList } from "@/components/app/StreaksList";
import { DailyChapterReader } from "@/components/app/DailyChapterReader";
import { AdminVerseControls } from "@/components/app/AdminVerseControls";
import { GitsaweCard } from "@/components/app/GitsaweCard";
import { RealtimeRefresher } from "@/components/app/RealtimeRefresher";

export const metadata = { title: "Home · መጽሐፍ ቅዱስ" };

export default async function HomePage() {
  // Only the greeting blocks the first paint; everything else streams in.
  const profile = await getCurrentProfile();
  const firstName = profile?.name?.split(" ")[0] ?? profile?.username ?? "friend";
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <RealtimeRefresher tables={["streaks", "friendships"]} />
      {/* greeting — paints immediately */}
      <header className="rise" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          {dateLabel}
        </div>
        <h1 className="amharic mt-2 text-3xl font-bold leading-tight text-ink">
          ሰላም, {firstName}
        </h1>
      </header>

      {/* 1 · verse of the day — streams in */}
      <Suspense fallback={<VerseSkeleton />}>
        <VerseHero isAdmin={profile?.is_admin ?? false} />
      </Suspense>

      {/* 2 · today's ግጻዌ readings — streams in */}
      <Suspense fallback={null}>
        <Gitsawe />
      </Suspense>

      {/* 3 · chapter + requests + streaks — streams in */}
      <Suspense fallback={<BelowSkeleton />}>
        <BelowVerse userId={profile!.id} />
      </Suspense>
    </div>
  );
}

/* ── verse hero ─────────────────────────────────────────────── */
async function VerseHero({ isAdmin }: { isAdmin: boolean }) {
  const verse = await getDailyVerse();
  if (!verse) return null;
  return (
    <section
      className="rise relative mt-6 overflow-hidden rounded-3xl p-[1.7em] shadow-pop"
      style={{
        fontSize: "var(--reader-size)",
        background:
          "linear-gradient(145deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 70%, #3a0d18) 100%)",
      }}
    >
      <div className="flex items-center gap-[0.6em] text-[0.68em] font-semibold uppercase tracking-[0.18em] text-gold/90">
        <span className="h-[0.32em] w-[0.32em] rounded-full bg-gold/80" />
        <span className="flex-1">የዕለቱ ቃል · Verse of the day</span>
        {isAdmin && <AdminVerseControls />}
      </div>

      <div
        aria-hidden
        className="mt-[0.6em] ml-[-0.06em] select-none font-display text-[3.4em] leading-[0.5] text-gold/45"
      >
        &ldquo;
      </div>

      <p className="text-[#fdf3ec] [font-family:var(--reader-font)] [line-height:var(--reader-leading)]">
        {verse.text}
      </p>

      <div className="mt-[1.2em] flex items-center justify-between gap-3">
        <span className="font-display text-[0.85em] italic text-gold-soft">
          — {verse.label}
        </span>
        <Link
          href={`/read?b=${verse.book}&c=${verse.chapter}`}
          className="shrink-0 rounded-full border border-white/25 px-[1em] py-[0.45em] text-[0.72em] font-semibold text-[#fdf3ec] transition hover:bg-white/10"
        >
          Open in reader →
        </Link>
      </div>
    </section>
  );
}

/* ── today's ግጻዌ ────────────────────────────────────────────── */
async function Gitsawe() {
  const data = await getTodaysGitsawe();
  if (!data) return null;
  // A handful of days in the source tables carry no Qidase readings at all.
  if (!data.gospel && data.qidase.length === 0) return null;
  return <GitsaweCard data={data} />;
}

/* ── chapter + requests + streaks ───────────────────────────── */
async function BelowVerse({ userId }: { userId: string }) {
  const [friends, requests, reading] = await Promise.all([
    getMyFriends(),
    getIncomingRequests(),
    getTodaysReading(),
  ]);

  let chapterVerses: string[] = [];
  if (reading) {
    try {
      chapterVerses = (await getChapter(reading.book, reading.chapter)).verses;
    } catch {
      chapterVerses = [];
    }
  }

  return (
    <>
      {reading && chapterVerses.length > 0 && (
        <div className="rise mt-5">
          <DailyChapterReader
            book={reading.book}
            chapter={reading.chapter}
            bookName={reading.bookName}
            verses={chapterVerses}
            alreadyReadToday={reading.alreadyReadToday}
            readingStreak={reading.readingStreak}
            userId={userId}
            friends={friends.map((f) => ({
              friendshipId: f.friendshipId,
              friendName: f.friend.name ?? f.friend.username ?? "your friend",
            }))}
          />
        </div>
      )}

      {requests.length > 0 && (
        <Link
          href="/friends"
          className="rise mt-5 flex items-center justify-between rounded-2xl border border-gold/40 bg-gold-soft/50 px-4 py-3 text-sm font-medium text-ink"
        >
          <span>
            🔔 {requests.length} friend request{requests.length > 1 ? "s" : ""}
          </span>
          <span className="text-brand">View →</span>
        </Link>
      )}

      <div className="rise mt-5">
        {friends.length === 1 ? (
          <StreakCard
            friendshipId={friends[0].friendshipId}
            friendName={
              friends[0].friend.name ?? friends[0].friend.username ?? "your friend"
            }
            streak={friends[0].streak}
            iAmRequester={friends[0].iAmRequester}
          />
        ) : friends.length > 1 ? (
          <StreaksList friends={friends} />
        ) : (
          <Link
            href="/friends"
            className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface px-6 py-9 text-center shadow-card"
          >
            <div className="text-4xl">🔥</div>
            <h3 className="amharic mt-3 text-lg font-bold">ጓደኛ ይጨምሩ</h3>
            <p className="mt-1 max-w-xs text-sm text-ink-soft">
              Add a friend and share a verse every day to start a streak together.
            </p>
            <span className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
              Add a friend
            </span>
          </Link>
        )}
      </div>
    </>
  );
}

/* ── skeletons (instant placeholders while streaming) ───────── */
function VerseSkeleton() {
  return (
    <div className="mt-6 animate-pulse rounded-3xl bg-brand/15 p-7">
      <div className="h-3 w-40 rounded bg-brand/20" />
      <div className="mt-5 space-y-2.5">
        <div className="h-4 w-full rounded bg-brand/20" />
        <div className="h-4 w-11/12 rounded bg-brand/20" />
        <div className="h-4 w-3/4 rounded bg-brand/20" />
      </div>
      <div className="mt-6 h-3 w-32 rounded bg-brand/20" />
    </div>
  );
}

function BelowSkeleton() {
  return (
    <div className="mt-5 animate-pulse space-y-5">
      <div className="rounded-3xl border border-line bg-surface p-6">
        <div className="h-3 w-44 rounded bg-surface-2" />
        <div className="mt-3 h-6 w-40 rounded bg-surface-2" />
        <div className="mt-5 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-full rounded bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="h-28 rounded-3xl border border-line bg-surface" />
    </div>
  );
}
