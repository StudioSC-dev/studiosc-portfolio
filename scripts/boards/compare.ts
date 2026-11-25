/**
 * The fidelity comparison: a site capture against a board reference, with
 * the tolerances of PRV-22 and the accepted deviations. Every failure names
 * the section, state, width, theme, property, expected and actual value.
 */
import type {
  Capture,
  Deviation,
  KeyMeasure,
  Motion,
  Row,
  RowMeasure,
} from "./model";

export const TOLERANCE = {
  sectionX: 2,
  sectionWidth: 2,
  sectionHeight: 4,
  key: 2,
  gap: 2,
  lineHeight: 0.5,
  tracking: 0.005,
  duration: 0.25,
} as const;

/** Float noise: a value exactly at a limit is within it. */
const EPS = 1e-6;
const within = (a: number, b: number, tol: number) =>
  Math.abs(a - b) <= tol + EPS;

export interface Failure {
  section: string;
  state: string;
  width: string;
  theme: string;
  property: string;
  expected: string | number;
  actual: string | number;
}

export const describe = (f: Failure) =>
  `${f.section} [${f.state}, ${f.width}, ${f.theme}] ${f.property}: expected ${f.expected}, got ${f.actual}`;

export interface Where {
  state: string;
  width: string;
  theme: string;
}

const matchesWhere = (d: Deviation, section: string, w: Where) =>
  d.section.includes(section) &&
  d.state.includes(w.state) &&
  d.width.includes(w.width) &&
  d.theme.includes(w.theme);

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The board's row with the copy and key deviations applied: a copy entry
 * replaces its board text with the built text; a key entry whose built value
 * is `absent` drops that key, and the keys after it in its category move up.
 */
export function applyToReference(
  ref: RowMeasure,
  section: string,
  where: Where,
  deviations: Deviation[]
): RowMeasure {
  let copy = ref.copy;
  let keys = ref.keys;
  for (const d of deviations) {
    if (!matchesWhere(d, section, where)) continue;
    if (d.property === "copy" && d.board && copy.includes(d.board))
      copy = norm(copy.split(d.board).join(d.built));
    const m = /^key (\S+)$/.exec(d.property);
    if (m && d.built === "absent") {
      const hit = keys.find((k) => k.key === m[1] && k.label === d.board);
      if (hit) keys = keys.filter((k) => k !== hit);
    }
  }
  if (keys !== ref.keys) {
    const count: Record<string, number> = {};
    keys = keys.map((k) => {
      const cat = k.key.split(":")[0];
      const i = (count[cat] = (count[cat] ?? -1) + 1);
      return { ...k, key: `${cat}:${i}` };
    });
  }
  return { ...ref, copy, keys };
}

/** Drops each failure an active deviation names exactly. */
export function suppress(
  failures: Failure[],
  deviations: Deviation[]
): Failure[] {
  return failures.filter(
    (f) =>
      !deviations.some(
        (d) =>
          matchesWhere(d, f.section, f) &&
          d.property === f.property &&
          d.board === String(f.expected) &&
          d.built === String(f.actual)
      )
  );
}

function compareKey(
  push: (
    property: string,
    expected: string | number,
    actual: string | number
  ) => void,
  b: KeyMeasure,
  s: KeyMeasure
) {
  const k = `key ${b.key}`;
  const axes = ["x", "y", "width", "height"] as const;
  axes.forEach((axis, i) => {
    if (!within(b.box[i], s.box[i], TOLERANCE.key))
      push(`${k} ${axis}`, b.box[i], s.box[i]);
  });
  if (b.color !== s.color) push(`${k} color`, b.color, s.color);
  if (b.background !== s.background)
    push(`${k} background`, b.background, s.background);
  if (b.border !== s.border) push(`${k} border`, b.border, s.border);
  if (b.ratio !== undefined) {
    // The frame's own shape, on its own: within a pixel's rounding of the
    // board's ratio, however the box moves inside its tolerance.
    const [, , w, h] = b.box;
    const allow = b.ratio / Math.max(1, Math.min(w, h));
    if (s.ratio === undefined || !within(b.ratio, s.ratio, allow))
      push(`${k} aspect ratio`, b.ratio, s.ratio ?? "none");
    if (b.radius !== s.radius) push(`${k} radius`, b.radius, s.radius);
  }
  if (b.type && s.type) {
    const t = b.type;
    const u = s.type;
    if (t.family !== u.family) push(`${k} font-family`, t.family, u.family);
    if (t.size !== u.size) push(`${k} font-size`, t.size, u.size);
    if (
      t.lineHeight === "normal" || u.lineHeight === "normal"
        ? t.lineHeight !== u.lineHeight
        : !within(t.lineHeight, u.lineHeight, TOLERANCE.lineHeight)
    )
      push(`${k} line-height`, t.lineHeight, u.lineHeight);
    if (!within(t.tracking, u.tracking, TOLERANCE.tracking))
      push(`${k} letter-spacing`, `${t.tracking}em`, `${u.tracking}em`);
    if (t.weight !== u.weight) push(`${k} font-weight`, t.weight, u.weight);
  }
}

