/**
 * Pure checks behind design-tokens.spec.ts. Each takes its input as data, so the
 * spec runs it once on the real site or doc and once on a broken fixture, to
 * prove the check can fail.
 */

import {
  BOARD_IDS,
  BOARD_WEIGHTS,
  COMPONENT_DETAILS,
  COMPONENTS,
  CONTEXT_TOKENS,
  DOTS_OPACITY,
  FACES,
  FOCUS,
  FONT_FALLBACK_STEPS,
  FRAGMENT_TOKENS,
  KEYFRAMES,
  LAYOUT,
  LEGACY_ALIASES,
  MOTION_MOMENTS,
  REQUIRED_PAIRINGS,
  ROOT_TOKENS,
  SECTIONS,
  SHAPE,
  STATUS_TOKENS,
  TYPE_SCALE,
} from "./inventory";

// ---------------------------------------------------------------------------
// Markdown

export type Row = Record<string, string>;

export interface ParsedDoc {
  /** Every heading's text, without the leading #s. */
  headings: string[];
  /** Tables, keyed by the nearest heading above them. */
  tables: Map<string, Row[]>;
  /** The body text under each heading, up to the next heading of any level. */
  sections: Map<string, string>;
}

/** Strips backticks, bold and surrounding whitespace from a table cell. */
export function cell(text: string): string {
  return text.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

export function parseDoc(markdown: string): ParsedDoc {
  const headings: string[] = [];
  const tables = new Map<string, Row[]>();
  const sections = new Map<string, string>();
  let current = "";
  let header: string[] | null = null;
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    }
    const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      current = heading[2].trim();
      headings.push(current);
      sections.set(current, "");
      header = null;
      continue;
    }
    sections.set(current, `${sections.get(current) ?? ""}${line}\n`);

    if (!inFence && line.trim().startsWith("|")) {
      const cells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|");
      if (header === null) {
        header = cells.map(cell);
      } else if (cells.every((c) => /^\s*:?-+:?\s*$/.test(c))) {
        // separator row
      } else {
        const row: Row = {};
        header.forEach((name, i) => {
          row[name] = cell(cells[i] ?? "");
        });
        const list = tables.get(current) ?? [];
        list.push(row);
        tables.set(current, list);
      }
    } else {
      header = null;
    }
  }
  return { headings, tables, sections };
}

export function table(doc: ParsedDoc, heading: string): Row[] {
  return doc.tables.get(heading) ?? [];
}

// ---------------------------------------------------------------------------
// Colour

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

/**
 * Parses `#RRGGBB`, `#RRGGBBAA` or a computed `rgb()` / `rgba()`, keeping the
 * alpha (1 when absent).
 */
export function toRgba(value: string): Rgba {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      v
    );
  if (rgb) {
    const alpha =
      rgb[4] === undefined
        ? 1
        : rgb[4].endsWith("%")
          ? parseFloat(rgb[4]) / 100
          : Number(rgb[4]);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
  }
  throw new Error(`Not a colour: ${value}`);
}

/** Paints `top` over an opaque `under`. */
export function composite(top: string, under: string): Rgb {
  const [r, g, b, a] = toRgba(top);
  const [ur, ug, ub, ua] = toRgba(under);
  if (ua < 1) throw new Error(`Surface is not opaque: ${under}`);
  return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];
}

export function toRgb(value: string): Rgb {
  const [r, g, b] = toRgba(value);
  return [r, g, b];
}

