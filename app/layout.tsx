import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const montserrat = Montserrat({
  variable: "--font-montserrat",
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
    <html lang="en">
      <head>
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body className={`${montserrat.variable} antialiased`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
