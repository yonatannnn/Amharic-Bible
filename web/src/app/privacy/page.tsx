import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · መጽሐፍ ቅዱስ",
  description: "How the Amharic Bible app collects, uses, and protects your data.",
};

const UPDATED = "June 10, 2026";
const CONTACT = "yonatanalebachew7@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-2 font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-gold text-lg text-white">
          ✝
        </span>
        <span className="amharic text-[15px]">መጽሐፍ ቅዱስ</span>
      </Link>

      <h1 className="mt-8 font-display text-3xl font-bold text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-faint">Last updated: {UPDATED}</p>

      <div className="prose-policy mt-8 space-y-7 text-[15px] leading-relaxed text-ink-soft">
        <p>
          መጽሐፍ ቅዱስ (&quot;Amharic Bible,&quot; the &quot;App&quot;) lets you read the Amharic
          Bible, share a daily verse with friends, and keep a reading streak. This policy
          explains what information we collect, how we use it, and the choices you have. It
          applies to the mobile app and the web app at{" "}
          <span className="text-ink">amharic-bible-eta.vercel.app</span>.
        </p>

        <Section title="Information we collect">
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <b className="text-ink">Account information.</b> When you sign up with email or
              Google Sign-In, we collect your email address and, optionally, your display
              name, username, and profile photo.
            </li>
            <li>
              <b className="text-ink">Content you create.</b> Verses, messages, and photos you
              share with friends, your reading progress, streaks, bookmarks, and highlights.
            </li>
            <li>
              <b className="text-ink">Friend connections.</b> The friends you add and the
              friend requests you send or receive.
            </li>
            <li>
              <b className="text-ink">Device &amp; notification data.</b> A push-notification
              token so we can send you streak and verse reminders, and basic technical data
              (such as time zone) needed to deliver the service.
            </li>
          </ul>
          <p className="mt-3">
            We do <b className="text-ink">not</b> collect precise location, contacts, or
            advertising identifiers, and the App contains no ads.
          </p>
        </Section>

        <Section title="How we use your information">
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>To create and secure your account and sign you in.</li>
            <li>To deliver core features: sharing verses, chatting with friends, tracking streaks and reading progress.</li>
            <li>To send notifications you&apos;ve enabled (e.g. streak reminders, the daily verse).</li>
            <li>To keep the service reliable and prevent abuse.</li>
          </ul>
          <p className="mt-3">
            We do not sell your personal information, and we do not use it for advertising.
          </p>
        </Section>

        <Section title="How your information is shared">
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <b className="text-ink">With friends.</b> Your name, username, profile photo,
              and any verses, messages, or photos you send are visible to the friends you
              share them with.
            </li>
            <li>
              <b className="text-ink">Service providers.</b> We use trusted providers to run
              the App:
              <ul className="mt-1 list-[circle] space-y-1 pl-5">
                <li><b className="text-ink">Supabase</b> — database, authentication, and storage.</li>
                <li><b className="text-ink">Google Sign-In</b> — optional sign-in.</li>
                <li><b className="text-ink">Firebase Cloud Messaging (Google)</b> — push notifications.</li>
                <li><b className="text-ink">Vercel</b> — hosting of the web app.</li>
              </ul>
            </li>
          </ul>
          <p className="mt-3">
            Our optional public Telegram channel (&quot;Verse of the Day&quot;) broadcasts a
            daily verse. It does not receive any of your in-app account data; only people who
            choose to start that bot interact with it.
          </p>
        </Section>

        <Section title="Data retention &amp; deletion">
          <p>
            We keep your information for as long as your account is active. You can delete your
            account at any time from <b className="text-ink">Settings → Delete account</b> in
            the App, which permanently removes your profile, messages, streaks, and shared
            content. You may also request deletion by emailing us at the address below.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data is transmitted over encrypted connections (HTTPS/TLS) and stored with our
            providers using industry-standard protections and access controls. No method of
            transmission or storage is 100% secure, but we work to protect your information.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            The App is not directed to children under 13, and we do not knowingly collect
            personal information from them. If you believe a child has provided us
            information, contact us and we will delete it.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Edit your name, username, and photo in your profile.</li>
            <li>Turn notifications on or off on your device.</li>
            <li>Remove friends, which deletes your shared streak and chat history with them.</li>
            <li>Delete your account entirely from Settings.</li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. We will revise the &quot;Last
            updated&quot; date above and, for significant changes, notify you in the App.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            If you have questions about this policy or your data, email{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold text-brand hover:underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>

      <div className="mt-12 border-t border-line pt-6 text-sm">
        <Link href="/" className="text-brand hover:underline">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
