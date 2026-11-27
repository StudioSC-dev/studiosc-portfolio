/**
 * The fidelity check of the site against the committed references. It needs
 * no runtime and no network: it reads docs/boards/ (spec.json, ref/,
 * sections.json, deviations.md, merged.json) and renders only the site.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import {
  blankPng,
  captureState,
  fontsReport,
  load,
  padPair,
  rowQueries,
  runSteps,
  shoot,
  siteContext,
  stepsFor,
  webpToPng,
  type FontFaceReport,
  type RowQuery,
} from "./capture";
import {
  applyToReference,
  compareControl,
  compareLayout,
  compareMotion,
  compareReducedMotion,
  compareRow,
  rowMotion,
  suppress,
  type Failure,
  type Where,
} from "./compare";
import {
  THEMES,
  WIDTHS,
  activeDeviations,
  loadBoards,
  stateName,
  type BoardsDir,
  type Capture,
  type Deviation,
  type Row,
  type RowMeasure,
  type Theme,
  type Width,
} from "./model";
import { pendingFor, rowStates } from "./plan";

export interface Only {
  rows?: string[];
  widths?: Width[];
  themes?: Theme[];
  states?: string[];
  /** false: motion on only; true: reduced motion only. */
  rm?: boolean;
}

export interface CheckOptions {
  dir: string;
  baseURL: string;
  browser: Browser;
  /** UI_VERIFY: write each board/site pair here. */
  pairsDir?: string;
  only?: Only;
  /** Overrides for the harness: the register and merged list to apply. */
  boards?: Partial<Pick<BoardsDir, "deviations" | "merged" | "sections">>;
}

export interface CheckResult {
  failures: Failure[];
  /** `<row> <state> <width> <theme>` for every comparison made. */
  checked: string[];
  /** Built rows at a width no board draws: skipped, listed for QA. */
  undrawn: string[];
  pairs: string[];
}

export const pairName = (
  row: string,
  state: string,
  width: string,
  theme: string
) => `${row.replace(/\//g, ".")}-${state}-${width}-${theme}`;

interface Group {
  width: Width;
  theme: Theme;
  board: string;
  route: string;
  rows: Row[];
}

function groups(
  boards: BoardsDir,
  built: Row[],
  only: Only,
  undrawn: string[]
): Group[] {
  const out = new Map<string, Group>();
  for (const width of WIDTHS) {
    if (only.widths && !only.widths.includes(width)) continue;
    for (const row of built) {
      const src = row.sources[width];
      if (!src) {
        if (!undrawn.includes(`${row.id} at ${width}`))
          undrawn.push(`${row.id} at ${width}`);
        continue;
      }
      for (const theme of THEMES) {
        if (only.themes && !only.themes.includes(theme)) continue;
        const board = src[theme].board;
        const key = `${width}|${theme}|${board}|${row.route}`;
        const g = out.get(key) ?? {
          width,
          theme,
          board,
          route: row.route,
          rows: [],
        };
        g.rows.push(row);
        out.set(key, g);
      }
    }
  }
  return [...out.values()];
}

/** Rows in board order, each list of siblings on its own (top level, then each parent's). */
function siblingLists(ref: Capture, all: Row[]): string[][] {
  const drawn = all.filter((r) => ref.rows[r.id]);
  const parents = [...new Set(drawn.map((r) => r.parent ?? ""))];
  return parents.map((p) =>
    drawn
      .filter((r) => (r.parent ?? "") === p)
      .sort((a, b) => ref.rows[a.id]!.order - ref.rows[b.id]!.order)
      .map((r) => r.id)
  );
}

/** The pinned font files by family: the sha256s a site face may load. */
function pinnedFaces(boards: BoardsDir): Map<string, Set<string>> {
  const css = readFileSync(
    path.join(boards.dir, "fonts", boards.manifest.fontCss),
    "utf8"
  );
  const out = new Map<string, Set<string>>();
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const fam = /font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(block)?.[1];
    const url = /url\(([^)]+)\)/.exec(block)?.[1];
    const pin = url && boards.manifest.fonts[path.basename(url)];
    if (!fam || !pin) continue;
    const key = fam.trim().toLowerCase();
    out.set(key, (out.get(key) ?? new Set()).add(pin.sha256));
  }
  return out;
}