/** Every visual check of one row in one state. */
export function compareRow(
  section: string,
  where: Where,
  ref: RowMeasure | null,
  site: RowMeasure | null
): Failure[] {
  const out: Failure[] = [];
  const push = (
    property: string,
    expected: string | number,
    actual: string | number
  ) => out.push({ section, ...where, property, expected, actual });
  if (!ref) {
    if (site) push("drawn", "not drawn in this state", "visible");
    return out;
  }
  if (!site) {
    push("drawn", "visible", "missing");
    return out;
  }
  if (!within(ref.box[0], site.box[0], TOLERANCE.sectionX))
    push("box x", ref.box[0], site.box[0]);
  if (!within(ref.box[2], site.box[2], TOLERANCE.sectionWidth))
    push("box width", ref.box[2], site.box[2]);
  if (!within(ref.box[3], site.box[3], TOLERANCE.sectionHeight))
    push("box height", ref.box[3], site.box[3]);
  if (ref.copy !== site.copy)
    push("copy", JSON.stringify(ref.copy), JSON.stringify(site.copy));

  const siteKeys = new Map(site.keys.map((k) => [k.key, k]));
  for (const b of ref.keys) {
    const s = siteKeys.get(b.key);
    if (!s) push(`key ${b.key}`, b.label || "present", "missing");
    else compareKey(push, b, s);
  }
  const refKeys = new Set(ref.keys.map((k) => k.key));
  for (const s of site.keys)
    if (!refKeys.has(s.key)) push(`key ${s.key}`, "none", s.label || "present");

  // Vertical gaps between each key element and the next, in board order.
  const ordered = [...ref.keys].sort(
    (a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]
  );
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const sa = siteKeys.get(a.key);
    const sb = siteKeys.get(b.key);
    if (!sa || !sb) continue;
    const g = b.box[1] - (a.box[1] + a.box[3]);
    const h = sb.box[1] - (sa.box[1] + sa.box[3]);
    if (!within(g, h, TOLERANCE.gap))
      push(`gap ${a.key} to ${b.key}`, round(g), round(h));
  }

  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Section order and the gaps between sections. `boardOrder` is every row
 * the board draws, in board order; only built rows are compared, and a gap
 * only between two built rows that are adjacent on the board.
 */
export function compareLayout(
  where: Where,
  boardOrder: string[],
  built: Set<string>,
  ref: Capture,
  site: Capture
): Failure[] {
  const out: Failure[] = [];
  const rows = boardOrder.filter(
    (id) => built.has(id) && site.rows[id] && ref.rows[id]
  );
  const siteOrder = [...rows].sort(
    (a, b) => site.rows[a]!.order - site.rows[b]!.order
  );
  if (rows.join() !== siteOrder.join()) {
    const at = rows.findIndex((id, i) => siteOrder[i] !== id);
    out.push({
      section: rows[at],
      ...where,
      property: "order",
      expected: rows.join(", "),
      actual: siteOrder.join(", "),
    });
  }
  for (let i = 0; i + 1 < boardOrder.length; i++) {
    const a = boardOrder[i];
    const b = boardOrder[i + 1];
    if (!built.has(a) || !built.has(b)) continue;
    const [ra, rb, sa, sb] = [
      ref.rows[a],
      ref.rows[b],
      site.rows[a],
      site.rows[b],
    ];
    if (!ra || !rb || !sa || !sb) continue;
    const g = rb.box[1] - (ra.box[1] + ra.box[3]);
    const h = sb.box[1] - (sa.box[1] + sa.box[3]);
    if (!within(g, h, TOLERANCE.gap))
      out.push({
        section: b,
        ...where,
        property: `gap after ${a}`,
        expected: round(g),
        actual: round(h),
      });
  }
  return out;
}

const motionKey = (m: Motion) => `${m.key}|${m.direction}`;

