/**
 * What docs/design-system.md must cover, written down independently of the doc
 * from the plan's §2 table, the Range boards and PRV-2's Scope. The spec checks
 * the doc against this list (so removing an entry from the doc fails) and the
 * site against the doc (so a token that drifts from the doc fails).
 */

export type Hex = `#${string}`;

/** §2 "Tokens and type": [light, dark]. */
export const ROOT_TOKENS: Record<string, readonly [Hex, Hex]> = {
  "--gallery": ["#E9EAEC", "#141619"],
  "--plate": ["#FFFFFF", "#1D2024"],
  "--peek": ["#F4F5F6", "#191B1F"],
  "--ink": ["#1D1F23", "#ECEEF1"],
  "--muted": ["#5E636B", "#A3A9B2"],
  "--rule": ["#D0D3D8", "#30343A"],
  "--accent": ["#1F4FD1", "#7FA2FF"],
  // The contact boards' error colour, separate from the status --danger.
  "--error": ["#B3261E", "#FF9B8F"],
};

/** The dot fields' opacity, [light, dark], from the boards' themes table. */
export const DOTS_OPACITY = ["0.55", "0.7"] as const;

/** Scope: the four status colours keep their light and dark values. */
export const STATUS_TOKENS: Record<string, readonly [Hex, Hex]> = {
  "--ok": ["#3C610B", "#A3B18A"],
  "--warn": ["#7F4021", "#D9A05B"],
  "--info": ["#59554F", "#A8A29E"],
  "--danger": ["#8C221D", "#E0918A"],
};

/** Scope: the six old names and the Range token each one aliases. */
export const LEGACY_ALIASES: Record<string, string> = {
  "--paper": "--gallery",
  "--surface": "--plate",
  "--sunken": "--peek",
  "--line": "--rule",
  "--line-strong": "--rule",
  "--body": "--ink",
};

/** The retired constants; no declaration of any of them may remain. */
export const RETIRED_DARK_TOKENS = [
  "--dark-paper",
  "--dark-surface",
  "--dark-sunken",
  "--dark-line",
  "--dark-line-strong",
  "--dark-ink",
  "--dark-body",
  "--dark-muted",
  "--dark-ok",
  "--dark-warn",
  "--dark-info",
  "--dark-danger",
] as const;

/**
 * Product palettes, as the boards draw each fragment (range-light-desktop and
 * range-dark-desktop draw them identically: they keep their light values in
 * both themes).
 */
export const FRAGMENT_TOKENS: Record<string, Hex> = {
  "--frag-tt-band": "#1F4D3A",
  "--frag-tt-on-band": "#FFFFFF",
  "--frag-tt-ink": "#1C2420",
  "--frag-tt-muted": "#58615B",
  "--frag-tt-rule": "#DCE3DE",
  "--frag-tt-pad": "#F6F9F6",
  "--frag-tt-sheet": "#FFFFFF",
  "--frag-tt-red": "#B3261E",
  "--frag-tt-green": "#23613F",
  "--frag-cc-bg": "#EEF1F6",
  "--frag-cc-panel": "#FFFFFF",
  "--frag-cc-ink": "#1A2233",
  "--frag-cc-muted": "#4F5A70",
  "--frag-cc-line": "#D9DFEA",
  "--frag-cc-accent": "#2F6FED",
  "--frag-cc-sleep": "#DB4C75",
  "--frag-cc-weather": "#3A9ABB",
  "--frag-cc-calendar": "#9B4ED6",
  "--frag-cc-fitness": "#2E9E5B",
  "--frag-cc-tickets": "#D94640",
  "--frag-cc-news": "#5B72A8",
  "--frag-habit-bg": "#EEF3F1",
  "--frag-habit-line": "#D5E2DD",
  "--frag-habit-device": "#111315",
  "--frag-habit-screen": "#FFFFFF",
  "--frag-habit-ink": "#17201C",
  "--frag-habit-muted": "#4F5E58",
  "--frag-habit-rule": "#E3EAE7",
  "--frag-habit-done": "#0E7C66",
  "--frag-habit-ring": "#6B7A74",
  "--frag-form-bg": "#F7F6F3",
  "--frag-form-line": "#E2DFD8",
  "--frag-form-field": "#FFFFFF",
  "--frag-form-draft-line": "#C9C4BA",
  "--frag-form-ink": "#1F1D1A",
  "--frag-form-on-ink": "#FFFFFF",
  "--frag-form-muted": "#5C574F",
  "--frag-turntable-stage": "#0F1113",
  "--frag-turntable-grid": "#2A2E33",
  "--frag-turntable-edge": "#7FA2FF",
  "--frag-turntable-control-line": "#5A616B",
  "--frag-turntable-control-ink": "#E6E8EB",
  "--frag-site-gallery": "#E9EAEC",
  "--frag-site-plate": "#FFFFFF",
  "--frag-site-peek": "#F1F2F4",
  "--frag-site-ink": "#1D1F23",
  "--frag-site-muted": "#5E636B",
  "--frag-site-rule": "#D0D3D8",
  "--frag-site-line": "#C4C8CE",
  "--frag-site-faint": "#9AA0A8",
  "--frag-focus": "#1F4FD1",
  "--frag-turntable-focus": "#7FA2FF",
};

