/**
 * The board reference model: the files under docs/boards/ (or a fixture
 * canvas laid out the same way), their types, and the checks that bind them
 * together. Nothing here needs a browser.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const WIDTHS = ["1440", "390"] as const;
export type Width = (typeof WIDTHS)[number];
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** An accessible control, found the same way on a board and on the site. */
export interface Target {
  role: string;
  name: string;
}

/** One step towards a state. */
export interface Step {
  click?: Target;
  fill?: { target: Target; value: string };
  press?: string;
  /** Site only: answer requests to `url` (a glob) with this status. */
  mock?: { url: string; status: number; body?: string };
}

export interface StateDef {
  /** Steps for both the board and the site. */
  steps?: Step[];
  /** Board-only steps, replacing `steps` on the board. */
  board?: Step[];
  /** Site-only steps, replacing `steps` on the site. */
  site?: Step[];
  /** Captured mid-animation: only its motion and a shot are kept. */
  inFlight?: boolean;
  /** The step is the theme toggle, whichever theme the page is in. */
  toggleTheme?: boolean;
  /** Checked only once this ticket is in merged.json. */
  ticket?: string;
  /** The widths whose boards draw the control; all when absent. */
  widths?: Width[];
  /**
   * The state this one's last step starts from ("default" when absent): a
   * control's result is checked against it, so a back action must undo the
   * step before it.
   */
  from?: string;
}

/** Where a row's reference comes from at one width and theme. */
export interface Source {
  board: string;
  /** "drawn": the board is drawn in this theme; "toggle": its theme toggle. */
  theme: "drawn" | "toggle";
}

/** Elements a later ticket adds: hidden on the board until it merges. */
export interface Later {
  ticket: string;
  hide: { selector: string; mode?: "hide" | "remove" }[];
}

/** A link a row draws, which must open its view on the site. */
export interface ViewLink {
  /** CSS selector, the same on the board and the site. */
  selector: string;
  to: string;
}

export interface Row {
  id: string;
  section: string;
  route: string;
  ticket: string;
  built: boolean;
  /** CSS selector on the board. */
  board: string;
  /** CSS selector on the site. */
  site: string;
  parent?: string;
  sources: Record<Width, { light: Source; dark: Source } | null>;
  states: string[];
  later?: Later[];
  links?: ViewLink[];
  /** Named key elements with their own selectors (the range's peeks). */
  keys?: Record<string, { board: string; site: string }>;
  /** The row also owns motion outside every row (the theme reveal). */
  pageMotion?: boolean;
  /**
   * The evidence for an undrawn width: the board at that width that was
   * rendered and does not draw the row. Regen measures the row there.
   */
  undrawn?: Partial<Record<Width, string>>;
}

/** Where the colour tokens are read: the board's wrapper and the site's scope. */
export interface TokenScope {
  /** The board element that defines the palette (the runtime's page wrapper). */
  board: string;
  /** The site element whose tokens stand for it (PRV-2: `:root`). */
  site: string;
  /** The tokens compared; a board that does not define one leaves it out. */
  names: string[];
}

export interface Sections {
  version: number;
  clock: string;
  timezone: string;
  viewports: Record<Width, { width: number; height: number }>;
  /** Steps that leave each theme, on the board and the site alike. */
  theme: Record<Theme, Step[]>;
  /** Key-element categories, in priority order. */
  keys: Record<string, string>;
  states: Record<string, StateDef>;
  tokens: TokenScope;
  rows: Row[];
}

export interface Pin {
  sha256: string;
}

export interface Manifest {
  version: number;
  /** The canvas runtime (`support.js`): never committed, only pinned. */
  runtime: { sha256: string; url: string | null; source: string };
  boards: Record<string, Pin & { width: Width; theme: Theme }>;
  fonts: Record<string, Pin>;
  images: Record<string, Pin>;
  /** The stylesheet a board's Google Fonts link is answered with. */
  fontCss: string;
}

