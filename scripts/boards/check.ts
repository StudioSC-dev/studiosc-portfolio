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
  type Row,
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
 * a pinned file, none fails to load, and every family and weight the rows'
 * text uses has a loaded face, so a fallback under the family's name fails.
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
  for (const f of faces) {
    const property = `font ${f.family} ${f.weight}`;
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
            if (state === "default" && !rm && g.rows.length)
              failures.push(
                ...fontFailures(
                  await fontsReport(
                    page,
                    rowQueries(g.rows, sections.rows, "site"),
                    sections
                  ),
                  pinned,
                  fonts,
                  g.rows[0].id,
                  where
                )
              );
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
                ? await shoot(page, s.box)
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
            failures.push(
              ...compareRow(
                row.id,
                where,
                b ? applyToReference(b, row.id, where, active) : null,
                capture.rows[row.id] ?? null
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
