import Link from "next/link";

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5 font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-gold text-lg text-white">
            ✝
          </span>
          <span className="amharic text-[15px] leading-tight">
            መጽሐፍ ቅዱስ
            <span className="block text-[11px] font-medium text-ink-faint">
              Amharic Bible
            </span>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/read"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-2"
          >
            Read
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink-soft shadow-card">
          🔥 Read together. Keep the streak.
        </div>
        <h1 className="amharic max-w-3xl text-5xl font-bold leading-[1.15] sm:text-6xl">
          ቃሉን አብረን <span className="text-brand">እናንብብ</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
          Read the Amharic Bible, share a verse with a friend every day, and keep
          your streak alive together. The Word, made a daily habit.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-card transition hover:brightness-110"
          >
            Get started — it&apos;s free
          </Link>
          <Link
            href="/read"
            className="rounded-xl border border-line bg-surface px-6 py-3.5 text-[15px] font-semibold text-ink-soft shadow-card transition hover:border-brand hover:text-brand"
          >
            📖 Just read
          </Link>
        </div>

        <div className="mt-16 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { icon: "🔥", title: "Streaks", body: "Share a verse daily with a friend to keep your fire burning." },
            { icon: "💬", title: "Talk about it", body: "Chat over the passage that spoke to you both." },
            { icon: "✨", title: "Daily verse", body: "A fresh, AI-picked verse waiting every time you open." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-ink-faint">
        መጽሐፍ ቅዱስ · Amharic Bible
      </footer>
    </div>
  );
}