/** A key element as measured. */
export interface KeyMeasure {
  key: string;
  label: string;
  box: [number, number, number, number];
  color: string;
  background: string;
  border: string;
  radius: string;
  ratio?: number;
  /** Change detection only: never compared with the board. */
  src?: string;
  aria?: string;
  type?: {
    family: string;
    size: number;
    lineHeight: number | "normal";
    tracking: number;
    weight: number;
  };
}

/** What a control can change in a row, for the controls check. */
export interface RowShows {
  /** The pictures in view (file names). */
  photos: string[];
  /** The slides in view (their labels). */
  slides: string[];
  /** The horizontal scroll position of each scrolling strip. */
  scroll: number[];
  /** The pressed, selected or current controls (their labels). */
  pressed: string[];
}

export interface RowMeasure {
  box: [number, number, number, number];
  copy: string;
  keys: KeyMeasure[];
  /** The row's place in rendered order (top, then left) among the rows measured. */
  order: number;
  shows: RowShows;
  shot?: string;
  /** The sha256 of the shot file, so a replaced shot is caught. */
  shotSha?: string;
}

export interface Motion {
  row: string | null;
  key: string;
  name: string;
  duration: number;
  direction: string;
}

/** Everything one state of one page measures. */
export interface Capture {
  tokens: Record<string, string>;
  motion: Motion[];
  rows: Record<string, RowMeasure | null>;
}

export interface BoardRef {
  board: string;
  runtime: string;
  fonts: Record<string, string>;
  /** The photos this board loaded while rendering, with their sha256s. */
  images: Record<string, string>;
  width: Width;
  captures: Record<string, Capture>;
}

export interface SpecFile {
  version: number;
  boards: Record<string, BoardRef>;
}

export interface Deviation {
  id: string;
  section: string[];
  state: string[];
  width: string[];
  theme: string[];
  property: string;
  board: string;
  built: string;
  from: string;
  accepted: string;
  expires: string | null;
}

export const sha256 = (buf: Buffer | string) =>
  createHash("sha256").update(buf).digest("hex");

export const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, "utf8")) as T;

/**
 * Stable JSON: keys sorted at every level, a newline at the end. Objects
 * and arrays down to `prettyDepth` are indented by two spaces; deeper ones
 * are written on one line.
 */