/** Same colour and same opacity. */
export function sameColour(a: string, b: string): boolean {
  const [x, y] = [toRgba(a), toRgba(b)];
  return (
    x[0] === y[0] &&
    x[1] === y[1] &&
    x[2] === y[2] &&
    Math.abs(x[3] - y[3]) < 0.01
  );
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 2 contrast ratio of `fg` as painted on `bg`. A translucent `fg` is
 * composited over `bg` first, so fully transparent text scores 1:1; `bg`
 * must be opaque.
 */
export function contrast(fg: string, bg: string): number {
  const [la, lb] = [luminance(composite(fg, bg)), luminance(toRgb(bg))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface RingSample {
  name: string;
  /** Whether the element holds focus and matches :focus-visible. */
  focused: boolean;
  /**
   * Whether the element is drawn at all: rendered, not visibility-hidden,
   * and neither it nor an ancestor at opacity 0.
   */
  painted: boolean;
  outlineStyle: string;
  outlineWidth: string;
  ring: string;
  /**
   * The backgrounds behind the control, nearest first, any of them
   * translucent; flattened over a white canvas before the ring is measured.
   */
  surfaces: readonly string[];
}

/** Paints `layers` (nearest first) over a white canvas, farthest first. */
export function flattenSurface(layers: readonly string[]): string {
  let under = "rgb(255, 255, 255)";
  for (const layer of [...layers].reverse()) {
    const [r, g, b] = composite(layer, under);
    under = `rgb(${r}, ${g}, ${b})`;
  }
  return under;
}

/**
 * Focus rings that are not painted (no focus, an invisible control, no
 * outline, under 2px) or are below `min` against the surface behind them.
 */
export function ringProblems(
  samples: readonly RingSample[],
  min = 3
): string[] {
  const problems: string[] = [];
  for (const s of samples) {
    if (!s.focused) problems.push(`${s.name}: not focused`);
    else if (!s.painted) problems.push(`${s.name}: not painted`);
    else if (s.outlineStyle === "none" || s.outlineStyle === "hidden")
      problems.push(`${s.name}: no outline`);
    else if (parseFloat(s.outlineWidth) < 2)
      problems.push(`${s.name}: outline ${s.outlineWidth}`);
    else {
      const ratio = contrast(s.ring, flattenSurface(s.surfaces));
      if (ratio < min) problems.push(`${s.name}: ${ratio.toFixed(2)}:1`);
    }
  }
  return problems;
}

export interface Pairing {
  name: string;
  fg: string;
  bg: string;
}

/** The pairings below `min`, each with its ratio. */
export function failingPairings(
  pairings: readonly Pairing[],
  min: number
): string[] {
  return pairings
    .map((p) => ({ p, ratio: contrast(p.fg, p.bg) }))
    .filter(({ ratio }) => ratio < min)
    .map(({ p, ratio }) => `${p.name}: ${ratio.toFixed(2)}:1`);
}

// ---------------------------------------------------------------------------
// Type

/** Letter-spacing in em, from computed px values ("normal" is 0). */
export function trackingEm(letterSpacing: string, fontSize: string): number {
  const spacing = letterSpacing === "normal" ? 0 : parseFloat(letterSpacing);
  return spacing / parseFloat(fontSize);
}

export interface LabelSample {
  where: string;
  className: string;
  textTransform: string;
  letterSpacing: string;
  fontSize: string;
}

/** Labels, subheads and display text that are not sentence case. */
export function nonSentenceCase(samples: readonly LabelSample[]): string[] {
  const problems: string[] = [];
  for (const s of samples) {
    if (s.textTransform !== "none") {
      problems.push(
        `${s.where} .${s.className}: text-transform ${s.textTransform}`
      );
    }
    if (
      s.className === "label" &&
      trackingEm(s.letterSpacing, s.fontSize) > 0.01 + 1e-6
    ) {
      problems.push(
        `${s.where} .label: letter-spacing ${trackingEm(s.letterSpacing, s.fontSize).toFixed(3)}em`
      );
    }
  }
  return problems;
}

/** The first family in a computed font-family list, unquoted. */
export function firstFamily(fontFamily: string): string {
  return fontFamily
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

export type RedHat = "Red Hat Display" | "Red Hat Text";

export interface FontConfig {
  /** The face headings compute to. */
  headingFace: RedHat;
  /**
   * Heading weights allowed: the board's listed weights for Red Hat Display,
   * or any weight from 600 to 700 once step 2 moves headings to Red Hat Text.
   */
  headingWeights:
    | { listed: readonly number[] }
    | { range: readonly [number, number] };
  /** The `display` each Red Hat face must declare. */
  display: Record<RedHat, "swap" | "optional">;
  /** The weights step 1 may trim each Red Hat face to. */
  weights: Record<RedHat, readonly string[]>;
}

/**
 * The Red Hat configuration the fallback steps in force imply. Step 2 moves
 * headings to Red Hat Text at 600 to 700; step 3 makes the heading face,
 * whichever it is, `optional`; step 1 trims each face to the weights in use.
 */
export function expectedFontConfig(steps: readonly number[]): FontConfig {
  const headingFace: RedHat = steps.includes(2)
    ? "Red Hat Text"
    : "Red Hat Display";
  const display: Record<RedHat, "swap" | "optional"> = {
    "Red Hat Display": "swap",
    "Red Hat Text": "swap",
  };
  if (steps.includes(3)) display[headingFace] = "optional";
  const textWeights = [...BOARD_WEIGHTS["Red Hat Text"]];
  if (steps.includes(2)) textWeights.push("700");
  return {
    headingFace,
    headingWeights: steps.includes(2)
      ? { range: [600, 700] }
      : { listed: BOARD_WEIGHTS["Red Hat Display"].map(Number) },
    display,
    weights: {
      "Red Hat Display": BOARD_WEIGHTS["Red Hat Display"],
      "Red Hat Text": textWeights,
    },
  };
}

/** Whether a computed heading weight is one the configuration allows. */
export function allowsHeadingWeight(
  config: FontConfig,
  weight: number
): boolean {
  const allowed = config.headingWeights;
  return "listed" in allowed
    ? allowed.listed.includes(weight)
    : weight >= allowed.range[0] && weight <= allowed.range[1];
}

export interface FontLoadLike {
  family: string;
}

/**
 * Fragment-face loads a page should not make: a face is expected only where a
 * fragment that uses it renders. `faces` maps a `data-fragment` value to its
 * CSS family; `families` is every fragment family.
 */
export function unexpectedFragmentFonts(
  loads: readonly FontLoadLike[],
  rendered: readonly string[],
  faces: Record<string, string>,
  families: readonly string[]
): string[] {
  const expected = new Set(rendered.map((f) => faces[f]).filter(Boolean));
  return loads
    .filter((l) => families.includes(l.family) && !expected.has(l.family))
    .map((l) => l.family);
}

/**
 * Icon sources a diff adds to stylesheets or markup: inline SVG, image data
 * URIs of any format, SVG files in CSS `url()`s, and any image used as a
 * CSS mask.
 */
export function addedIconSources(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .filter(
      (l) =>
        /<svg/i.test(l) ||
        // Any embedded image, vector or raster.
        /data:image\//i.test(l) ||
        /url\(\s*["']?[^)"']*\.svg/i.test(l) ||
        // Any image used as a mask, the usual way to draw an icon in CSS.
        /(?:^|[\s;{])(?:-webkit-)?mask(?:-image)?\s*:[^;]*url\(/i.test(l)
    );
}

/**
 * Where a link lands: the final URL after redirects, keeping a fragment the
 * redirect set, else the one the link asked for (as a browser does).
 */
export function finalWithFragment(finalUrl: string, requested: string): string {
  const final = new URL(finalUrl);
  if (!final.hash) final.hash = new URL(requested).hash;
  return final.href;
}

/**
 * A destination, comparable across the two test servers: an HTTP URL on
 * either server's origin is rewritten to "<origin>"; any other link is kept
 * whole.
 */
export function normalizeDestination(
  url: string,
  origins: readonly string[]
): string {
  const u = new URL(url);
  // Only HTTP links on a test server are rewritten; anything else (another
  // site, mailto:, sms:, tel:) is compared exactly as written.
  if (!/^https?:$/.test(u.protocol) || !origins.includes(u.origin)) return url;
  return `<origin>${u.pathname}${u.search}${u.hash}`;
}

// ---------------------------------------------------------------------------
// Motion

/** Board keyframes and view-transition rules missing from a stylesheet's source. */
export function missingMotionRules(css: string): string[] {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const missing: string[] = KEYFRAMES.filter(
    (name) => !new RegExp(`@keyframes ${name} ?\\{`).test(flat)
  ).map((name) => `@keyframes ${name}`);

  const required: Array<[string, RegExp]> = [
    [
      "::view-transition-old(root), ::view-transition-new(root) { animation: none; mix-blend-mode: normal }",
      /::view-transition-old\(root\), ?::view-transition-new\(root\) ?\{ ?animation: ?none; ?mix-blend-mode: ?normal;? ?\}/,
    ],
    [
      "::view-transition-new(root) { animation: theme-reveal 560ms ease-in-out }",
      /::view-transition-new\(root\) ?\{ ?animation: ?theme-reveal 560ms ease-in-out;? ?\}/,
    ],
    [
      "reduced motion: [data-motion] { animation: none !important }",
      /@media \(prefers-reduced-motion: ?reduce\) ?\{[^@]*\[data-motion\] ?\{ ?animation: ?none !important;? ?\}/,
    ],
    [
      "reduced motion: [data-fade] { transition: none !important }",
      /@media \(prefers-reduced-motion: ?reduce\) ?\{[^@]*\[data-fade\] ?\{ ?transition: ?none !important;? ?\}/,
    ],
    [
      "reduced motion: ::view-transition-new(root) without animation",
      /@media \(prefers-reduced-motion: ?reduce\) ?\{[^@]*::view-transition-new\((?:\*|root)\)[^{]*\{ ?animation: ?none/,
    ],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(flat)) {
      missing.push(label);
    }
  }
  return missing;
}

/** Removes one keyframes block, for the "a missing keyframe fails" control. */
export function withoutKeyframes(css: string, name: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  if (start < 0) {
    throw new Error(`@keyframes ${name} not found`);
  }
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) {
      return css.slice(0, start) + css.slice(i + 1);
    }
  }
  throw new Error(`@keyframes ${name} is not closed`);
}

// ---------------------------------------------------------------------------
// The doc's coverage

function sameHex(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

/**
 * Everything the doc must cover, against the inventory written from §2, the
 * boards and Scope. Returns what is missing or wrong; empty means covered.
 */
export function docGaps(markdown: string): string[] {
  const doc = parseDoc(markdown);
  const gaps: string[] = [];
  const has = (heading: string) => doc.headings.includes(heading);

  for (const section of SECTIONS) {
    if (!has(section)) gaps.push(`section "${section}"`);
  }

  const themed = (
    heading: string,
    expected: Record<string, readonly [string, string]>
  ) => {
    const rows = table(doc, heading);
    for (const [token, [light, dark]] of Object.entries(expected)) {
      const row = rows.find((r) => r.Token === token);
      if (!row) {
        gaps.push(`${heading}: ${token}`);
      } else if (!sameHex(row.Light, light) || !sameHex(row.Dark, dark)) {
        gaps.push(`${heading}: ${token} should be ${light} / ${dark}`);
      }
    }
  };
  themed("Root colour tokens", ROOT_TOKENS);
  themed("Status colours", STATUS_TOKENS);

  const aliases = table(doc, "Legacy aliases");
  for (const [alias, target] of Object.entries(LEGACY_ALIASES)) {
    const row = aliases.find((r) => r.Alias === alias);
    if (!row || row["Resolves to"] !== target) {
      gaps.push(`Legacy aliases: ${alias} -> ${target}`);
    }
  }

  const palettes = table(doc, "Product palettes");
  for (const [token, value] of Object.entries(FRAGMENT_TOKENS)) {
    const row = palettes.find((r) => r.Token === token);
    if (!row) {
      gaps.push(`Product palettes: ${token}`);
    } else if (!sameHex(row.Value, value)) {
      gaps.push(`Product palettes: ${token} should be ${value}`);
    }
  }

  const contexts = table(doc, "Context tokens");
  for (const { token, context, values } of CONTEXT_TOKENS) {
    const row = contexts.find(
      (r) => r.Token === token && r.Context === context
    );
    if (!row) {
      gaps.push(`Context tokens: ${token} in ${context}`);
    } else if (
      !sameHex(row.Light, values[0]) ||
      !sameHex(row.Dark, values[1])
    ) {
      gaps.push(
        `Context tokens: ${token} in ${context} should be ${values.join(" / ")}`
      );
    }
  }

  const pairings = table(doc, "Text pairings");
  for (const [fg, bg] of REQUIRED_PAIRINGS) {
    const row = pairings.find((r) => r.Text === fg && r.Surface === bg);
    if (!row || !row.Light || !row.Dark) {
      gaps.push(`Text pairings: ${fg} on ${bg}, both themes`);
    }
  }

  const scale = table(doc, "Type scale");
  for (const [role, size, tracking] of TYPE_SCALE) {
    const row = scale.find((r) => r.Role === role);
    if (!row || row["Size/line"] !== size || row.Tracking !== tracking) {
      gaps.push(`Type scale: ${role} ${size} ${tracking}`);
    }
  }

  const faces = table(doc, "Type");
  for (const face of FACES) {
    if (!faces.some((r) => r.Face === face)) gaps.push(`Type: face ${face}`);
  }

  const fallback = doc.sections.get("Font fallback") ?? "";
  for (const [step, phrase] of FONT_FALLBACK_STEPS) {
    const line = fallback
      .split("\n")
      .find((l) => l.trim().startsWith(`${step}.`));
    if (!line || !fallback.includes(phrase)) {
      gaps.push(`Font fallback: step ${step} (${phrase})`);
    }
  }

  const shape = table(doc, "Shape");
  for (const [element, radius] of SHAPE) {
    const row = shape.find((r) => r.Element === element);
    if (!row || row.Radius !== radius) {
      gaps.push(`Shape: ${element} ${radius}`);
    }
  }

  const flat = (text: string) => text.replace(/\s+/g, " ");
  const layout = flat(doc.sections.get("Layout") ?? "");
  for (const fact of LAYOUT) {
    if (!layout.includes(fact)) gaps.push(`Layout: ${fact}`);
  }

  const focus = doc.sections.get("Focus") ?? "";
  for (const fact of FOCUS) {
    if (!focus.includes(fact)) gaps.push(`Focus: ${fact}`);
  }

  const motion = table(doc, "Motion");
  for (const moment of MOTION_MOMENTS) {
    const row = motion.find((r) => r.Moment === moment);
    if (
      !row ||
      !row["Spec (from the boards)"] ||
      !row["Under reduced motion"]
    ) {
      gaps.push(`Motion: ${moment} with its fallback`);
    }
  }

  const keyframes = doc.sections.get("Keyframes") ?? "";
  for (const name of KEYFRAMES) {
    if (!keyframes.includes(`\`${name}\``)) gaps.push(`Keyframes: ${name}`);
  }
  if (!keyframes.includes("::view-transition-new(root)")) {
    gaps.push("Keyframes: the view-transition rules");
  }

  const colour = flat(doc.sections.get("Root colour tokens") ?? "");
  const [dotsLight, dotsDark] = DOTS_OPACITY;
  if (
    !colour.includes(
      `\`--dots-opacity\` is \`${dotsLight}\` in light and \`${dotsDark}\` in dark`
    )
  ) {
    gaps.push(`Root colour tokens: --dots-opacity ${dotsLight} / ${dotsDark}`);
  }

  for (const component of COMPONENTS) {
    const raw = doc.sections.get(component);
    if (raw === undefined) {
      gaps.push(`Components: ${component}`);
      continue;
    }
    const body = flat(raw);
    const { boards, details } = COMPONENT_DETAILS[component];
    // The citation is the paragraph that starts "Board:".
    const citation = /Board: ([\s\S]*?)(?:\n\s*\n|$)/.exec(raw)?.[1] ?? "";
    const cited = BOARD_IDS.filter((id) => citation.includes(`\`${id}\``));
    for (const id of boards) {
      if (!cited.includes(id)) {
        gaps.push(`Components: ${component} cites ${id}`);
      }
    }
    for (const id of cited) {
      if (!(boards as readonly string[]).includes(id)) {
        gaps.push(`Components: ${component} cites an unrelated board ${id}`);
      }
    }
    for (const detail of details) {
      if (!body.includes(detail)) {
        gaps.push(`Components: ${component} says "${detail}"`);
      }
    }
  }

  return gaps;
}

/** Removes the section under one heading, for the "an entry removed fails" control. */
export function withoutSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, "") === heading
  );
  if (start < 0) {
    throw new Error(`No section "${heading}"`);
  }
  const level = /^#+/.exec(lines[start])![0].length;
  let end = start + 1;
  while (end < lines.length) {
    const m = /^(#{1,6})\s/.exec(lines[end]);
    if (m && m[1].length <= level) break;
    end++;
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

/** Removes the table row for one token, for the same control. */
export function withoutRow(markdown: string, firstCell: string): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((l) =>
    new RegExp(
      `^\\|\\s*\`${firstCell.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&")}\`\\s*\\|`
    ).test(l)
  );
  if (index < 0) {
    throw new Error(`No row for ${firstCell}`);
  }
  return [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n");
}

// ---------------------------------------------------------------------------
// Fonts

/** The options object passed to one next/font call in lib/fonts.ts. */
export function fontOptions(source: string, exportName: string): string {
  const match = new RegExp(
    `export const ${exportName} = [A-Za-z_]+\\(\\{([\\s\\S]*?)\\}\\);`
  ).exec(source);
  if (!match) {
    throw new Error(`lib/fonts.ts has no export ${exportName}`);
  }
  return match[1];
}

/** A string or string-array option, read from the options source. */
export function optionValue(
  options: string,
  key: string
): string | string[] | boolean | undefined {
  const m = new RegExp(`\\b${key}:\\s*(\\[[^\\]]*\\]|[^,\\n]+)`).exec(options);
  if (!m) return undefined;
  const raw = m[1].trim().replace(/,$/, "");
  if (raw === "true" || raw === "false") return raw === "true";
  if (raw.startsWith("[")) {
    return Array.from(raw.matchAll(/["']([^"']+)["']/g), (x) => x[1]);
  }
  return raw.replace(/^["']|["']$/g, "");
}

export interface FontDeviation {
  face: string;
  gate: string;
  bytes: number;
  accepted: boolean;
}

/** Fragment-font deviations recorded under fallback step 4. */
export function fragmentFontDeviations(markdown: string): FontDeviation[] {
  const doc = parseDoc(markdown);
  const heading = doc.headings.find((h) => /fragment-font deviations/i.test(h));
  if (!heading) return [];
  return table(doc, heading).map((r) => ({
    face: r.Face,
    gate: r["Failed gate"] ?? "",
    bytes: Number(
      /([\d,]+) bytes/.exec(r["Measured cost"] ?? "")?.[1].replace(/,/g, "") ??
        NaN
    ),
    accepted: /^accepted\b/i.test(r["Owner acceptance"] ?? ""),
  }));
}

/**
 * Fragment faces over the per-face budget (40 KiB) with no owner-accepted
 * deviation that names the 40 KiB gate and covers the measured bytes.
 */
export function fontBudgetProblems(
  bytesByFace: Record<string, number>,
  deviations: readonly FontDeviation[],
  cap = 40 * 1024
): string[] {
  const problems: string[] = [];
  for (const [face, bytes] of Object.entries(bytesByFace)) {
    if (bytes <= cap) continue;
    const d = deviations.find((x) => x.face === face);
    if (!d || !/40 KiB/.test(d.gate) || !(d.bytes >= bytes) || !d.accepted) {
      problems.push(`${face}: ${bytes} bytes, over 40 KiB`);
    }
  }
  return problems;
}