/** A site face's family as the boards name it, and whether it is next/font's fallback. */
function faceFamily(raw: string) {
  const m = /^__(.+?)(_Fallback)?_[0-9a-f]{6,}$/.exec(raw);
  return {
    family: (m ? m[1].replace(/_/g, " ") : raw).toLowerCase(),
    fallback: !!m?.[2],
  };
}

/**
 * A `font` deviation: the family the site's face renders under (`built`, as
 * the harness reads a family) stands for the board's family, and its faces
 * may load the one file whose sha256 the row names. The built cell reads
 * `<family> sha256:<hex>`.
 */
export interface FontAlias {
  board: string;
  built: string;
  sha256: string;
}

export function fontAlias(d: Deviation): FontAlias | null {
  if (d.property !== "font") return null;
  const m = /^(\S.*?) sha256:([0-9a-f]{64})$/.exec(d.built.trim());
  const board = d.board.trim().toLowerCase();
  if (!m || !board) return null;
  return { board, built: faceFamily(m[1]).family, sha256: m[2] };
}

/**
 * The font deviations in force for a row here: each names the row, state,
 * width and theme exactly, and the selected reference draws the row's text
 * in the deviation's board family.
 */
function rowAliases(
  active: Deviation[],
  section: string,
  where: Where,
  ref: RowMeasure | null | undefined
): FontAlias[] {
  if (!ref) return [];
  const drawn = new Set(ref.keys.map((k) => k.type?.family));
  return active.flatMap((d) => {
    const a =
      d.section.includes(section) &&
      d.state.includes(where.state) &&
      d.width.includes(where.width) &&
      d.theme.includes(where.theme)
        ? fontAlias(d)
        : null;
    return a && drawn.has(a.board) ? [a] : [];
  });
}

/**
 * The site's row with the built family read as the board family, on each key
 * whose board counterpart is set in that family: only that comparison of
 * `font-family` changes.
 */
function asBoardFamily(
  ref: RowMeasure | null,
  site: RowMeasure | null,
  aliases: FontAlias[]
): RowMeasure | null {
  if (!ref || !site || !aliases.length) return site;
  const board = new Map(ref.keys.map((k) => [k.key, k.type?.family]));
  return {
    ...site,
    keys: site.keys.map((k) => {
      const a =
        k.type &&
        aliases.find(
          (x) => x.built === k.type!.family && x.board === board.get(k.key)
        );
      return a ? { ...k, type: { ...k.type!, family: a.board } } : k;
    }),
  };
}

const covers = (range: string, weight: number) => {
  const named: Record<string, number> = { normal: 400, bold: 700 };
  const [a, b] = range
    .split(/\s+/)
    .map((w) => named[w] ?? Number(w))
    .concat([]);
  return weight >= a && weight <= (b ?? a);
};

/**
 * The site's fonts are the pinned ones: every face of a pinned family loads
 * a pinned file and nothing else (no local() font, no inline or unseen
 * bytes), none fails to load, and every family and weight the rows' text
 * uses has a face loaded from a pinned file, so a fallback or a system font
 * under the family's name fails.
 */
