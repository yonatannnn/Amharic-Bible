import type { Metadata } from "next";
import {
  Fraunces,
  Hanken_Grotesk,
  Noto_Sans_Ethiopic,
  Noto_Serif_Ethiopic,
} from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { TopProgress } from "@/components/app/TopProgress";

// Editorial display serif — headings, numerals, brand.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
});

// Warm grotesk for UI/body Latin.
const sans = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ethSans = Noto_Sans_Ethiopic({
  variable: "--font-eth-sans",
  subsets: ["ethiopic"],
  weight: ["400", "500", "600", "700"],
});

const ethSerif = Noto_Serif_Ethiopic({
  variable: "--font-eth-serif",
  subsets: ["ethiopic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "መጽሐፍ ቅዱስ · Amharic Bible",
  description:
    "Read the Amharic Bible, share a verse with a friend every day, and keep your streak alive.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="am"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${ethSans.variable} ${ethSerif.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=JSON.parse(localStorage.getItem('ab_settings')||'{}');var r=document.documentElement;if(s.theme)r.setAttribute('data-theme',s.theme);if(s.font)r.style.setProperty('--reader-font',s.font==='serif'?'var(--font-eth-serif)':'var(--font-eth-sans)');if(s.size)r.style.setProperty('--reader-size',s.size+'px');if(s.lead)r.style.setProperty('--reader-leading',(s.lead/10).toFixed(1));}catch(e){}})();`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <TopProgress />
        {children}
      </body>
    </html>
  );
}