export function stableJson(value: unknown, prettyDepth = Infinity): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  const render = (v: unknown, depth: number): string => {
    if (depth >= prettyDepth || v === null || typeof v !== "object")
      return JSON.stringify(v);
    const pad = "  ".repeat(depth);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return `[\n${v.map((x) => `${pad}  ${render(x, depth + 1)}`).join(",\n")}\n${pad}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return "{}";
    return `{\n${entries
      .map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${render(x, depth + 1)}`)
      .join(",\n")}\n${pad}}`;
  };
  return `${render(sort(value), 0)}\n`;
}

/**
 * spec.json on disk: each board keeps one table of measured values, and its
 * captures point into it by hash, since most rows and most of their key
 * elements look the same in most states. A row's keys point into the same
 * table. Captures sit one per line.
 */
interface PackedCapture {
  tokens: string;
  motion: Motion[];
  rows: Record<string, string | null>;
}
interface PackedBoard extends Omit<BoardRef, "captures"> {
  table: Record<string, unknown>;
  captures: Record<string, PackedCapture>;
}

export function packSpec(spec: SpecFile): string {
  const boards: Record<string, PackedBoard> = {};
  for (const [name, ref] of Object.entries(spec.boards)) {
    const table: Record<string, unknown> = {};
    const put = (v: unknown) => {
      const h = sha256(stableJson(v, 0)).slice(0, 16);
      table[h] = v;
      return h;
    };
    const captures: Record<string, PackedCapture> = {};
    for (const [key, c] of Object.entries(ref.captures)) {
      captures[key] = {
        tokens: put(c.tokens),
        motion: c.motion,
        rows: Object.fromEntries(
          Object.entries(c.rows).map(([id, r]) => [
            id,
            r ? put({ ...r, keys: r.keys.map(put) }) : null,
          ])
        ),
      };
    }
    boards[name] = { ...ref, table, captures };
  }
  return stableJson({ version: spec.version, boards }, 4);
}

export function unpackSpec(text: string): SpecFile {
  const raw = JSON.parse(text) as {
    version: number;
    boards: Record<string, PackedBoard>;
  };
  const boards: Record<string, BoardRef> = {};
  for (const [name, packed] of Object.entries(raw.boards)) {
    const { table, captures, ...rest } = packed;
    const get = <T>(h: string) => {
      if (!(h in table))
        throw new Error(`spec.json: ${name} has no table entry ${h}`);
      return structuredClone(table[h]) as T;
    };
    boards[name] = {
      ...rest,
      captures: Object.fromEntries(
        Object.entries(captures).map(([key, c]) => [
          key,
          {
            tokens: get<Record<string, string>>(c.tokens),
            motion: c.motion,
            rows: Object.fromEntries(
              Object.entries(c.rows).map(([id, h]) => {
                if (!h) return [id, null];
                const row = get<Omit<RowMeasure, "keys"> & { keys: string[] }>(
                  h
                );
                return [
                  id,
                  { ...row, keys: row.keys.map((k) => get<KeyMeasure>(k)) },
                ];
              })
            ),
          },
        ])
      ),
    };
  }
  return { version: raw.version, boards };
}

export const readSpec = (file: string) =>
  unpackSpec(readFileSync(file, "utf8"));

export interface BoardsDir {
  dir: string;
  sections: Sections;
  manifest: Manifest;
  spec: SpecFile;
  deviations: Deviation[];
  merged: string[];
}

export function loadBoards(dir: string): BoardsDir {
  return {
    dir,
    sections: readJson<Sections>(path.join(dir, "sections.json")),
    manifest: readJson<Manifest>(path.join(dir, "manifest.json")),
    spec: readSpec(path.join(dir, "spec.json")),
    deviations: parseDeviations(
      readFileSync(path.join(dir, "deviations.md"), "utf8")
    ),
    merged: readJson<string[]>(path.join(dir, "merged.json")),
  };
}

const list = (cell: string) =>
  cell
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const unquote = (cell: string) => {
  const t = cell.trim();
  const m = /^`(.*)`$/.exec(t);
  return (m ? m[1] : t).replace(/\\\|/g, "|");
};

/**
 * The register's table rows. Columns: id, section, state, width, theme,
 * property, board, built, from, accepted, expires. Values sit in backticks;
 * an empty built value is ``. section, state, width and theme may list
 * several exact values, comma separated.
 */
export function parseDeviations(markdown: string): Deviation[] {
  const out: Deviation[] = [];
  let header: string[] | null = null;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      header = null;
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    if (!header) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const get = (name: string) => {
      const i = header!.indexOf(name);
      if (i < 0) throw new Error(`deviations.md: no "${name}" column`);
      return cells[i] ?? "";
    };
    const expires = unquote(get("expires"));
    const id = unquote(get("id"));
    if (out.some((d) => d.id === id))
      throw new Error(`deviations.md: duplicate id ${id}`);
    out.push({
      id,
      section: list(unquote(get("section"))),
      state: list(unquote(get("state"))),
      width: list(unquote(get("width"))),
      theme: list(unquote(get("theme"))),
      property: unquote(get("property")),
      board: unquote(get("board")),
      built: unquote(get("built")),
      from: unquote(get("from")),
      accepted: unquote(get("accepted")),
      expires: /^(-|—|none|)$/i.test(expires) ? null : expires,
    });
  }
  return out;
}

/**
 * An owner's acceptance reads exactly `owner, YYYY-MM-DD`, a real date:
 * anything else (a rejection, a question, a note naming the owner) is not one.
 */
export function isAccepted(d: Deviation): boolean {
  const m = /^owner, (\d{4})-(\d{2})-(\d{2})$/.exec(d.accepted.trim());
  if (!m) return false;
  const [y, mo, day] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, day));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === day
  );
}