function fontFailures(
  report: { faces: FontFaceReport[]; used: string[] },
  pinned: Map<string, Set<string>>,
  served: Map<string, string>,
  section: string,
  where: Where
): Failure[] {
  const out: Failure[] = [];
  const push = (property: string, expected: string, actual: string) =>
    out.push({ section, ...where, property, expected, actual });
  const faces = report.faces
    .map((f) => ({ ...f, ...faceFamily(f.family) }))
    .filter((f) => pinned.has(f.family) && !f.fallback);
  const fromPin = (f: (typeof faces)[number]) =>
    !f.local && f.urls.some((u) => pinned.get(f.family)!.has(served.get(u)!));
  for (const f of faces) {
    const property = `font ${f.family} ${f.weight}`;
    if (f.local)
      push(
        property,
        "loaded from a pinned file",
        "a local() source: whatever font the machine has"
      );
    else if (f.status === "loaded" && !f.urls.some((u) => served.has(u)))
      push(
        property,
        "loaded from a pinned file",
        "loaded from no file the site served"
      );
    if (f.status === "error")
      push(
        property,
        "loaded from a pinned file",
        `failed to load ${f.urls.map((u) => path.basename(new URL(u).pathname)).join(", ")}`
      );
    for (const url of f.urls) {
      const sha = served.get(url);
      if (sha && !pinned.get(f.family)!.has(sha))
        push(
          property,
          `a pinned ${f.family} file`,
          `${path.basename(new URL(url).pathname)} with sha256 ${sha}`
        );
    }
  }
  for (const used of report.used) {
    const [raw, weight, style] = used.split("|");
    const { family, fallback } = faceFamily(raw);
    if (!pinned.has(family) || fallback) continue;
    const ok = faces.some(
      (f) =>
        f.family === family &&
        f.status === "loaded" &&
        fromPin(f) &&
        f.style === style &&
        covers(f.weight, Number(weight))
    );
    if (!ok)
      push(
        `font ${family} ${weight}`,
        "loaded from a pinned file",
        "no loaded face: the text falls back"
      );
  }
  return out;
}

/** A text run of a row a font row covers, as inpage.js fontRuns reports it. */
interface FontRun {
  id: string;
  row: string;
  /** The innermost key element that holds the run, as measure names keys. */
  key: string | null;
  /** The computed font-family list, first family first. */
  families: string[];
  weight: string;
  style: string;
  text: string;
}

/** A font Chromium painted a run's glyphs with. */
interface PaintedFont {
  familyName: string;
  isCustomFont: boolean;
}

/** A DOM node as Chromium's DevTools protocol reports it. */
interface CdpNode {
  nodeId: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
  shadowRootType?: string;
}

/** A row a font row covers here, with the deviations in force and its reference. */
interface CoveredRow {
  id: string;
  aliases: FontAlias[];
  ref: RowMeasure;
}

const RUN_ATTR = "data-fidelity-run";

/**
 * The text runs of `rows` and the fonts Chromium painted each with (the
 * run's own text, or a control's user-agent shadow tree: its value or
 * placeholder). Each of `probes` (id to URL) is painted in a face loaded from
 * that URL alone, under `probe:<id>`.
 */
async function paintedRuns(
  page: Page,
  rows: RowQuery[],
  sections: BoardsDir["sections"],
  probes: Record<string, string>
): Promise<{ runs: FontRun[]; painted: Map<string, PaintedFont[]> }> {
  const runs = (await page.evaluate(
    (spec) =>
      (
        window as unknown as {
          __fidelity: { fontRuns(s: unknown): Promise<unknown> };
        }
      ).__fidelity.fontRuns(spec),
    { rows, keys: sections.keys, probes, attr: RUN_ATTR }
  )) as FontRun[];
  const painted = new Map<string, PaintedFont[]>();
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
    const within = (n: CdpNode): number[] => [
      n.nodeId,
      ...[...(n.children ?? []), ...(n.shadowRoots ?? [])].flatMap(within),
    ];
    const tagged: [string, number[]][] = [];
    const visit = (n: CdpNode) => {
      const attrs = n.attributes ?? [];
      for (let i = 0; i < attrs.length; i += 2)
        if (attrs[i] === RUN_ATTR)
          tagged.push([
            attrs[i + 1],
            [
              n.nodeId,
              ...(n.shadowRoots ?? [])
                .filter((r) => r.shadowRootType === "user-agent")
                .flatMap(within),
            ],
          ]);
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])])
        visit(c);
    };
    visit(root);
    for (const [id, nodes] of tagged) {
      const fonts = new Map<string, PaintedFont>();
      for (const nodeId of nodes) {
        const got = await cdp
          .send("CSS.getPlatformFontsForNode", { nodeId })
          .catch(() => ({ fonts: [] }));
        for (const f of got.fonts)
          fonts.set(`${f.familyName}|${f.isCustomFont}`, {
            familyName: f.familyName,
            isCustomFont: f.isCustomFont,
          });
      }
      painted.set(id, [...fonts.values()]);
    }
  } finally {
    await cdp.detach();
    await page.evaluate(
      (attr) =>
        (
          window as unknown as {
            __fidelity: { clearFontRuns(a: string): void };
          }
        ).__fidelity.clearFontRuns(attr),
      RUN_ATTR
    );
  }
  return { runs, painted };
}