/**
 * Context-specific colour tokens: the value a token takes inside a context, in
 * [light, dark]. `fixture` names the fixture root it is read on.
 */
export const CONTEXT_TOKENS: ReadonlyArray<{
  token: string;
  context: string;
  values: readonly [Hex, Hex];
}> = [
  { token: "--focus", context: ":root", values: ["#1F4FD1", "#7FA2FF"] },
  {
    token: "--focus",
    context: "[data-fragment]",
    values: ["#1F4FD1", "#1F4FD1"],
  },
  {
    token: "--focus",
    context: '[data-stage="turntable"]',
    values: ["#7FA2FF", "#7FA2FF"],
  },
];

/**
 * Text pairings the doc must list, each checked at 4.5:1 or more in both
 * themes. The §2 accent pairs are the first two rows; then ink and muted on
 * each surface, the primary button, the status colours on the page surfaces,
 * and each product palette's text on its own surfaces.
 */
export const REQUIRED_PAIRINGS: ReadonlyArray<readonly [string, string]> = [
  ["--accent", "--gallery"],
  ["--accent", "--plate"],
  ["--accent", "--peek"],
  ["--error", "--plate"],
  ["--error", "--gallery"],
  ["--ink", "--gallery"],
  ["--ink", "--plate"],
  ["--ink", "--peek"],
  ["--muted", "--gallery"],
  ["--muted", "--plate"],
  ["--muted", "--peek"],
  ["--gallery", "--ink"],
  ["--ok", "--gallery"],
  ["--ok", "--plate"],
  ["--warn", "--gallery"],
  ["--warn", "--plate"],
  ["--info", "--gallery"],
  ["--info", "--plate"],
  ["--danger", "--gallery"],
  ["--danger", "--plate"],
  ["--frag-tt-ink", "--frag-tt-pad"],
  ["--frag-tt-ink", "--frag-tt-sheet"],
  ["--frag-tt-muted", "--frag-tt-pad"],
  ["--frag-tt-muted", "--frag-tt-sheet"],
  ["--frag-tt-on-band", "--frag-tt-band"],
  ["--frag-tt-red", "--frag-tt-sheet"],
  ["--frag-tt-green", "--frag-tt-sheet"],
  ["--frag-cc-ink", "--frag-cc-bg"],
  ["--frag-cc-ink", "--frag-cc-panel"],
  ["--frag-cc-muted", "--frag-cc-bg"],
  ["--frag-cc-muted", "--frag-cc-panel"],
  ["--frag-habit-ink", "--frag-habit-screen"],
  ["--frag-habit-muted", "--frag-habit-screen"],
  ["--frag-form-ink", "--frag-form-bg"],
  ["--frag-form-ink", "--frag-form-field"],
  ["--frag-form-muted", "--frag-form-bg"],
  ["--frag-form-muted", "--frag-form-field"],
  ["--frag-form-on-ink", "--frag-form-ink"],
  ["--frag-turntable-control-ink", "--frag-turntable-stage"],
  ["--frag-site-ink", "--frag-site-plate"],
  ["--frag-site-muted", "--frag-site-plate"],
];

/** Board ids the doc may cite (the canvas board names, never a path). */
export const BOARD_IDS = [
  "range-light-desktop",
  "range-dark-desktop",
  "range-phone",
  "range-profile-seth-desktop",
  "range-profile-christine-desktop",
  "pages-post-work-desktop",
  "pages-post-life-desktop",
  "pages-404-desktop",
  "pages-contact-desktop",
  "pages-contact-phone",
] as const;

