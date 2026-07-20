import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Display face for headings. Instrument Serif only ships a 400 weight, which is
// why headings use tracking rather than font-bold (see globals.css).
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "StudioSC | High-Integrity Engineering & Quality Assurance",
    template: "%s | StudioSC",
  },
  description:
    "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
  keywords: [
    "software development",
    "quality assurance",
    "full-stack development",
    "QA automation",
    "software engineering",
    "technical consulting",
  ],
  authors: [{ name: "StudioSC" }],
  creator: "StudioSC",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://studiosc.dev",
    siteName: "StudioSC",
    title: "StudioSC | High-Integrity Engineering & Quality Assurance",
    description:
      "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
  },
  twitter: {
    card: "summary_large_image",
    title: "StudioSC | High-Integrity Engineering & Quality Assurance",
    description:
      "A specialized engineering duo focused on building robust architecture and hardening it through enterprise-grade QA.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html>
    // before React hydrates, so the server and client markup differ by design.
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          // Must run before first paint to avoid a flash of the wrong theme.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body
        // No bg-* here on purpose: the page colour lives on <html> so the paper
        // texture (a z-index:-1 pseudo-element) is not painted over by body's
        // own background, which renders after negative-z-index children.
        className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} text-body antialiased`}
      >
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
