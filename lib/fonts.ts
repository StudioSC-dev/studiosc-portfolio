import {
  JetBrains_Mono,
  Manrope,
  Red_Hat_Display,
  Red_Hat_Text,
} from "next/font/google";
import localFont from "next/font/local";

/*
  Every face the site uses, self-hosted by next/font as a Latin subset.
  docs/design-system.md ("Type") is the source for which face goes where.

  Red Hat Display and Red Hat Text are variable fonts: Google serves one Latin
  file per family whatever weights are asked for, so the two families stay at
  two files on any route.
*/

/** Headings, tabs and the wordmark. */
export const redHatDisplay = Red_Hat_Display({
  variable: "--font-red-hat-display",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

/** Body text. */
export const redHatText = Red_Hat_Text({
  variable: "--font-red-hat-text",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

/**
  Code face, on `pre` and `code` only (see globals.css). Not preloaded, so it is
  fetched only on a page that renders code.
*/
export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/*
  Fragment faces: the faces the boards draw inside a product fragment. They are
  applied only under a `[data-fragment]` root (globals.css) and are not
  preloaded, so a page that renders no fragment never fetches them.
*/

/**
  Tally & Trace ledger and the form helper: IBM Plex Sans, self-hosted. Google's
  Latin file has no peso sign, and its Latin Extended file would add about
  25 KiB for that one glyph, so this is a cut of the OFL release (the Google
  Fonts source, version 3.201): Latin plus U+20B1, the weight axis trimmed to
  the board's 400 to 600, width fixed at 100, no hinting. One file, 31,644
  bytes. A cut is a Modified Version under the OFL, which reserves the name
  "Plex", so the file's internal name is "SSC Fragment Sans". The licence is
  beside it; docs/design-system.md has the steps.
*/
export const ibmPlexSans = localFont({
  src: "../app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-ibm-plex-sans",
  display: "swap",
  preload: false,
});

/** Central Command day feed and the habit tracker. */
export const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