/** Scope's component list; each needs its own entry with a board reference. */
export const COMPONENTS = [
  "Tab pill",
  "Chip row",
  "Plate",
  "Peek",
  "Credit line",
  "Christine line",
  "Lab tag",
  "Person frame",
  "Holly's pile",
  "Ruled list",
  "Buttons",
] as const;

/**
 * What each component entry must say, and the boards it must cite: the details
 * a later ticket builds from, including every size, radius and padding a
 * later ticket would build to. Checked with whitespace collapsed.
 */
export const COMPONENT_DETAILS: Record<
  (typeof COMPONENTS)[number],
  { boards: readonly (typeof BOARD_IDS)[number][]; details: readonly string[] }
> = {
  "Tab pill": {
    boards: ["range-light-desktop"],
    details: [
      "Choose a category",
      "aria-pressed",
      '"3D & motion"',
      "pill shadow",
      "0.3125rem padding",
      "0.25rem gap",
      "overlaps the top of the stage by 1.5rem",
      "15/20, 2.5rem tall",
    ],
  },
  "Chip row": {
    boards: ["range-phone"],
    details: [
      "Scroll the categories back",
      "Scroll the categories forward",
      "2.75rem pills",
      "round 2.75rem scroll buttons",
      "15/20",
    ],
  },
  Plate: {
    boards: ["range-light-desktop", "range-phone"],
    details: [
      "14px radius",
      'aria-roledescription="slide"',
      "text-section-phone",
      "n of 7",
      "padding 3.25rem 2.5rem 2.5rem",
      "two columns (19rem and the fragment)",
      "32/40, -0.015em",
      "6px frame",
      "13/20",
      "pads 1rem",
    ],
  },
  Peek: {
    boards: ["range-light-desktop"],
    details: [
      "aria-hidden",
      "12px radius",
      "plate-fade",
      "inset 9% top and bottom",
      "18/24",
      "0.75 opacity",
    ],
  },
  "Credit line": {
    boards: ["range-light-desktop"],
    details: [
      "Built by Seth · Tested by Christine",
      "#seth",
      "#christine",
      "15/24",
    ],
  },
  "Christine line": {
    boards: ["range-light-desktop"],
    details: [
      "Checked by Christine.",
      "40-character sha",
      "Illustrative wording",
      "1px `--rule` rule, 14/22",
    ],
  },
  "Lab tag": {
    boards: ["range-light-desktop"],
    details: [
      "Lab demo",
      "dashed",
      "Nobody's hired us for one of these yet.",
      "0 0.375rem padding",
      "a 4px radius",
      "Red Hat Text 500, 12/18",
      "14/22 `--muted`",
    ],
  },
  "Person frame": {
    boards: [
      "range-light-desktop",
      "range-phone",
      "range-profile-seth-desktop",
      "range-profile-christine-desktop",
    ],
    details: [
      "1px `--ink` border",
      "text-person-phone",
      "Or hire us both for your project or idea",
      "14px radius",
      "pads 2.5rem on desktop and 1.5rem 1rem on a phone",
      "a 7rem photo on desktop and 5.5rem on a phone",
      "36/44, -0.02em",
      "20/28 on desktop and 18/24 on a phone",
    ],
  },
  "Holly's pile": {
    boards: ["range-light-desktop", "range-phone"],
    details: [
      "Photos of Holly.",
      "12rem on a phone",
      "Chief Morale Officer",
      "Give Holly a treat",
      "a 2.5rem radius",
      "4° and -3°",
      "44/48 on desktop and 36/40 on a phone",
      "20/28",
    ],
  },
  "Ruled list": {
    boards: ["range-light-desktop"],
    details: [
      "list-style: none",
      "Never cards",
      "0.875rem",
      "0.625rem",
      "18/24",
      "3rem apart",
    ],
  },
  Buttons: {
    boards: ["range-light-desktop"],
    details: [
      "Start a project",
      "No arrow glyph",
      "Lucide is the only icon set",
      "6px radius, 15/24 600, 3rem tall with 1.375rem padding",
      "2.75rem square",
      "offset 0.2em",
    ],
  },
};

/** Sections the doc must have, by heading. */
export const SECTIONS = [
  "Colour",
  "Root colour tokens",
  "Context tokens",
  "Status colours",
  "Legacy aliases",
  "Product palettes",
  "Text pairings",
  "Type",
  "Type scale",
  "Font fallback",
  "Shape",
  "Layout",
  "Focus",
  "Motion",
  "Keyframes",
  "Components",
] as const;

