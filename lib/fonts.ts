import localFont from "next/font/local";

/*
  Every face the site uses, self-hosted by next/font as a Latin subset.
  docs/design-system.md ("Type") is the source for which face goes where.

  Red Hat Display, Red Hat Text and Manrope are variable fonts: one Latin file
  per family, the boards' pinned files (docs/boards/fonts/, the `latin`
  unicode-range entries of google.css), copied byte for byte with the OFL
  licence beside each, so the built type matches the references whatever
  Google serves on a given day. JetBrains Mono, which the boards do not pin, is
  self-hosted too, and nothing here comes from next/font/google.
*/

/*
  next/font/local names the face after the exported constant, and writes that
  name into both the @font-face and the --font-* variable. The boards, and the
  fidelity check that reads them, know the families as "Red Hat Display", "Red
  Hat Text" and "Manrope", the way next/font/google scoped them
  (`__Red_Hat_Display_<hash>`), so the constants carry those names, with the
  first eight hex digits of the file's sha256 as the hash. The names the rest
  of the site imports are the aliases below each one.
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
  fetched only on a page that renders code. The boards draw code in a system
  monospace stack and do not pin this face, so the file is the Latin weight-400
  woff2 Google Fonts served for this declaration on 2026-11-26 (source URL and
  SHA-256 in docs/tickets/PRV-26.md), with the upstream OFL licence beside it.
  No size-adjusted fallback face: one sized for Arial would put the first paint
  of code in a proportional face ahead of the monospace stack.
*/
export const __JetBrains_Mono_14425ba9 = localFont({
  src: "../app/fonts/jetbrains-mono/jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
export const jetbrainsMono = __JetBrains_Mono_14425ba9;

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

/**
  Central Command day feed and the habit tracker: the boards' pinned Latin file
  (Manrope, weights 400 to 800 on one variable axis), byte for byte.
*/
export const __Manrope_8c2def02 = localFont({
  src: "../app/fonts/manrope/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "400 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
});
export const manrope = __Manrope_8c2def02;