/** A font URL as a failure names it. */
const fontFile = (url: string) =>
  url.startsWith("data:")
    ? "an inline font"
    : path.basename(new URL(url).pathname);

/** The built family's own faces (not next/font's fallback for it). */
const builtFaces = (faces: FontFaceReport[], a: FontAlias) =>
  faces.filter((f) => {
    const { family, fallback } = faceFamily(f.family);
    return family === a.built && !fallback;
  });

/** Why a face of the built family is not the signed file alone, or null. */
function signedProblem(
  f: FontFaceReport,
  a: FontAlias,
  served: Map<string, string>
): string | null {
  if (f.status === "error")
    return `failed to load ${f.urls.map(fontFile).join(", ")}`;
  if (f.local) return "a local() source: whatever font the machine has";
  if (f.urls.length !== 1)
    return `${f.urls.length} sources: ${f.urls.map(fontFile).join(", ")}`;
  const sha = served.get(f.urls[0]);
  if (!sha) return `${fontFile(f.urls[0])}, which the site did not serve`;
  if (sha !== a.sha256) return `${fontFile(f.urls[0])} with sha256 ${sha}`;
  return null;
}

/**
 * The text a font row covers is painted by its one signed file. Every face
 * of the built family loads that file alone, from one URL the site served
 * whose bytes match the sha256. Every run of a covered row set in the built
 * family, unless the board sets the run's key in another family, has the
 * built family first (not next/font's fallback), a loaded signed face for
 * its weight and style, and every glyph painted by the signed file, as the
 * probe of that file names it: a glyph or weight the file lacks falls back,
 * and fails. The rows' other text keeps the regular pins (fontFailures).
 */
function aliasFailures(
  faces: FontFaceReport[],
  served: Map<string, string>,
  covered: CoveredRow[],
  runs: FontRun[],
  painted: Map<string, PaintedFont[]>,
  probed: Map<string, string>,
  where: Where
): Failure[] {
  const out: Failure[] = [];
  const seen = new Set<string>();
  for (const c of covered)
    for (const a of c.aliases) {
      const id = `${a.built}|${a.sha256}`;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const f of builtFaces(faces, a)) {
        const problem = signedProblem(f, a, served);
        if (problem)
          out.push({
            section: c.id,
            ...where,
            property: `font ${a.board} ${f.weight}`,
            expected: `loaded from the signed file alone, sha256 ${a.sha256}`,
            actual: problem,
          });
      }
    }
  for (const run of runs) {
    const c = covered.find((x) => x.id === run.row);
    const first = run.families[0] ?? "";
    const { family, fallback } = faceFamily(first);
    const a = c?.aliases.find(
      (x) => x.built === family || `${x.built} fallback` === family
    );
    if (!c || !a) continue;
    const board = run.key
      ? c.ref.keys.find((k) => k.key === run.key)?.type?.family
      : undefined;
    if (board !== undefined && board !== a.board) continue;
    const push = (expected: string, actual: string) =>
      out.push({
        section: run.row,
        ...where,
        property: `font ${a.board} ${run.weight}`,
        expected,
        actual: `${actual}: "${run.text}"`,
      });
    if (fallback || family !== a.built)
      push(`the ${a.board} face first`, `the fallback face ${first} first`);
    const signed = builtFaces(faces, a).filter(
      (f) => f.status === "loaded" && !signedProblem(f, a, served)
    );
    if (
      !signed.some(
        (f) => f.style === run.style && covers(f.weight, Number(run.weight))
      )
    )
      push(
        `a loaded face of the signed file at ${run.weight} ${run.style}`,
        "no loaded face: the text falls back"
      );
    const want = probed.get(a.sha256);
    const fonts = painted.get(run.id) ?? [];
    if (
      !want ||
      !fonts.length ||
      fonts.some((f) => !f.isCustomFont || f.familyName !== want)
    )
      push(
        `painted by the signed file${want ? ` (${want})` : ""}`,
        `painted by ${fonts.map((f) => f.familyName).join(", ") || "no font"}`
      );
  }
  return out;
}