/** The board's motions for a row against the site's, as visible results. */
export function compareMotion(
  section: string,
  where: Where,
  ref: Motion[],
  site: Motion[]
): Failure[] {
  const out: Failure[] = [];
  const push = (
    property: string,
    expected: string | number,
    actual: string | number
  ) => out.push({ section, ...where, property, expected, actual });
  const left = [...site];
  const unmatched: Motion[] = [];
  for (const b of [...ref].sort((x, y) =>
    motionKey(x).localeCompare(motionKey(y))
  )) {
    const i = left.findIndex((s) => motionKey(s) === motionKey(b));
    if (i < 0) {
      unmatched.push(b);
      continue;
    }
    const [s] = left.splice(i, 1);
    if (
      b.duration > 0 &&
      !within(b.duration, s.duration, TOLERANCE.duration * b.duration)
    )
      push(
        `motion ${b.key} ${b.direction} duration`,
        `${b.duration}ms`,
        `${s.duration}ms`
      );
  }
  for (const b of unmatched) {
    const i = left.findIndex((s) => s.key === b.key);
    if (i >= 0) {
      const [s] = left.splice(i, 1);
      push(
        `motion ${b.key} direction`,
        `${b.name} ${b.direction}`,
        `${s.name} ${s.direction}`
      );
    } else {
      push(
        `motion ${b.key} ${b.name}`,
        `${b.direction} ${b.duration}ms`,
        "does not run"
      );
    }
  }
  for (const s of left)
    push(
      `motion ${s.key} ${s.name}`,
      "no motion",
      `${s.direction} ${s.duration}ms`
    );
  return out;
}

/**
 * Under reduced motion no animation may run at all, from load through every
 * step: each one is named on its own row, or on `owner` when it ran outside
 * every built row.
 */
export function compareReducedMotion(
  owner: string,
  where: Where,
  site: Motion[]
): Failure[] {
  return site.map((m) => ({
    section: m.row ?? owner,
    ...where,
    property: "reduced motion",
    expected: "no animation",
    actual: `${m.name} on ${m.row ? m.key : "the page"}`,
  }));
}

/** The board's motions that belong to a row. */
export const rowMotion = (motion: Motion[], row: Row) =>
  motion.filter((m) => m.row === row.id || (row.pageMotion && m.row === null));

const list = (v: (string | number)[]) =>
  v.length ? v.map(String).join(", ") : "nothing";
const quote = (s: string) =>
  JSON.stringify(s.length > 60 ? `${s.slice(0, 57)}...` : s);

/**
 * A control's visible result, against the state it starts from: whatever
 * its step changes on the board (the copy, the picture in view, the slide in
 * view, a strip's scroll and its direction, the pressed control) must change
 * on the site too, and a strip must scroll the same way.
 */
export function compareControl(
  section: string,
  where: Where,
  control: string,
  board: [RowMeasure | null | undefined, RowMeasure | null | undefined],
  site: [RowMeasure | null | undefined, RowMeasure | null | undefined]
): Failure[] {
  const out: Failure[] = [];
  const [b0, b1] = board;
  const [s0, s1] = site;
  if (!b0 || !b1) return out;
  const push = (property: string, expected: string, actual: string) =>
    out.push({ section, ...where, property, expected, actual });
  if (!s0 || !s1) {
    push("control", `${control} changes the section`, "the section is missing");
    return out;
  }
  if (b0.copy !== b1.copy && s0.copy === s1.copy)
    push(
      "control copy",
      `${control} changes the text`,
      `the text stays ${quote(s1.copy)}`
    );
  const aspects = [
    ["photos", "photo", "shows another photo"],
    ["slides", "plate", "shows another plate"],
    ["pressed", "pressed", "presses another control"],
  ] as const;
  for (const [key, name, does] of aspects) {
    const before = b0.shows[key];
    const after = b1.shows[key];
    if (before.join("|") === after.join("|")) continue;
    if (s0.shows[key].join("|") === s1.shows[key].join("|"))
      push(
        `control ${name}`,
        `${control} ${does} (board: ${list(before)} to ${list(after)})`,
        `it stays ${list(s1.shows[key])}`
      );
  }
  const moved = (a: number[], b: number[]) =>
    Math.sign(b.reduce((t, v) => t + v, 0) - a.reduce((t, v) => t + v, 0));
  const way = moved(b0.shows.scroll, b1.shows.scroll);
  if (way) {
    const siteWay = moved(s0.shows.scroll, s1.shows.scroll);
    const say = (n: number) =>
      n > 0 ? "scrolls forward" : n < 0 ? "scrolls back" : "does not scroll";
    if (siteWay !== way)
      push(
        "control scroll",
        `${control} ${say(way)} (board: ${list(b0.shows.scroll)} to ${list(b1.shows.scroll)})`,
        `it ${say(siteWay)} (${list(s0.shows.scroll)} to ${list(s1.shows.scroll)})`
      );
  }
  return out;
}