/** The deviations that suppress mismatches today. */
export const activeDeviations = (all: Deviation[], merged: string[]) =>
  all.filter(
    (d) => isAccepted(d) && !(d.expires && merged.includes(d.expires))
  );

/** Every file under `dir`, relative, with forward slashes. */
export function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory()
        ? walk(p, base)
        : [path.relative(base, p).split(path.sep).join("/")];
    })
    .sort();
}

/** The reference file a row's shot is kept in. */
export const refPath = (
  board: string,
  rowId: string,
  state: string,
  width: string,
  theme: string
) =>
  `ref/${board.replace(/\.dc\.html$/, "")}/${rowId.replace(/\//g, ".")}-${state}-${width}-${theme}.webp`;

/** The capture key of a state: `<theme>/<state>`. */
export const captureKey = (theme: Theme, state: string) => `${theme}/${state}`;

/** A state name, its reduced-motion and partial-build forms. */
export const stateName = (
  state: string,
  opts: { rm?: boolean; pending?: string[] } = {}
) =>
  `${state}${opts.pending?.length ? `+pre-${[...opts.pending].sort().join("+")}` : ""}${
    opts.rm ? "-rm" : ""
  }`;

/**
 * The problems that make a boards directory unusable: a pinned input whose
 * bytes differ from the manifest, a reference made from other inputs, a
 * reference file missing or left over. Each names the file.
 */