/**
 * The font failures of the rows font rows cover here: their runs, painted,
 * against the signed files (aliasFailures). Each signed file is probed from a
 * face of the built family that loads it alone.
 */
async function coveredFontFailures(
  page: Page,
  sections: BoardsDir["sections"],
  faces: FontFaceReport[],
  served: Map<string, string>,
  covered: CoveredRow[],
  where: Where
): Promise<Failure[]> {
  const probes: Record<string, string> = {};
  for (const a of covered.flatMap((c) => c.aliases)) {
    const f = builtFaces(faces, a).find(
      (x) => x.status === "loaded" && !signedProblem(x, a, served)
    );
    if (f) probes[a.sha256] = f.urls[0];
  }
  const { runs, painted } = await paintedRuns(
    page,
    rowQueries(
      sections.rows.filter((r) => covered.some((c) => c.id === r.id)),
      sections.rows,
      "site"
    ),
    sections,
    probes
  );
  const probed = new Map<string, string>();
  for (const sha of Object.keys(probes)) {
    const font = painted.get(`probe:${sha}`)?.find((f) => f.isCustomFont);
    if (font) probed.set(sha, font.familyName);
  }
  return aliasFailures(faces, served, covered, runs, painted, probed, where);
}

async function siteCapture(
  opts: CheckOptions,
  boards: BoardsDir,
  g: Group,
  queryRows: Row[],
  state: string,
  rm: boolean,
  tokenNames: string[],
  keep: (
    page: Page,
    capture: Capture,
    fonts: Map<string, string>
  ) => Promise<void>
): Promise<Capture> {
  const fonts = new Map<string, string>();
  const ctx = await siteContext(
    opts.browser,
    boards.sections,
    opts.baseURL,
    { width: g.width, reducedMotion: rm },
    fonts
  );
  try {
    const page = await ctx.newPage();
    await load(page, g.route, boards.sections.clock);
    const capture = await captureState(
      page,
      boards.sections,
      rowQueries(queryRows, boards.sections.rows, "site"),
      { state, theme: g.theme, toggle: g.theme === "dark" },
      "site",
      { tokenNames, allMotion: rm }
    );
    await keep(page, capture, fonts);
    return capture;
  } finally {
    await ctx.close();
  }
}

