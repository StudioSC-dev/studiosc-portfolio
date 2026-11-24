import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import {
  ibmPlexSans,
  jetbrainsMono,
  manrope,
  redHatDisplay,
  redHatText,
} from "@/lib/fonts";

// Each face sets only a CSS variable here. globals.css decides where it applies:
// Red Hat Text on the body, Red Hat Display on headings, JetBrains Mono on pre and
// code, and the two fragment faces only under a [data-fragment] root.
const fontVariables = [
  redHatDisplay.variable,
  redHatText.variable,
  jetbrainsMono.variable,
  ibmPlexSans.variable,
  manrope.variable,
].join(" ");

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
      <body className={`${fontVariables} text-body antialiased`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