export function pinProblems(dir: string, expected?: string[]): string[] {
  const problems: string[] = [];
  const files = walk(dir);
  if (expected) {
    const top = [
      ...new Set(
        files.map((f) => (f.includes("/") ? `${f.split("/")[0]}/` : f))
      ),
    ].sort();
    const want = [...expected].sort();
    for (const f of top)
      if (!want.includes(f)) problems.push(`${f}: not part of the board set`);
    for (const f of want)
      if (!top.includes(f)) problems.push(`${f}: missing from the board set`);
  }
  const manifest = readJson<Manifest>(path.join(dir, "manifest.json"));
  const spec = readSpec(path.join(dir, "spec.json"));
  const check = (rel: string, want: string) => {
    const p = path.join(dir, rel);
    if (!existsSync(p)) return problems.push(`${rel}: pinned but missing`);
    const got = sha256(readFileSync(p));
    if (got !== want)
      problems.push(
        `${rel}: sha256 ${got} differs from the manifest's ${want}`
      );
  };
  for (const [f, pin] of Object.entries(manifest.boards)) check(f, pin.sha256);
  for (const [f, pin] of Object.entries(manifest.fonts))
    check(`fonts/${f}`, pin.sha256);
  for (const [f, pin] of Object.entries(manifest.images))
    check(`img/${f}`, pin.sha256);
  check(
    `fonts/${manifest.fontCss}`,
    manifest.fonts[manifest.fontCss]?.sha256 ?? ""
  );
  const pinned = new Set([
    ...Object.keys(manifest.boards),
    ...Object.keys(manifest.fonts).map((f) => `fonts/${f}`),
    ...Object.keys(manifest.images).map((f) => `img/${f}`),
  ]);
  for (const f of files) {
    if (/\.dc\.html$/.test(f) && !pinned.has(f))
      problems.push(`${f}: board not pinned`);
    if (/^(fonts|img)\//.test(f) && !pinned.has(f) && !/^fonts\/OFL-/.test(f))
      problems.push(`${f}: not pinned`);
  }

  const referenced = new Set<string>();
  for (const [board, ref] of Object.entries(spec.boards)) {
    const pin = manifest.boards[board];
    if (!pin) {
      problems.push(`spec.json: references for ${board}, which is not pinned`);
      continue;
    }
    if (ref.board !== pin.sha256)
      problems.push(
        `spec.json: ${board} references were made from board sha256 ${ref.board}, the manifest pins ${pin.sha256}`
      );
    if (ref.runtime !== manifest.runtime.sha256)
      problems.push(
        `spec.json: ${board} references were made from runtime sha256 ${ref.runtime}, the manifest pins ${manifest.runtime.sha256}`
      );
    const fontPins = Object.fromEntries(
      Object.entries(manifest.fonts).map(([f, p]) => [f, p.sha256])
    );
    if (stableJson(ref.fonts) !== stableJson(fontPins))
      problems.push(
        `spec.json: ${board} references were made from other font sha256s`
      );
    // Only the photos this board loads: another photo's change leaves it be.
    for (const [f, sha] of Object.entries(ref.images)) {
      const want = manifest.images[f]?.sha256;
      if (!want)
        problems.push(
          `spec.json: ${board} references were made from photo ${f}, which is not pinned`
        );
      else if (sha !== want)
        problems.push(
          `spec.json: ${board} references were made from other image sha256s (${f})`
        );
    }
    const shots = new Map<string, string>();
    for (const capture of Object.values(ref.captures)) {
      for (const row of Object.values(capture.rows)) {
        if (!row?.shot) continue;
        referenced.add(row.shot);
        if (!row.shotSha) {
          problems.push(`${row.shot}: spec.json records no sha256 for it`);
          continue;
        }
        shots.set(row.shot, row.shotSha);
      }
    }
    for (const [shot, want] of shots) {
      const p = path.join(dir, shot);
      if (!existsSync(p)) {
        problems.push(`${shot}: referenced by spec.json but missing`);
        continue;
      }
      const got = sha256(readFileSync(p));
      if (got !== want)
        problems.push(
          `${shot}: sha256 ${got} differs from the ${want} spec.json recorded`
        );
    }
  }
  for (const board of Object.keys(manifest.boards))
    if (!spec.boards[board])
      problems.push(`spec.json: no references for ${board}`);
  for (const f of files.filter((f) => f.startsWith("ref/")))
    if (!referenced.has(f)) problems.push(`${f}: not referenced by spec.json`);
  return problems;
}

/** Tracked files whose bytes are the pinned canvas runtime. */
export function runtimeCopies(
  files: { path: string; content: Buffer }[],
  runtimeSha: string
): string[] {
  return files
    .filter((f) => sha256(f.content) === runtimeSha)
    .map((f) => f.path);
}

export interface SectionCheck {
  problems: string[];
  /** Rows and widths no board draws: skipped, listed for QA. */
  undrawn: string[];
}

/**
 * Every row names its ticket, route, board and site selectors, and a source
 * board per drawn width and theme. Every dark reference comes from a
 * rendered board state: a board drawn dark, or a light board's toggle.
 */
export function checkSections(boards: BoardsDir): SectionCheck {
  const { sections, manifest, spec } = boards;
  const problems: string[] = [];
  const undrawn: string[] = [];
  const ids = new Set<string>();
  for (const row of sections.rows) {
    const at = `sections.json ${row.id}`;
    if (ids.has(row.id)) problems.push(`${at}: duplicate row`);
    ids.add(row.id);
    if (!/^PRV-\d+$/.test(row.ticket))
      problems.push(`${at}: no building ticket`);
    if (!row.route?.startsWith("/")) problems.push(`${at}: no route`);
    if (typeof row.built !== "boolean") problems.push(`${at}: no built flag`);
    if (!row.board || !row.site)
      problems.push(`${at}: no board or site selector`);
    if (!row.states?.length) problems.push(`${at}: no states`);
    for (const s of row.states ?? [])
      if (s !== "default" && !sections.states[s])
        problems.push(`${at}: unknown state ${s}`);
    if (row.parent && !sections.rows.some((r) => r.id === row.parent))
      problems.push(`${at}: unknown parent ${row.parent}`);
    for (const width of WIDTHS) {
      if (!(width in (row.sources ?? {}))) {
        problems.push(`${at}: no source entry at ${width}`);
        continue;
      }
      const src = row.sources[width];
      if (src === null) {
        // Skipped only on evidence: a board at this width, rendered, that
        // does not draw the row.
        const board = row.undrawn?.[width];
        const capture = board
          ? spec.boards[board]?.captures[captureKey("light", "default")]
          : undefined;
        if (!board)
          problems.push(
            `${at}: ${width} is marked undrawn but names no board that leaves it out`
          );
        else if (manifest.boards[board]?.width !== width)
          problems.push(
            `${at}: ${board}, the undrawn evidence at ${width}, is not a pinned ${width} board`
          );
        else if (
          !sections.rows.some(
            (r) =>
              r.route === row.route &&
              THEMES.some((t) => r.sources[width]?.[t]?.board === board)
          )
        )
          // Only the board that draws the row's own page can show it left
          // out: any other board measures it as absent.
          problems.push(
            `${at}: ${board}, the undrawn evidence at ${width}, does not draw ${row.route}`
          );
        else if (!capture || !(row.id in capture.rows))
          problems.push(
            `${at}: ${board} light/default never measured this row; run boards:regen`
          );
        else if (capture.rows[row.id])
          problems.push(
            `${at}: ${board} draws this row at ${width}, so it cannot be skipped`
          );
        else undrawn.push(`${row.id} at ${width}`);
        continue;
      }
      for (const theme of THEMES) {
        const s = src[theme];
        if (!s?.board) {
          problems.push(`${at}: ${width} ${theme} is drawn but names no board`);
          continue;
        }
        const pin = manifest.boards[s.board];
        if (!pin) {
          problems.push(
            `${at}: ${width} ${theme} board ${s.board} is not pinned`
          );
          continue;
        }
        if (pin.width !== width)
          problems.push(
            `${at}: ${s.board} is drawn at ${pin.width}, not ${width}`
          );
        if (s.theme === "drawn" && pin.theme !== theme)
          problems.push(
            `${at}: ${s.board} is drawn ${pin.theme}, not ${theme}`
          );
        if (s.theme === "toggle" && pin.theme === theme)
          problems.push(
            `${at}: ${s.board} is already ${theme}; nothing to toggle`
          );
        for (const state of row.states ?? []) {
          const def = sections.states[state];
          if (def?.widths && !def.widths.includes(width)) continue;
          const key = captureKey(theme, state);
          const capture = spec.boards[s.board]?.captures[key];
          if (!capture) {
            problems.push(`${at}: no rendered ${key} reference on ${s.board}`);
            continue;
          }
          if (!def?.inFlight && !capture.rows[row.id])
            problems.push(`${at}: ${s.board} ${key} does not draw this row`);
        }
      }
    }
  }
  problems.push(...paletteProblems(boards));
  return { problems, undrawn };
}

/**
 * Every board's default state carries the palette read at its wrapper, and
 * a section drawn in both themes has a light palette and a dark one that
 * differ: an empty or unchanging palette means the tokens were read in the
 * wrong place, and the token checks would compare nothing.
 */
function paletteProblems(boards: BoardsDir): string[] {
  const { sections, spec } = boards;
  const problems = new Set<string>();
  const tokens = (board: string, theme: Theme) =>
    spec.boards[board]?.captures[captureKey(theme, "default")]?.tokens;
  for (const [board, ref] of Object.entries(spec.boards))
    for (const theme of THEMES) {
      const t = ref.captures[captureKey(theme, "default")]?.tokens;
      if (t && !Object.keys(t).length)
        problems.add(
          `spec.json: ${board} ${theme}/default has no colour tokens at ${sections.tokens.board}`
        );
    }
  for (const row of sections.rows)
    for (const width of WIDTHS) {
      const src = row.sources?.[width];
      if (!src?.light?.board || !src.dark?.board) continue;
      const light = tokens(src.light.board, "light");
      const dark = tokens(src.dark.board, "dark");
      if (!light || !dark || !Object.keys(light).length) continue;
      if (stableJson(light) === stableJson(dark))
        problems.add(
          `spec.json: ${src.light.board} light and ${src.dark.board} dark have the same palette`
        );
    }
  return [...problems];
}