export async function checkSite(opts: CheckOptions): Promise<CheckResult> {
  const loaded = loadBoards(opts.dir);
  const boards: BoardsDir = { ...loaded, ...opts.boards };
  const { sections, spec } = boards;
  const only = opts.only ?? {};
  const active = activeDeviations(boards.deviations, boards.merged);
  const result: CheckResult = {
    failures: [],
    checked: [],
    undrawn: [],
    pairs: [],
  };
  const built = sections.rows.filter(
    (r) => r.built && (!only.rows || only.rows.includes(r.id))
  );
  const stateOk = (s: string) => {
    const t = sections.states[s]?.ticket;
    return (
      (!t || boards.merged.includes(t)) &&
      (!only.states || only.states.includes(s))
    );
  };
  const lightTokens = new Map<string, Record<string, string>>();
  const pinned = pinnedFaces(boards);
  /** Font failures already reported, once each per page and width. */
  const fontsSeen = new Set<string>();

  for (const g of groups(boards, built, only, result.undrawn)) {
    const ref0 = spec.boards[g.board];
    const allOnBoard = sections.rows.filter(
      (r) => r.sources[g.width]?.[g.theme].board === g.board
    );
    // Every built row on the page is measured, so motion is still attributed
    // to its own row when a run is narrowed to some of them.
    const queryRows = allOnBoard.filter((r) => r.built && r.route === g.route);
    const states = [
      ...new Set([
        "default",
        ...g.rows.flatMap((r) => rowStates(sections, r, g.width)),
      ]),
    ].filter(stateOk);
    const siteBy: Record<string, Capture> = {};
    const refBy: Record<string, Capture> = {};
    const rms = only.rm === undefined ? [false, true] : [only.rm];
    for (const state of states) {
      const def = sections.states[state];
      for (const rm of rms) {
        const label = stateName(state, { rm });
        const where = { state: label, width: g.width, theme: g.theme };
        const pending = pendingFor(boards, allOnBoard, where);
        const refKey = `${g.theme}/${stateName(state, { rm, pending })}`;
        const ref = ref0?.captures[refKey];
        const rowsHere = g.rows.filter((r) =>
          rowStates(sections, r, g.width).includes(state)
        );
        if (!ref) {
          for (const r of rowsHere.length ? rowsHere : g.rows.slice(0, 1))
            result.failures.push({
              section: r.id,
              ...where,
              property: "reference",
              expected: `${g.board} ${refKey}`,
              actual: "missing from spec.json (run boards:regen)",
            });
          continue;
        }
        const failures: Failure[] = [];
        const capture = await siteCapture(
          opts,
          boards,
          g,
          queryRows,
          state,
          rm,
          Object.keys(ref.tokens),
          async (page, cap, fonts) => {
            // In every state, motion on and reduced: a font a step or the
            // reduced-motion styles swap in is still the site's font. Each
            // failure is named once, in the first state it shows. The rows a
            // font deviation covers have their text checked against its
            // signed file too.
            const covered: CoveredRow[] = g.rows.flatMap((r) => {
              const b = ref.rows[r.id];
              const aliases = rowAliases(active, r.id, where, b);
              return b && aliases.length ? [{ id: r.id, aliases, ref: b }] : [];
            });
            if (g.rows.length) {
              const report = await fontsReport(
                page,
                rowQueries(g.rows, sections.rows, "site"),
                sections
              );
              const found = fontFailures(
                report,
                pinned,
                fonts,
                g.rows[0].id,
                where
              );
              if (covered.length)
                found.push(
                  ...(await coveredFontFailures(
                    page,
                    sections,
                    report.faces,
                    fonts,
                    covered,
                    where
                  ))
                );
              for (const f of found) {
                const id = `${g.route}|${g.width}|${g.theme}|${f.property}|${f.actual}`;
                if (fontsSeen.has(id)) continue;
                fontsSeen.add(id);
                failures.push(f);
              }
            }
            if (!opts.pairsDir) return;
            for (const row of rowsHere) {
              const b = ref.rows[row.id];
              const s = cap.rows[row.id];
              if (!b) continue;
              const name = pairName(row.id, label, g.width, g.theme);
              if (!b.shot) {
                failures.push({
                  section: row.id,
                  ...where,
                  property: "pair",
                  expected: `a reference shot in ${g.board} ${refKey}`,
                  actual: "none in spec.json (run boards:regen)",
                });
                continue;
              }
              const boardPng = await webpToPng(
                page,
                readFileSync(path.join(opts.dir, b.shot))
              );
              const sitePng = s
                ? await shoot(page, s.box, cap.frame)
                : await blankPng(page, 1, 1);
              const [pb, ps] = await padPair(page, boardPng, sitePng);
              mkdirSync(opts.pairsDir, { recursive: true });
              writeFileSync(path.join(opts.pairsDir, `${name}-board.png`), pb);
              writeFileSync(path.join(opts.pairsDir, `${name}-site.png`), ps);
              result.pairs.push(name);
            }
          }
        );
        if (!rm) {
          siteBy[state] = capture;
          refBy[state] = ref;
        }
        for (const row of rowsHere) {
          result.checked.push(`${row.id} ${label} ${g.width} ${g.theme}`);
          if (!def?.inFlight) {
            const b = ref.rows[row.id];
            const board = b ? applyToReference(b, row.id, where, active) : null;
            failures.push(
              ...compareRow(
                row.id,
                where,
                board,
                asBoardFamily(
                  board,
                  capture.rows[row.id] ?? null,
                  rowAliases(active, row.id, where, b)
                )
              )
            );
          }
        }
        if (rm) {
          // Nothing animates, from load through every step, on any row or
          // outside them all.
          failures.push(
            ...compareReducedMotion(
              (rowsHere[0] ?? g.rows[0]).id,
              where,
              capture.motion
            )
          );
        } else {
          // Every built row's motion in this state, whether or not the state
          // is one of its own (the opener's word follows the tabs).
          for (const row of g.rows)
            failures.push(
              ...compareMotion(
                row.id,
                where,
                rowMotion(ref.motion, row),
                rowMotion(capture.motion, row)
              )
            );
        }
        if (!def?.inFlight && rowsHere.length) {
          if (state === "default") {
            const first = rowsHere[0].id;
            if (!Object.keys(ref.tokens).length)
              failures.push({
                section: first,
                ...where,
                property: "tokens",
                expected: `the palette at ${sections.tokens.board} on ${g.board}`,
                actual: "none recorded (run boards:regen)",
              });
            for (const [name, value] of Object.entries(ref.tokens))
              if (capture.tokens[name] !== value)
                failures.push({
                  section: first,
                  ...where,
                  property: `token ${name}`,
                  expected: value,
                  actual: capture.tokens[name] ?? "unset",
                });
          }
          const builtIds = new Set(rowsHere.map((r) => r.id));
          for (const list of siblingLists(ref, allOnBoard))
            failures.push(
              ...compareLayout(where, list, builtIds, ref, capture)
            );
        }
        result.failures.push(...suppress(failures, active));
      }
    }

    // Each control does its visible job, against the state its last step
    // starts from: what changes on the board changes on the site.
    const failures: Failure[] = [];
    for (const state of states) {
      const def = sections.states[state];
      const from = def?.from ?? "default";
      if (state === "default" || def?.inFlight) continue;
      if (!siteBy[state] || !siteBy[from]) continue;
      const steps = stepsFor(def, "site");
      const control = describeSteps(steps.slice(-1));
      for (const row of g.rows.filter((r) =>
        rowStates(sections, r, g.width).includes(state)
      ))
        failures.push(
          ...compareControl(
            row.id,
            { state, width: g.width, theme: g.theme },
            control,
            [refBy[from].rows[row.id], refBy[state].rows[row.id]],
            [siteBy[from].rows[row.id], siteBy[state].rows[row.id]]
          )
        );
    }
    // The theme toggle switches the theme.
    const tokensKey = `${g.width}|${g.route}`;
    if (siteBy.default && g.theme === "light")
      lightTokens.set(tokensKey, siteBy.default.tokens);
    if (siteBy.default && g.theme === "dark" && lightTokens.has(tokensKey)) {
      const light = lightTokens.get(tokensKey)!;
      const same = Object.keys(siteBy.default.tokens).every(
        (k) => siteBy.default.tokens[k] === light[k]
      );
      if (same && Object.keys(light).length)
        failures.push({
          section: g.rows[0].id,
          state: "default",
          width: g.width,
          theme: g.theme,
          property: "control",
          expected: `${describeSteps(sections.theme.light)} switches the theme`,
          actual: "no visible change",
        });
    }
    // A view link opens its view.
    if (stateOk("default") && only.rm !== true)
      for (const row of g.rows)
        for (const link of row.links ?? []) {
          const ctx = await siteContext(opts.browser, sections, opts.baseURL, {
            width: g.width,
            reducedMotion: false,
          });
          try {
            const page = await ctx.newPage();
            await load(page, g.route, sections.clock);
            if (g.theme === "dark") await runSteps(page, sections.theme.light);
            const target = page
              .locator(`:is(${row.site}) :is(${link.selector})`)
              .first();
            let landed = "not found";
            if (await target.count()) {
              await target.click();
              await page
                .waitForURL((u) => u.pathname === link.to, { timeout: 5000 })
                .catch(() => undefined);
              landed = new URL(page.url()).pathname;
            }
            if (landed !== link.to)
              failures.push({
                section: row.id,
                state: "default",
                width: g.width,
                theme: g.theme,
                property: `link ${link.selector}`,
                expected: link.to,
                actual: landed,
              });
          } finally {
            await ctx.close();
          }
        }
    result.failures.push(...suppress(failures, active));
  }
  return result;
}

const describeSteps = (steps: { click?: { name: string }; fill?: unknown }[]) =>
  steps
    .filter((s) => s.click)
    .map((s) => `"${s.click!.name}"`)
    .join(", ") || "its steps";