/** §2 type: role, size/line-height and tracking, as the doc's scale table states them. */
export const TYPE_SCALE: ReadonlyArray<readonly [string, string, string]> = [
  ["Display (h1), desktop", "92/92", "-0.04em"],
  ["Display (h1), phone", "42/46", "-0.035em"],
  ["Section title", "32/40", "-0.015em"],
  ["Section title, phone", "24/32", "0"],
  ["Person name", "36/44", "-0.02em"],
  ["Person name, phone", "28/36", "-0.02em"],
  ["Title", "20/28", "0"],
  ["Lead", "18/28", "0"],
  ["Body", "16/26", "0"],
  ["Small", "15/24", "0"],
  ["Meta", "13/20", "0"],
  ["Caption", "12/18", "0"],
];

/** §2 faces and where each goes. */
export const FACES = [
  "Red Hat Display",
  "Red Hat Text",
  "JetBrains Mono",
  "IBM Plex Sans",
  "Manrope",
] as const;

/** §2 shape: element and value. */
export const SHAPE: ReadonlyArray<readonly [string, string]> = [
  ["Plate", "14px"],
  ["Peek", "12px"],
  ["Person frame", "14px"],
  ["Photo", "14px"],
  ["Holly's frame", "2.5rem"],
  ["Control", "6px"],
  ["Tab and chip", "999px"],
];

/** §2 layout facts. */
export const LAYOUT = [
  "content-box",
  "box-content max-w-page px-gutter mx-auto",
  "75rem",
  "2.5rem",
  "1280px",
  "16px",
] as const;

/** Focus facts. */
export const FOCUS = ["2px", "3px", "--focus"] as const;

/** §2 motion table: each moment needs a row with a reduced-motion fallback. */
export const MOTION_MOMENTS = [
  "Load",
  "Tab, back or next",
  "Theme toggle",
  "Testing plate",
  "Form helper",
  "Turntable",
  "Post Gallery",
  "Holly's pile",
] as const;

/** Scope: every board keyframe. */
export const KEYFRAMES = [
  "rise",
  "stage-in",
  "fade-in",
  "word-in",
  "plate-from-left",
  "plate-from-right",
  "plate-fade",
  "tick-in",
  "stream-in",
  "turn",
  "wiggle-a",
  "wiggle-b",
  "ears-a",
  "ears-b",
  "tuck-a",
  "tuck-b",
  "untuck-a",
  "untuck-b",
  "theme-reveal",
] as const;

/** Scope's fallback order, step number and its key phrase. */
export const FONT_FALLBACK_STEPS: ReadonlyArray<readonly [number, string]> = [
  [1, "Trim the weight axes"],
  [2, "Red Hat Text 600 to 700"],
  [3, "display: 'optional'"],
  [4, "docs/boards/deviations.md"],
];

/** Weights the boards use, per face. */
export const BOARD_WEIGHTS: Record<string, readonly string[]> = {
  "Red Hat Display": ["400", "600", "700"],
  "Red Hat Text": ["400", "500", "600"],
  "IBM Plex Sans": ["400", "500", "600"],
  Manrope: ["400", "600", "700", "800"],
  "JetBrains Mono": ["400"],
};

/** §1's performance baseline routes. */
export const BUDGET_ROUTES = [
  "/",
  "/work",
  "/work/tallyandtrace",
  "/blog",
  "/blog/tallyandtrace-performance",
  "/about",
] as const;

/** AC13's routes. */
export const SCOPE_ROUTES = [
  "/",
  "/work",
  "/work/tallyandtrace",
  "/blog",
  "/about",
  "/contact",
] as const;

/** A route that renders code, for the JetBrains Mono checks. */
export const CODE_ROUTE = "/blog/tallyandtrace-sentry";

/**
 * PRV-2's Scope: the files the diff may touch. Directory entries end in "/".
 * docs/boards/deviations.md is not one: the owner ruled (2026-11-24) that the
 * Plex overage is fixed by trimming the font, so PRV-2 leaves that file alone.
 */
export const SCOPE_FILES = [
  "docs/design-system.md",
  "app/globals.css",
  "app/layout.tsx",
  "lib/fonts.ts",
  // Owner ruling, 2026-11-24: the self-hosted IBM Plex Sans cut and its licence.
  "app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2",
  "app/fonts/ibm-plex-sans/OFL.txt",
  "e2e/design-tokens.spec.ts",
  "e2e/fixtures/design-tokens/",
  "docs/perf/prv-2.json",
] as const;
