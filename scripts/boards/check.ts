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
  load,
  padPair,
  rowQueries,
  runSteps,
  shoot,
  siteContext,
  stepsFor,
  webpToPng,
} from "./capture";
import {
  applyToReference,
  compareLayout,
  compareMotion,
  compareReducedMotion,
  compareRow,
  rowMotion,
  signature,
  suppress,
  type Failure,
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

async function siteCapture(
  opts: CheckOptions,
  boards: BoardsDir,
  g: Group,
  queryRows: Row[],
  state: string,
  rm: boolean,
  tokenNames: string[],
  keep: (page: Page, capture: Capture) => Promise<void>
): Promise<Capture> {
  const ctx = await siteContext(opts.browser, boards.sections, opts.baseURL, {
    width: g.width,
    reducedMotion: rm,
  });
  try {
    const page = await ctx.newPage();
    await load(page, g.route, boards.sections.clock);
    const capture = await captureState(
      page,
      boards.sections,
      rowQueries(queryRows, boards.sections.rows, "site"),
      { state, theme: g.theme, toggle: g.theme === "dark" },
      "site",
      { tokenNames }
    );
    await keep(page, capture);
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
        const pending = pendingFor(boards, g.rows, where);
        const refKey = `${g.theme}/${stateName(state, { rm, pending })}`;
        const ref = ref0?.captures[refKey];
        const rowsHere = g.rows.filter((r) =>
          rowStates(sections, r, g.width).includes(state)
        );
        if (!ref) {
          for (const r of rowsHere)
            result.failures.push({
              section: r.id,
              ...where,
              property: "reference",
              expected: `${g.board} ${refKey}`,
              actual: "missing from spec.json",
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
          async (page, cap) => {
            if (!opts.pairsDir) return;
            for (const row of rowsHere) {
              const b = ref.rows[row.id];
              const s = cap.rows[row.id];
              if (!b?.shot) continue;
              const boardPng = await webpToPng(
                page,
                readFileSync(path.join(opts.dir, b.shot))
              );
              const sitePng = s
                ? await shoot(page, s.box)
                : await blankPng(page, 1, 1);
              const [pb, ps] = await padPair(page, boardPng, sitePng);
              const name = pairName(row.id, label, g.width, g.theme);
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
          if (rm) {
            failures.push(
              ...compareReducedMotion(
                row.id,
                where,
                rowMotion(capture.motion, row)
              )
            );
          } else {
            failures.push(
              ...compareMotion(
                row.id,
                where,
                rowMotion(ref.motion, row),
                rowMotion(capture.motion, row)
              )
            );
          }
        }
        if (rm) {
          // Motion outside every row still counts under reduced motion.
          const owner = g.rows.find((r) => r.pageMotion) ? null : g.rows[0];
          if (owner)
            failures.push(
              ...compareReducedMotion(
                owner.id,
                where,
                capture.motion.filter((m) => m.row === null)
              )
            );
        }
        if (!def?.inFlight && rowsHere.length) {
          if (state === "default") {
            const first = rowsHere[0].id;
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

    // Each control does its visible job: where the board's row changes, the
    // site's must change too.
    const failures: Failure[] = [];
    for (const state of states) {
      if (state === "default" || !siteBy[state] || !siteBy.default) continue;
      const def = sections.states[state];
      if (def?.inFlight) continue;
      for (const row of g.rows.filter((r) =>
        rowStates(sections, r, g.width).includes(state)
      )) {
        const boardChanged =
          signature(refBy[state].rows[row.id]) !==
          signature(refBy.default.rows[row.id]);
        const siteChanged =
          signature(siteBy[state].rows[row.id]) !==
          signature(siteBy.default.rows[row.id]);
        if (boardChanged && !siteChanged)
          failures.push({
            section: row.id,
            state,
            width: g.width,
            theme: g.theme,
            property: "control",
            expected: `${describeSteps(stepsFor(def, "site"))} changes the section`,
            actual: "no visible change",
          });
      }
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
