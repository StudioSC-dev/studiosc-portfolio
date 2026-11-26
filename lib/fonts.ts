import { JetBrains_Mono, Manrope } from "next/font/google";
import localFont from "next/font/local";

/*
  Every face the site uses, self-hosted by next/font as a Latin subset.
  docs/design-system.md ("Type") is the source for which face goes where.

  Red Hat Display and Red Hat Text are variable fonts: one Latin file per
  family, so the two families stay at two files on any route. They are the
  boards' pinned files (docs/boards/fonts/, Google Fonts v21 and v19, the
  `latin` unicode-range entries of google.css), copied byte for byte with the
  OFL licence beside each, so the built type matches the references whatever
  Google serves on a given day.
*/

/*
  next/font/local names the face after the exported constant, and writes that
  name into both the @font-face and the --font-red-hat-* variable. The boards,
  and the fidelity check that reads them, know the families as "Red Hat
  Display" and "Red Hat Text", the way next/font/google scoped them
  (`__Red_Hat_Display_<hash>`), so the constants carry those names, with the
  first eight hex digits of the pinned file's sha256 as the hash. The names
  the rest of the site imports are the two aliases below each one.
*/

/** Headings, tabs and the wordmark. Pinned Latin file, weights 400 to 800. */
export const __Red_Hat_Display_f7a7830b = localFont({
  src: "../app/fonts/red-hat-display/red-hat-display-latin.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-red-hat-display",
  display: "swap",
  adjustFontFallback: "Arial",
});
export const redHatDisplay = __Red_Hat_Display_f7a7830b;

/** Body text. Pinned Latin file, weights 400 to 700. */
export const __Red_Hat_Text_59826f39 = localFont({
  src: "../app/fonts/red-hat-text/red-hat-text-latin.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-red-hat-text",
  display: "swap",
  adjustFontFallback: "Arial",
});
export const redHatText = __Red_Hat_Text_59826f39;

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
