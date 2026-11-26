import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";

import { checkSite } from "../scripts/boards/check";
import { loadBoards } from "../scripts/boards/model";
import * as ts from "typescript";
import { scanText } from "./support/denylist";
import { changedByPr } from "./support/git";
import {
  addedIconSources,
  allowsHeadingWeight,
  finalWithFragment,
  contrast,
  flattenSurface,
  perfRunProblems,
  fontCut,
  plexCutProblems,
  docGaps,
  liveAliases,
  expectedFontConfig,
  normalizeDestination,
  ringProblems,
  unexpectedFragmentFonts,
  failingPairings,
  firstFamily,
  fontBudgetProblems,
  fontOptions,
  fragmentFontDeviations,
  missingMotionRules,
  nonSentenceCase,
  optionValue,
  parseDoc,
  sameColour,
  table,
  trackingEm,
  withoutKeyframes,
  withoutRow,
  withoutSection,
  type LabelSample,
  type Pairing,
} from "./fixtures/design-tokens/checks";
import {
  FIXTURE_HOST_ID,
  FRAGMENT_FACES,
  FRAGMENT_FAMILY,
  FRAGMENT_FIXTURES,
  LOW_RING_FIXTURE,
  MOTION_FIXTURES,
  OVERRIDDEN_FORM_FIXTURE,
} from "./fixtures/design-tokens/fragments";
import {
  BOARD_WEIGHTS,
  BUDGET_ROUTES,
  CODE_ROUTE,
  CONTEXT_TOKENS,
  DOTS_OPACITY,
  REQUIRED_PAIRINGS,
  RETIRED_DARK_TOKENS,
  SCOPE_FILES,
  SCOPE_ROUTES,
  TYPE_SCALE,
} from "./fixtures/design-tokens/inventory";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const DOC = "docs/design-system.md";
const CSS = "app/globals.css";
const FONTS = "lib/fonts.ts";
const PERF = "docs/perf/prv-2.json";
const PERF_26 = "docs/perf/prv-26.json";
const DEVIATIONS = "docs/boards/deviations.md";
/** The self-hosted IBM Plex Sans cut, and the name inside the file (see lib/fonts.ts). */
const PLEX_FILE = "app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2";
const PLEX_INTERNAL_NAME = "SSC Fragment Sans";
/**
 * The boards' pinned Latin files for the two Red Hat families (PRV-26): the
 * `latin` entries of docs/boards/fonts/google.css, copied to `copy` with the
 * licence in `licence` beside it.
 */
const BOARD_FONTS = "docs/boards/fonts";
const PINNED_RED_HAT = {
  "Red Hat Display": {
    copy: "app/fonts/red-hat-display/red-hat-display-latin.woff2",
    licence: "app/fonts/red-hat-display/OFL.txt",
    original: `${BOARD_FONTS}/OFL-redhatdisplay.txt`,
    range: "400 800",
    exportName: "__Red_Hat_Display_f7a7830b",
  },
  "Red Hat Text": {
    copy: "app/fonts/red-hat-text/red-hat-text-latin.woff2",
    licence: "app/fonts/red-hat-text/OFL.txt",
    original: `${BOARD_FONTS}/OFL-redhattext.txt`,
    range: "400 700",
    exportName: "__Red_Hat_Text_59826f39",
  },
} as const;
type RedHatFamily = keyof typeof PINNED_RED_HAT;
const RED_HAT_FAMILIES = Object.keys(PINNED_RED_HAT) as RedHatFamily[];

/**
 * Manrope: the board's pinned Latin file, copied the same way (PRV-26
 * amendment). JetBrains Mono: not on the boards, so no board pin; the file is
 * the Latin weight-400 woff2 Google Fonts served for the site's declaration on
 * 2026-11-26, and its SHA-256 and source URL are recorded in the ticket.
 */
const MANROPE = {
  copy: "app/fonts/manrope/manrope-latin.woff2",
  licence: "app/fonts/manrope/OFL.txt",
  original: `${BOARD_FONTS}/OFL-manrope.txt`,
  exportName: "__Manrope_8c2def02",
} as const;
const JETBRAINS_MONO = {
  copy: "app/fonts/jetbrains-mono/jetbrains-mono-latin.woff2",
  licence: "app/fonts/jetbrains-mono/OFL.txt",
  exportName: "__JetBrains_Mono_14425ba9",
  sha256: "14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb",
  source:
    "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxTOlOV.woff2",
} as const;
type PinnedFamily = RedHatFamily | "Manrope";
const PINNED_FAMILIES: PinnedFamily[] = [...RED_HAT_FAMILIES, "Manrope"];

/**
 * A family as the boards name it: next/font/local scopes the Red Hat faces as
 * `__Red_Hat_Display_<hash>` (see lib/fonts.ts), which reads "Red Hat Display".
 */
const plainFamily = (raw: string) =>
  raw.replace(
    /^__(.+?)_[0-9a-f]{8}( Fallback)?$/,
    (_m, name: string, fallback: string | undefined) =>
      name.replace(/_/g, " ") + (fallback ?? "")
  );

const sha256Of = (buf: Buffer) =>
  createHash("sha256").update(buf).digest("hex");

/**
 * The sha256 of each family's Latin file in docs/boards/fonts/google.css: the
 * face whose unicode-range opens at U+0000-00FF. Read from the stylesheet,
 * never from a file name.
 */
function latinPins(): Record<PinnedFamily, { file: string; sha256: string }> {
  const css = read(`${BOARD_FONTS}/google.css`);
  const out: Partial<Record<PinnedFamily, { file: string; sha256: string }>> =
    {};
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const family = /font-family:\s*['"]([^'"]+)['"]/.exec(block)?.[1];
    const url = /url\(([^)]+)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1] ?? "";
    if (!family || !url || !range.startsWith("U+0000-00FF")) continue;
    if (!PINNED_FAMILIES.includes(family as PinnedFamily)) continue;
    const file = path.basename(url);
    out[family as PinnedFamily] = {
      file,
      sha256: sha256Of(fs.readFileSync(path.join(ROOT, BOARD_FONTS, file))),
    };
  }
  return out as Record<PinnedFamily, { file: string; sha256: string }>;
}

/**
 * What is wrong with a page's Red Hat font responses: each family must be
 * served by exactly one successful response whose bytes are its pin.
 */
function redHatPinProblems(
  loads: readonly FontLoad[],
  pins: Record<string, { sha256: string }>,
  families: readonly string[] = RED_HAT_FAMILIES
): string[] {
  const problems: string[] = [];
  for (const family of families) {
    const own = loads.filter((l) => l.family === family);
    const ok = own.filter((l) => l.status >= 200 && l.status < 300);
    if (own.length !== 1 || ok.length !== 1) {
      problems.push(
        `${family}: ${own.length} responses, ${ok.length} successful, not 1`
      );
      continue;
    }
    if (ok[0].sha256 !== pins[family].sha256) {
      problems.push(`${family}: sha256 ${ok[0].sha256} is not its pin`);
    }
  }
  return problems;
}

const FRAGMENT_FAMILIES: readonly string[] = Object.values(FRAGMENT_FAMILY);

type Theme = "light" | "dark";
const THEMES: readonly Theme[] = ["light", "dark"];
const KIB = 1024;

/** Tests that read files or git run once, in the desktop Chromium project. */
function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "Reads files, git or a second server: runs once, in the chromium project."
  );
}

// ---------------------------------------------------------------------------
// Page helpers

/** Loads a route and pins the theme with `data-theme`, against the opposite system preference. */
async function openThemed(page: Page, route: string, theme: Theme) {
  await page.emulateMedia({
    colorScheme: theme === "light" ? "dark" : "light",
  });
  await page.goto(route);
  // After hydration, so React does not replace what the test sets.
  await page.waitForLoadState("networkidle");
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

/**
 * Every element in a `[data-fixture]` root that holds its own text: its
 * computed colour, on its own and its ancestors' backgrounds flattened.
 */
async function renderedText(page: Page): Promise<Pairing[]> {
  const samples = await page.evaluate(() => {
    const out: { name: string; fg: string; surfaces: string[] }[] = [];
    for (const root of document.querySelectorAll<HTMLElement>(
      "[data-fixture]"
    )) {
      for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
        const own = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim()
        );
        if (!own) continue;
        const surfaces: string[] = [];
        for (let p: HTMLElement | null = el; p; p = p.parentElement) {
          const bg = getComputedStyle(p).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            surfaces.push(bg);
          }
        }
        out.push({
          name: `${root.dataset.fixture}: ${el.textContent?.trim()}`,
          fg: getComputedStyle(el).color,
          surfaces,
        });
      }
    }
    return out;
  });
  return samples.map((s) => ({
    name: s.name,
    fg: s.fg,
    bg: flattenSurface(s.surfaces),
  }));
}

/** Appends fixture markup to the page, inside one host element. */
async function inject(page: Page, html: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    ({ id, markup }) => {
      let host = document.getElementById(id);
      if (!host) {
        host = document.createElement("div");
        host.id = id;
        document.body.append(host);
      }
      host.insertAdjacentHTML("beforeend", markup);
    },
    { id: FIXTURE_HOST_ID, markup: html }
  );
}

/**
 * Resolves colour tokens to computed rgb as the `scope` element itself holds
 * them (<html> when omitted, so `:root`'s values): each token is read off that
 * element's computed style, with `var()` chains already substituted, and only
 * then converted to rgb on a detached probe. A rule that overrides the token
 * on descendants cannot change the reading.
 */
async function resolveTokens(
  page: Page,
  tokens: readonly string[],
  scope?: string
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ names, selector }) => {
      const parent = selector
        ? document.querySelector(selector)
        : document.documentElement;
      if (!parent) throw new Error(`No element for ${selector}`);
      const held = getComputedStyle(parent);
      const probe = document.createElement("span");
      document.documentElement.append(probe);
      const out: Record<string, string> = {};
      for (const name of names) {
        probe.style.backgroundColor = "";
        probe.style.backgroundColor = held.getPropertyValue(name).trim();
        out[name] = getComputedStyle(probe).backgroundColor;
      }
      probe.remove();
      return out;
    },
    { names: [...tokens], selector: scope ?? null }
  );
}

const doc = () => parseDoc(read(DOC));

/** [token, light, dark] rows of a themed table in the doc. */
function themedRows(heading: string): Array<[string, string, string]> {
  return table(doc(), heading).map((r) => [r.Token, r.Light, r.Dark]);
}

function expectColour(actual: string, expected: string, label: string) {
  expect(
    sameColour(actual, expected),
    `${label}: ${actual} should be ${expected}`
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// Fonts

interface FontLoad {
  family: string;
  url: string;
  bytes: number;
  status: number;
  sha256: string;
}

/** Records every font file a page downloads, with its family, from load to settle. */
function watchFonts(page: Page) {
  const responses: Response[] = [];
  page.on("response", (r) => {
    if (
      r.request().resourceType() === "font" ||
      /\.(woff2?|ttf|otf)(\?|$)/.test(r.url())
    ) {
      responses.push(r);
    }
  });
  return async (): Promise<FontLoad[]> => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState("networkidle");
    const families = await page.evaluate(() => {
      const map: Record<string, string> = {};
      const visit = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSFontFaceRule) {
            const family = rule.style
              .getPropertyValue("font-family")
              .replace(/["']/g, "")
              .trim();
            const src = rule.style.getPropertyValue("src");
            for (const m of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
              map[
                new URL(m[1], rule.parentStyleSheet?.href ?? location.href).href
              ] = family;
            }
          } else if ("cssRules" in rule) {
            visit((rule as CSSGroupingRule).cssRules);
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules);
        } catch {
          // a cross-origin sheet: the site self-hosts every font, so none are expected
        }
      }
      return map;
    });
    const loads: FontLoad[] = [];
    for (const r of responses) {
      const body = await r.body().catch(() => Buffer.alloc(0));
      loads.push({
        family: plainFamily(families[r.url()] ?? "unknown"),
        url: r.url(),
        bytes: body.length,
        status: r.status(),
        sha256: createHash("sha256").update(body).digest("hex"),
      });
    }
    return loads;
  };
}

const bytesOf = (loads: FontLoad[], family: RegExp) =>
  loads
    .filter((l) => family.test(l.family))
    .reduce((sum, l) => sum + l.bytes, 0);

interface PerfRecord {
  measured_sha: string;
  route: string;
  lighthouse_version: string;
  font_fallback_steps: number[];
  fragment_font_bytes: Record<string, number>;
  runs: Array<{ perf: number; a11y: number; lcp_ms: number; cls: number }>;
  median: { perf: number; a11y: number; lcp_ms: number; cls: number };
}

const perfRecord = () => JSON.parse(read(PERF)) as PerfRecord;

// ---------------------------------------------------------------------------
// Git

/** The environment without any GIT_* variable a hook might have set. */
function gitEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))
  ) as NodeJS.ProcessEnv;
}

/** git, without any GIT_* variable a hook might have set. */
function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: gitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitOk(...args: string[]): boolean {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

/** The PR base: PR_BASE_SHA when CI passes it, else the merge base with origin/main. */
function prBase(env: Env = process.env): string {
  const fromEnv = env.PR_BASE_SHA?.trim();
  return fromEnv
    ? git("rev-parse", "--verify", `${fromEnv}^{commit}`)
    : git("merge-base", "origin/main", "HEAD");
}

/** The commit under test: PR_HEAD_SHA when CI passes it, else HEAD. */
function prHead(env: Env = process.env): string {
  return git(
    "rev-parse",
    "--verify",
    `${env.PR_HEAD_SHA?.trim() || "HEAD"}^{commit}`
  );
}

type Env = Record<string, string | undefined>;

interface PrRange {
  base: string;
  head: string;
}

/**
 * The pull request under test, as PRV-1 defines it: in CI, PR_BASE_SHA to
 * PR_HEAD_SHA, and none for a build without PR_HEAD_SHA (a push to main or
 * develop), so checks that judge a PR's own changes do not run there.
 * Locally, PR_BASE_SHA (or the merge base with origin/main) to PR_HEAD_SHA
 * (or HEAD).
 */
function prRange(env: Env = process.env): PrRange | null {
  if (env.CI && !env.PR_HEAD_SHA?.trim()) return null;
  return { base: prBase(env), head: prHead(env) };
}

/**
 * Files changed between two commits, both sides of a rename (PRV-1's
 * --no-renames): a file moved into Scope from outside it shows at its source.
 */
function changedFiles(base: string, head: string, cwd = ROOT): string[] {
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", base, head],
    { cwd, encoding: "utf8", env: gitEnv() }
  )
    .split("\n")
    .filter(Boolean);
}

/** The files Scope does not list. */
function outsideScope(files: readonly string[]): string[] {
  return files.filter(
    (f) =>
      !SCOPE_FILES.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
  );
}

/**
 * Files under the production directories that differ between two commits:
 * without rename detection, so a file moved out of one shows at its source,
 * and a removal shows too, and with the directories as pathspecs.
 */
function productionChanges(from: string, to: string, cwd = ROOT): string[] {
  return execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--name-only",
      "--no-renames",
      from,
      to,
      "--",
      "app",
      "components",
      "content",
      "lib",
      "public",
    ],
    { cwd, encoding: "utf8", env: gitEnv() }
  )
    .split("\n")
    .filter(Boolean);
}

/** A push build: no PR, so the PR-only checks skip with this reason. */
const NO_PR = "a CI build without PR_HEAD_SHA (a push) has no PR to judge";

const SPEC_FILE = "e2e/design-tokens.spec.ts";

/**
 * PRV-1's convention for checks bound to one PR: PRV-2's own diff checks run
 * only on the PR that introduces this suite, the one whose base has no copy
 * of it. On every later PR they skip, with a reason.
 */
function introducesSuite(base: string): boolean {
  return !gitOk("cat-file", "-e", `${base}:${SPEC_FILE}`);
}

/**
 * PRV-2's own PR, or why its one-time checks skip. The skip is decided first,
 * before anything is asserted about the PR head: a branch cut before PRV-2 has
 * a merge ref that carries this suite while its head does not.
 */
function ownPr(env: Env = process.env): { range: PrRange } | { skip: string } {
  const range = prRange(env);
  if (!range) return { skip: NO_PR };
  if (!introducesSuite(range.base)) {
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  }
  return { range };
}

/**
 * The PR whose own commits change the perf record (PRV-1's changedByPr: from
 * the fork point, not the base), or null. A branch cut before the record
 * existed does not change it, though its head lacks it.
 */
function perfBinding(
  env: Env = process.env,
  file: string = PERF
): PrRange | null {
  const range = prRange(env);
  return range && changedByPr(range, file) ? range : null;
}

// ===========================================================================

test.describe("Range design system", () => {
  test("tokens match the doc", async ({ page }) => {
    const root = themedRows("Root colour tokens");
    const status = themedRows("Status colours");
    const aliases = table(doc(), "Legacy aliases");
    const palettes = table(doc(), "Product palettes");
    expect(root.length).toBeGreaterThanOrEqual(7);
    expect(status).toHaveLength(4);
    // The doc lists exactly the aliases globals.css still declares. All six
    // stay through PRV-2's own PR; PRV-18 may then delete the unused ones.
    const live = Object.keys(liveAliases(read(CSS)));
    expect(aliases.map((a) => a.Alias).sort()).toEqual([...live].sort());
    if (!("skip" in ownPr())) expect(live).toHaveLength(6);

    for (const theme of THEMES) {
      await openThemed(page, "/", theme);
      const i = theme === "light" ? 1 : 2;

      const names = [
        ...root.map((r) => r[0]),
        ...status.map((r) => r[0]),
        ...aliases.flatMap((r) => [r.Alias, r["Resolves to"]]),
        ...palettes.map((r) => r.Token),
      ];
      const got = await resolveTokens(page, names);
      for (const row of [...root, ...status]) {
        expectColour(got[row[0]], row[i], `${theme} ${row[0]}`);
      }
      for (const a of aliases) {
        expectColour(
          got[a.Alias],
          got[a["Resolves to"]],
          `${theme} ${a.Alias} -> ${a["Resolves to"]}`
        );
      }
      for (const p of palettes) {
        expectColour(got[p.Token], p.Value, `${theme} ${p.Token}`);
      }

      // The dot fields' opacity and the colour scheme, on <html>.
      const rootState = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          dots: style.getPropertyValue("--dots-opacity").trim(),
          scheme: style.colorScheme,
        };
      });
      // Compared as numbers: the CSS pipeline may write 0.55 as .55.
      expect(Number(rootState.dots), `${theme} --dots-opacity`).toBe(
        Number(DOTS_OPACITY[i - 1])
      );
      expect(rootState.scheme, `${theme} color-scheme`).toBe(theme);

      // Context tokens, each read on every fixture of its context.
      await inject(page, FRAGMENT_FIXTURES);
      const scopes: Record<string, Array<string | undefined>> = {
        ":root": [undefined],
        "[data-fragment]": [
          '[data-fixture="tallyandtrace"]',
          '[data-fixture="central-command"]',
          '[data-fixture="habit-tracker"]',
          '[data-fixture="form-helper"]',
          '[data-fixture="turntable"]',
        ],
        '[data-stage="turntable"]': ['[data-stage="turntable"]'],
      };
      const contexts = table(doc(), "Context tokens");
      expect(contexts.length).toBeGreaterThanOrEqual(CONTEXT_TOKENS.length);
      for (const c of contexts) {
        expect(c.Context in scopes, `fixture for ${c.Context}`).toBe(true);
        for (const scope of scopes[c.Context]) {
          const value = (await resolveTokens(page, [c.Token], scope))[c.Token];
          expectColour(
            value,
            i === 1 ? c.Light : c.Dark,
            `${theme} ${c.Token} in ${c.Context} (${scope ?? "<html>"})`
          );
        }
      }

      // Control: a value set on body, not :root, is not read as the root's.
      await inject(
        page,
        `<style>:root { --prv2-probe: #000000 } body { --prv2-probe: #ffffff }</style>`
      );
      expectColour(
        (await resolveTokens(page, ["--prv2-probe"]))["--prv2-probe"],
        "#000000",
        "root read on <html>"
      );
      // Control: a token overridden on descendants is still read as the
      // sampled element holds it.
      await inject(
        page,
        `<div data-fixture="probe-guard" style="--prv2-probe: #000000"><style>[data-fixture="probe-guard"] * { --prv2-probe: #ffffff }</style></div>`
      );
      expectColour(
        (
          await resolveTokens(
            page,
            ["--prv2-probe"],
            '[data-fixture="probe-guard"]'
          )
        )["--prv2-probe"],
        "#000000",
        "token read on the sampled element"
      );

      // The retired --dark-* constants are declared nowhere.
      const declared = await page.evaluate(
        (retired) => {
          const found: string[] = [];
          const visit = (rules: CSSRuleList) => {
            for (const rule of Array.from(rules)) {
              if (rule instanceof CSSStyleRule) {
                for (const name of retired) {
                  if (rule.style.getPropertyValue(name) !== "")
                    found.push(name);
                }
              }
              if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
            }
          };
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              visit(sheet.cssRules);
            } catch {
              // cross-origin
            }
          }
          const style = getComputedStyle(document.documentElement);
          for (const name of retired) {
            if (style.getPropertyValue(name).trim() !== "") found.push(name);
          }
          return found;
        },
        [...RETIRED_DARK_TOKENS]
      );
      expect(declared, "retired --dark-* declarations").toEqual([]);
    }

    // The container recipe: 1200px of content plus 2.5rem gutters, 1280px.
    if (!test.info().project.use.isMobile) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await inject(
        page,
        `<div data-fixture="container" class="box-content max-w-page px-gutter mx-auto">Container</div>`
      );
      const box = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-fixture="container"]'
        )!;
        const s = getComputedStyle(el);
        return {
          outer: el.getBoundingClientRect().width,
          content:
            el.clientWidth -
            parseFloat(s.paddingLeft) -
            parseFloat(s.paddingRight),
        };
      });
      expect(box, "container at 1440px").toEqual({
        outer: 1280,
        content: 1200,
      });
    }

    // The phone and person sizes the boards draw, as utilities.
    const utilities: Record<string, string> = {
      "text-section-phone": "Section title, phone",
      "text-person": "Person name",
      "text-person-phone": "Person name, phone",
    };
    await page.goto("/");
    await inject(
      page,
      Object.keys(utilities)
        .map((c) => `<p data-type="${c}" class="${c}">Type</p>`)
        .join("")
    );
    for (const [utility, role] of Object.entries(utilities)) {
      const row = TYPE_SCALE.find((r) => r[0] === role)!;
      const [size, leading] = row[1].split("/").map(Number);
      const got = await page.evaluate((c) => {
        const s = getComputedStyle(
          document.querySelector(`[data-type="${c}"]`)!
        );
        return {
          size: parseFloat(s.fontSize),
          leading: parseFloat(s.lineHeight),
          tracking: s.letterSpacing,
          fontSize: s.fontSize,
        };
      }, utility);
      expect([got.size, got.leading], `${utility} size`).toEqual([
        size,
        leading,
      ]);
      expect(
        trackingEm(got.tracking, got.fontSize),
        `${utility} tracking`
      ).toBeCloseTo(parseFloat(row[2]), 3);
    }

    const css = read(CSS);
    for (const name of RETIRED_DARK_TOKENS) {
      expect(css.includes(`${name}:`), `${name} declared in ${CSS}`).toBe(
        false
      );
    }
  });

  test("pairings meet contrast", async ({ page }) => {
    const rows = table(doc(), "Text pairings");
    for (const [fg, bg] of REQUIRED_PAIRINGS) {
      expect(
        rows.some((r) => r.Text === fg && r.Surface === bg),
        `the doc lists ${fg} on ${bg}`
      ).toBe(true);
    }

    for (const theme of THEMES) {
      await openThemed(page, "/", theme);
      const tokens = [...new Set(rows.flatMap((r) => [r.Text, r.Surface]))];
      const got = await resolveTokens(page, tokens);
      const pairings: Pairing[] = rows.map((r) => ({
        name: `${theme} ${r.Text} on ${r.Surface}`,
        fg: got[r.Text],
        bg: got[r.Surface],
      }));
      expect(failingPairings(pairings, 4.5)).toEqual([]);

      // The text each fragment fixture renders, in the colour it computes to,
      // on the surface painted behind it: an override inside a fragment
      // counts, though the root tokens are unchanged.
      await inject(page, FRAGMENT_FIXTURES + OVERRIDDEN_FORM_FIXTURE);
      const rendered = await renderedText(page);
      const [overridden, fixtures] = [
        rendered.filter((p) => p.name.startsWith("form-helper-overridden:")),
        rendered.filter((p) => !p.name.startsWith("form-helper-overridden:")),
      ];
      expect(fixtures.length).toBeGreaterThanOrEqual(20);
      expect(failingPairings(fixtures, 4.5), `${theme} fixtures`).toEqual([]);
      // Control: the overridden labels fail, the rest of that copy passes.
      expect(
        failingPairings(overridden, 4.5).map((f) => f.split(":")[1])
      ).toEqual([
        " Customer message",
        " Reply draft",
        " The draft appears here as it is written.",
      ]);

      // Fully transparent text fails, though its colour alone would pass.
      expect(
        failingPairings(
          [
            {
              name: "transparent ink on gallery",
              fg: "rgba(29, 31, 35, 0)",
              bg: got["--gallery"],
            },
          ],
          4.5
        )
      ).toHaveLength(1);

      // A pairing below 4.5:1 must fail the same check.
      const low = await resolveTokens(page, [
        "--frag-tt-rule",
        "--frag-tt-sheet",
      ]);
      expect(
        failingPairings(
          [
            {
              name: "fixture rule on sheet",
              fg: low["--frag-tt-rule"],
              bg: low["--frag-tt-sheet"],
            },
          ],
          4.5
        )
      ).toHaveLength(1);
    }
  });

  test("inline article links keep a visible underline", async ({ page }) => {
    // Prose links share the body colour, so the underline is their cue: it
    // must be drawn and reach 3:1 against the page, in both themes.
    const sample = () =>
      page.evaluate(() => {
        const link = document.querySelector<HTMLAnchorElement>(".prose p a");
        if (!link) throw new Error("no inline prose link");
        const style = getComputedStyle(link);
        const surfaces: string[] = [];
        for (let p = link.parentElement; p; p = p.parentElement) {
          const bg = getComputedStyle(p).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            surfaces.push(bg);
          }
        }
        return {
          line: style.textDecorationLine,
          underline: style.textDecorationColor,
          surfaces,
        };
      });
    const underlineRatio = (s: Awaited<ReturnType<typeof sample>>) =>
      contrast(s.underline, flattenSurface(s.surfaces));
    for (const theme of THEMES) {
      await openThemed(page, "/blog/tallyandtrace", theme);
      const link = await sample();
      expect(link.line, `${theme}: the link is underlined`).toContain(
        "underline"
      );
      expect(
        underlineRatio(link),
        `${theme}: underline against the page`
      ).toBeGreaterThanOrEqual(3);

      // Control: the old rule-coloured underline is under 3:1.
      await page.addStyleTag({
        content: ".prose a { text-decoration-color: var(--line-strong) }",
      });
      expect(underlineRatio(await sample())).toBeLessThan(3);
    }
  });

  test("one superfamily, within size", async ({ page }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(180_000);

    // Which fallback steps apply, from the perf record.
    const steps = perfRecord().font_fallback_steps;
    expect(Array.isArray(steps), `${PERF} font_fallback_steps`).toBe(true);
    for (const s of steps) expect([1, 2, 3]).toContain(s);

    // What the steps in force imply. Control: steps 2 and 3 make Red Hat Text
    // the heading face, `optional`, with 700 available.
    const config = expectedFontConfig(steps);
    const stepped = expectedFontConfig([2, 3]);
    expect(stepped.headingFace).toBe("Red Hat Text");
    expect(stepped.display).toEqual({
      "Red Hat Display": "swap",
      "Red Hat Text": "optional",
    });
    expect(stepped.weights["Red Hat Text"]).toContain("700");
    // Control: by default only the board's Display weights pass (500 is not
    // one); under step 2 any weight from 600 to 700 does.
    const plain = expectedFontConfig([]);
    expect(allowsHeadingWeight(plain, 500)).toBe(false);
    expect(allowsHeadingWeight(plain, 600)).toBe(true);
    expect(allowsHeadingWeight(stepped, 650)).toBe(true);
    expect(allowsHeadingWeight(stepped, 500)).toBe(false);

    // The font declarations, read from lib/fonts.ts.
    const source = read(FONTS);
    expect(source).not.toMatch(
      /import \{[^}]*Red_Hat[^}]*\} from "next\/font\/google"/
    );
    for (const family of RED_HAT_FAMILIES) {
      expect(source, `${family} loader`).toMatch(
        new RegExp(
          `export const ${PINNED_RED_HAT[family].exportName} = localFont\\(\\{`
        )
      );
    }
    expect(source).toMatch(
      /export const redHatDisplay = __Red_Hat_Display_[0-9a-f]{8};/
    );
    expect(source).toMatch(
      /export const redHatText = __Red_Hat_Text_[0-9a-f]{8};/
    );
    const display = fontOptions(
      source,
      PINNED_RED_HAT["Red Hat Display"].exportName
    );
    const text = fontOptions(source, PINNED_RED_HAT["Red Hat Text"].exportName);
    for (const [name, opts] of [
      ["Red Hat Display", display],
      ["Red Hat Text", text],
    ] as const) {
      // Self-hosted pinned files (PRV-26): one Latin file each, so no subsets.
      expect(optionValue(opts, "subsets"), `${name} subsets`).toBeUndefined();
      expect(
        optionValue(opts, "adjustFontFallback"),
        `${name} adjustFontFallback`
      ).toBe("Arial");
      // The pinned file's whole weight axis, as one range.
      expect(optionValue(opts, "weight"), `${name} weights`).toBe(
        PINNED_RED_HAT[name].range
      );
      expect(optionValue(opts, "style"), `${name} style`).toBe("normal");
      expect(optionValue(opts, "display"), `${name} display`).toBe(
        config.display[name]
      );
      expect(optionValue(opts, "src"), `${name} file`).toBe(
        `../${PINNED_RED_HAT[name].copy}`
      );
    }

    // Code and fragment faces: self-hosted too (PRV-26), with the options
    // they had under next/font/google.
    const mono = fontOptions(source, JETBRAINS_MONO.exportName);
    expect(optionValue(mono, "weight")).toBe("400");
    expect(optionValue(mono, "preload")).toBe(false);
    expect(optionValue(mono, "src")).toBe(`../${JETBRAINS_MONO.copy}`);
    const manrope = fontOptions(source, MANROPE.exportName);
    expect(optionValue(manrope, "preload"), "Manrope preload").toBe(false);
    expect(optionValue(manrope, "src"), "Manrope file").toBe(
      `../${MANROPE.copy}`
    );
    // One variable file: its range covers the board's Manrope weights.
    const [lo, hi] = String(optionValue(manrope, "weight"))
      .split(" ")
      .map(Number);
    for (const w of BOARD_WEIGHTS.Manrope) {
      expect(Number(w) >= lo && Number(w) <= hi, `Manrope serves ${w}`).toBe(
        true
      );
    }

    // IBM Plex Sans: the self-hosted cut, Latin plus the peso sign, at the
    // board's weights (400 to 600, one variable file), not preloaded.
    expect(source).toMatch(/import localFont from "next\/font\/local";/);
    expect(source).not.toMatch(/IBM_Plex_Sans/);
    const plex = fontOptions(source, "ibmPlexSans");
    expect(source).toMatch(/export const ibmPlexSans = localFont\(\{/);
    expect(optionValue(plex, "src"), "IBM Plex Sans file").toBe(
      `../${PLEX_FILE}`
    );
    expect(optionValue(plex, "weight"), "IBM Plex Sans weights").toBe(
      `${BOARD_WEIGHTS["IBM Plex Sans"][0]} ${BOARD_WEIGHTS["IBM Plex Sans"].at(-1)}`
    );
    expect(optionValue(plex, "preload"), "IBM Plex Sans preload").toBe(false);
    expect(optionValue(plex, "display"), "IBM Plex Sans display").toBe("swap");
    // The binary itself: its weight axis and character map, not the
    // declaration above.
    const cut = fontCut(fs.readFileSync(path.join(ROOT, PLEX_FILE)));
    expect(plexCutProblems(cut), "the IBM Plex Sans cut").toEqual([]);
    // Controls: a static cut with the peso sign, a wider axis, a cut without
    // the peso sign and one with an extra script each fail.
    const wght = cut.axes[0];
    const without = (c: number) =>
      new Set([...cut.codepoints].filter((p) => p !== c));
    expect(plexCutProblems({ ...cut, axes: [] })).toEqual([
      "axes [], not wght 400 to 600",
    ]);
    expect(
      plexCutProblems({ ...cut, axes: [{ ...wght, max: 700 }] })
    ).toHaveLength(1);
    expect(plexCutProblems({ ...cut, codepoints: without(0x20b1) })).toEqual([
      "no U+20B1",
    ]);
    expect(
      plexCutProblems({
        ...cut,
        codepoints: new Set([...cut.codepoints, 0x0410]),
      })
    ).toEqual(["outside Latin: U+0410"]);
    const plexBytes = fs.statSync(path.join(ROOT, PLEX_FILE)).size;
    expect(plexBytes, "IBM Plex Sans file size").toBeLessThanOrEqual(40 * KIB);
    expect(
      fs.existsSync(path.join(ROOT, path.dirname(PLEX_FILE), "OFL.txt")),
      "the OFL licence beside the font"
    ).toBe(true);
    // The fragment faces are wired only under [data-fragment].
    const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const variable of ["--font-ibm-plex-sans", "--font-manrope"]) {
      const uses = [
        ...css.matchAll(
          new RegExp(`([^{}]*)\\{[^{}]*var\\(${variable}\\)`, "g")
        ),
      ];
      expect(uses.length, `${variable} is used`).toBeGreaterThan(0);
      for (const use of uses) {
        expect(use[1].trim(), `${variable} only under [data-fragment]`).toMatch(
          /^(\[data-fragment="[a-z-]+"\],?\s*)+$/
        );
      }
    }

    // `/`: the Red Hat pair only, within budget; headings and body in the right face.
    const settle = watchFonts(page);
    await page.goto("/");
    const home = await settle();
    expect(
      home.filter((l) =>
        /Inter|Instrument Serif|JetBrains Mono/i.test(l.family)
      ),
      "Inter, Instrument Serif or JetBrains Mono on /"
    ).toEqual([]);
    expect(
      home.filter((l) => l.family === "unknown"),
      "font files without a face"
    ).toEqual([]);
    const redHat = home.filter((l) =>
      /^Red Hat (Display|Text)$/.test(l.family)
    );
    expect(redHat.length, "Red Hat files on /").toBeLessThanOrEqual(2);
    expect(bytesOf(redHat, /./), "Red Hat bytes on /").toBeLessThanOrEqual(
      90 * KIB
    );

    const rawFaces = await page.evaluate(() => {
      const pick = (el: Element) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          family: s.fontFamily,
          weight: s.fontWeight,
        };
      };
      const fontDisplay: Record<string, string> = {};
      const fontWeights: Record<string, string[]> = {};
      const fontStyles: Record<string, string[]> = {};
      const sizeAdjusted: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSFontFaceRule) {
            const fam = rule.style
              .getPropertyValue("font-family")
              .replace(/["']/g, "");
            if (rule.style.getPropertyValue("size-adjust")) {
              sizeAdjusted.push(fam);
            }
            (fontStyles[fam] ??= []).push(
              rule.style.getPropertyValue("font-style")
            );
            fontDisplay[fam] = rule.style.getPropertyValue("font-display");
            (fontWeights[fam] ??= []).push(
              rule.style.getPropertyValue("font-weight")
            );
          }
        }
      }
      // Site typography only: a fragment draws in its product's face.
      const site = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).filter(
          (el) => !el.closest("[data-fragment]")
        );
      return {
        headings: site("main h1, main h2, main h3").map(pick),
        body: pick(document.body),
        paragraphs: site("main p").slice(0, 5).map(pick),
        fontDisplay,
        fontWeights,
        fontStyles,
        sizeAdjusted,
      };
    });
    const byFamily = <T>(map: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(map).map(([k, v]) => [plainFamily(k), v])
      );
    const faces = {
      headings: rawFaces.headings.map((h) => ({
        ...h,
        family: plainFamily(firstFamily(h.family)),
      })),
      body: {
        ...rawFaces.body,
        family: plainFamily(firstFamily(rawFaces.body.family)),
      },
      paragraphs: rawFaces.paragraphs.map((p) => ({
        ...p,
        family: plainFamily(firstFamily(p.family)),
      })),
      fontDisplay: byFamily(rawFaces.fontDisplay),
      fontWeights: byFamily(rawFaces.fontWeights),
      fontStyles: byFamily(rawFaces.fontStyles),
      sizeAdjusted: rawFaces.sizeAdjusted.map(plainFamily),
    };
    expect(faces.headings.length).toBeGreaterThan(0);
    // The production @font-face rules: normal style and the pinned file's
    // whole weight range, and a size-adjusted fallback face for each family.
    for (const face of ["Red Hat Display", "Red Hat Text"] as const) {
      expect(faces.fontStyles[face], `${face} font-style`).toEqual(["normal"]);
      expect(faces.fontWeights[face], `${face} font-weight`).toEqual([
        PINNED_RED_HAT[face].range,
      ]);
    }
    expect(
      faces.sizeAdjusted
        .filter((f) => /^Red Hat (Display|Text) Fallback$/.test(f))
        .sort(),
      "size-adjusted fallback faces"
    ).toEqual(["Red Hat Display Fallback", "Red Hat Text Fallback"]);

    // The weight range each emitted Red Hat face covers ("400 900" or "600").
    const covers = (family: string, weight: number) =>
      (faces.fontWeights[family] ?? []).some((range) => {
        const [lo, hi = lo] = range.split(/\s+/).map(Number);
        return weight >= lo && weight <= hi;
      });
    for (const h of faces.headings) {
      expect(firstFamily(h.family), `${h.tag} family`).toBe(config.headingFace);
      const weight = Number(h.weight);
      expect(
        allowsHeadingWeight(config, weight),
        `${h.tag} weight ${weight}`
      ).toBe(true);
      expect(
        covers(config.headingFace, weight),
        `${config.headingFace} serves ${weight}`
      ).toBe(true);
    }
    expect(firstFamily(faces.body.family)).toBe("Red Hat Text");
    for (const p of faces.paragraphs)
      expect(firstFamily(p.family)).toBe("Red Hat Text");
    for (const face of ["Red Hat Display", "Red Hat Text"] as const) {
      expect(faces.fontDisplay[face], `${face} font-display`).toBe(
        config.display[face]
      );
    }

    // An exception to the 40 KiB budget counts only if the owner accepted it
    // before this PR: it is read from the PR base, never from this branch. A
    // push build has no PR, so what it carries is already merged.
    const base = prRange()?.base ?? prHead();
    const deviations = gitOk("cat-file", "-e", `${base}:${DEVIATIONS}`)
      ? fragmentFontDeviations(git("show", `${base}:${DEVIATIONS}`))
      : [];
    const faceBytes = (loads: FontLoad[]) =>
      Object.fromEntries(
        Object.entries(FRAGMENT_FAMILY)
          .map(([face, family]) => [
            face,
            bytesOf(loads, new RegExp(`^${family}$`)),
          ])
          .filter(([, bytes]) => (bytes as number) > 0)
      ) as Record<string, number>;
    // Control: 45 KiB of Manrope fails without an accepted deviation, and
    // passes with one that covers it.
    const over = { Manrope: 45 * KIB };
    expect(fontBudgetProblems(over, [])).toHaveLength(1);
    const accepted = {
      face: "Manrope",
      gate: "40 KiB per face",
      bytes: 46_080,
      accepted: true,
    };
    expect(fontBudgetProblems(over, [accepted])).toEqual([]);
    expect(
      fontBudgetProblems(over, [{ ...accepted, accepted: false }])
    ).toHaveLength(1);

    // A fragment face loads only where a fragment that uses it renders, so a
    // route that later renders a fragment (the Range home) stays green, and
    // each face it loads keeps to the budget.
    const fragmentFaces: Record<string, string> = { ...FRAGMENT_FACES };
    for (const route of new Set([...BUDGET_ROUTES, ...SCOPE_ROUTES])) {
      const watch = watchFonts(page);
      await page.goto(route);
      const loads = await watch();
      const rendered = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>("[data-fragment]")
        ).map((el) => el.dataset.fragment ?? "")
      );
      expect(
        unexpectedFragmentFonts(
          loads,
          rendered,
          fragmentFaces,
          FRAGMENT_FAMILIES
        ),
        `fragment faces on ${route}, which renders [${rendered.join(", ")}]`
      ).toEqual([]);
      expect(
        fontBudgetProblems(faceBytes(loads), deviations),
        `fragment faces over budget on ${route}, with no deviation accepted at ${base}`
      ).toEqual([]);
    }
    // Control: Manrope is expected beside a Central Command fragment, and
    // unexpected without one.
    const manropeLoad = [{ family: FRAGMENT_FAMILY.Manrope }];
    expect(
      unexpectedFragmentFonts(
        manropeLoad,
        ["central-command"],
        fragmentFaces,
        FRAGMENT_FAMILIES
      )
    ).toEqual([]);
    expect(
      unexpectedFragmentFonts(manropeLoad, [], fragmentFaces, FRAGMENT_FAMILIES)
    ).toEqual([FRAGMENT_FAMILY.Manrope]);

    // Fixture fragments on `/`: each fragment computes to its face, and each
    // face stays within 40 KiB unless an owner-accepted deviation covers it.
    const fragmentWatch = watchFonts(page);
    await page.goto("/");
    await inject(page, FRAGMENT_FIXTURES);
    const computed = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-fixture]")
      ).flatMap((root) =>
        [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
          .filter((el) =>
            Array.from(el.childNodes).some(
              (n) => n.nodeType === 3 && n.textContent?.trim()
            )
          )
          .map((el) => ({
            fixture: root.dataset.fixture ?? "",
            text: el.textContent?.trim().slice(0, 30) ?? "",
            family: getComputedStyle(el).fontFamily,
          }))
      )
    );
    for (const [fixture, face] of Object.entries(FRAGMENT_FACES)) {
      const texts = computed.filter((c) => c.fixture === fixture);
      expect(texts.length, `text in ${fixture}`).toBeGreaterThan(0);
      for (const c of texts) {
        expect(
          plainFamily(firstFamily(c.family)),
          `${fixture}: "${c.text}"`
        ).toBe(face);
      }
    }
    const withFragments = await fragmentWatch();
    // The fragment faces are self-hosted from PRV-26 on, so their bytes are
    // the ones PRV-26 recorded, not the Google files PRV-2 recorded.
    const recorded = (JSON.parse(read(PERF_26)) as PerfRecord)
      .fragment_font_bytes;
    for (const [face, family] of Object.entries(FRAGMENT_FAMILY)) {
      const bytes = bytesOf(withFragments, new RegExp(`^${family}$`));
      expect(recorded[face], `${PERF} records the ${face} bytes`).toBe(bytes);
      expect(
        bytes,
        `${face} is requested where its fragment renders`
      ).toBeGreaterThan(0);
    }
    expect(
      fontBudgetProblems(faceBytes(withFragments), deviations),
      `fragment faces over budget, with no deviation accepted in ${DEVIATIONS} at ${base}`
    ).toEqual([]);

    // The peso sign renders in the Plex cut itself, not in a fallback face.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: '[data-glyph="peso"]',
    });
    expect(nodeId, "the peso sign in the ledger fixture").toBeGreaterThan(0);
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    expect(
      fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont })),
      "fonts that draw the peso sign"
    ).toEqual([{ family: PLEX_INTERNAL_NAME, custom: true }]);
    await cdp.detach();

    // Code: JetBrains Mono 400 on pre and code only.
    for (const route of [CODE_ROUTE, "/"]) {
      await page.goto(route);
      if (route === "/") {
        await inject(
          page,
          `<p data-fixture="code">Run <code>npm run build</code> first.</p><pre><code>const total = 42;</code></pre>`
        );
      }
      const mono = await page.evaluate(() => {
        const inCode = (el: Element) => el.closest("pre, code") !== null;
        const all = Array.from(document.body.querySelectorAll("*"));
        return {
          code: all
            .filter((el) => el.matches("pre, code"))
            .map((el) => ({
              family: getComputedStyle(el).fontFamily,
              weight: getComputedStyle(el).fontWeight,
            })),
          outside: all
            .filter((el) => !inCode(el) && !el.matches("svg, svg *"))
            .filter((el) =>
              /JetBrains[ _]Mono/.test(
                getComputedStyle(el).fontFamily.split(",")[0]
              )
            )
            .map((el) => el.tagName.toLowerCase()),
        };
      });
      expect(mono.code.length, `code on ${route}`).toBeGreaterThan(0);
      for (const c of mono.code) {
        expect(plainFamily(firstFamily(c.family))).toBe("JetBrains Mono");
        expect(c.weight).toBe("400");
      }
      expect(
        mono.outside,
        `JetBrains Mono outside pre and code on ${route}`
      ).toEqual([]);
    }
  });

  test("labels are sentence case", async ({ page }) => {
    const sample = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            ".label, .subhead, .font-serif"
          )
        ).flatMap((el) =>
          ["label", "subhead", "font-serif"]
            .filter((c) => el.classList.contains(c))
            .map((className) => {
              const s = getComputedStyle(el);
              return {
                where: location.pathname,
                className,
                textTransform: s.textTransform,
                letterSpacing: s.letterSpacing,
                fontSize: s.fontSize,
              };
            })
        )
      );

    const samples: LabelSample[] = [];
    for (const route of BUDGET_ROUTES) {
      await page.goto(route);
      samples.push(...(await sample()));
    }
    expect(
      samples.length,
      "labels, subheads and display text found"
    ).toBeGreaterThan(0);
    expect(nonSentenceCase(samples)).toEqual([]);

    // A fixture label tracked at 0.02em fails.
    await inject(
      page,
      `<p class="label" data-fixture="wide-label" style="letter-spacing: 0.02em">Wide label</p>`
    );
    const fixture = (await sample()).filter((s) => s.className === "label");
    expect(nonSentenceCase(fixture).length).toBeGreaterThan(0);
  });

  test("reduced motion", async ({ page, browserName }) => {
    const run = async (reduced: boolean) => {
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await page.goto("/");
      await inject(page, MOTION_FIXTURES);
      const state = await page.evaluate(() => {
        const motion = document.querySelector<HTMLElement>(
          '[data-fixture="motion"]'
        )!;
        const fade = document.querySelector<HTMLElement>(
          '[data-fixture="fade"]'
        )!;
        const m = getComputedStyle(motion);
        return {
          animationName: m.animationName,
          animations: motion.getAnimations().length,
          fade: fade.dataset.fixture ?? "",
        };
      });
      // The fade: after its first paint, the same element changes opacity.
      const fade = await page.evaluate(async () => {
        const el = document.querySelector<HTMLElement>(
          '[data-fixture="fade"]'
        )!;
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
        el.style.opacity = "0";
        const transitions = el
          .getAnimations()
          .filter((a) => "transitionProperty" in a)
          .map((a) => (a as CSSTransition).transitionProperty);
        return { transitions, opacity: getComputedStyle(el).opacity };
      });
      const transition = await page.evaluate(async () => {
        const start = (
          document as Document & {
            startViewTransition?: (cb: () => void) => {
              ready: Promise<void>;
              finished: Promise<void>;
            };
          }
        ).startViewTransition;
        if (!start) return null;
        const vt = start.call(document, () => {
          const root = document.documentElement;
          root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
        });
        await vt.ready;
        const names = document
          .getAnimations()
          .filter((a) => {
            const effect = a.effect as KeyframeEffect | null;
            return (
              effect?.pseudoElement?.startsWith("::view-transition") ?? false
            );
          })
          .map(
            (a) =>
              `${(a.effect as KeyframeEffect).pseudoElement} ${(a as CSSAnimation).animationName ?? ""}`
          );
        await vt.finished;
        return names;
      });
      return { state, fade, transition };
    };

    const reduced = await run(true);
    expect(reduced.state.animationName).toBe("none");
    expect(reduced.state.animations).toBe(0);
    expect(reduced.fade.transitions, "no fade under reduced motion").toEqual(
      []
    );
    expect(reduced.fade.opacity, "the final opacity at once").toBe("0");

    const full = await run(false);
    expect(full.state.animationName).toBe("rise");
    expect(full.state.animations).toBeGreaterThan(0);
    expect(full.fade.transitions, "the fade runs").toEqual(["opacity"]);
    expect(full.fade.opacity, "mid-fade").not.toBe("0");

    if (browserName === "chromium") {
      expect(reduced.transition, "View Transitions in Chromium").not.toBeNull();
    }
    if (reduced.transition !== null && full.transition !== null) {
      expect(
        reduced.transition,
        "view-transition animations under reduced motion"
      ).toEqual([]);
      expect(
        full.transition.some((a) =>
          /::view-transition-new\(root\) theme-reveal/.test(a)
        )
      ).toBe(true);
    }
  });

  test("focus ring on keyboard only", async ({ page }) => {
    for (const theme of THEMES) {
      await openThemed(page, "/", theme);
      await inject(
        page,
        `<div data-fixture="focus"><button type="button" id="ring-a">First</button> <button type="button" id="ring-b">Second</button></div>`
      );
      const ring = () =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const s = getComputedStyle(el);
          const probe = document.createElement("span");
          probe.style.backgroundColor = "var(--focus)";
          el.append(probe);
          const focus = getComputedStyle(probe).backgroundColor;
          probe.style.backgroundColor = "var(--accent)";
          const accent = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return {
            id: el.id,
            visible: el.matches(":focus-visible"),
            style: s.outlineStyle,
            width: s.outlineWidth,
            offset: s.outlineOffset,
            color: s.outlineColor,
            focus,
            accent,
          };
        });

      // A mouse click shows no ring.
      await page.locator("#ring-a").click();
      const clicked = await ring();
      expect(clicked.visible, `${theme}: click is not focus-visible`).toBe(
        false
      );
      expect(
        clicked.style === "none" || clicked.width === "0px",
        `${theme}: no ring on click`
      ).toBe(true);

      // Keyboard focus on the next control and back on the same one shows the ring.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const keyed = await ring();
      expect(keyed.id).toBe("ring-a");
      expect(keyed.visible).toBe(true);
      expect(keyed.style).toBe("solid");
      expect(keyed.width).toBe("2px");
      expect(keyed.offset).toBe("3px");
      expectColour(keyed.color, keyed.focus, `${theme}: ring uses --focus`);
      expectColour(
        keyed.focus,
        keyed.accent,
        `${theme}: --focus is --accent on the page`
      );
    }
  });

  test("no-JS theme fallback", async ({ browser }, testInfo) => {
    const names = [
      ...themedRows("Root colour tokens").map((r) => r[0]),
      ...themedRows("Status colours").map((r) => r[0]),
      ...table(doc(), "Legacy aliases").map((r) => r.Alias),
      "--focus",
    ];
    expect(names).toContain("--error");
    const resolveIn = async (
      b: Browser,
      js: boolean,
      scheme: Theme,
      pin?: Theme
    ) => {
      const context = await b.newContext({
        baseURL: testInfo.project.use.baseURL,
        javaScriptEnabled: js,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      await page.goto("/");
      if (js) await page.waitForLoadState("networkidle");
      const hasTheme = await page.evaluate(() =>
        document.documentElement.hasAttribute("data-theme")
      );
      if (pin) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, pin);
      }
      const values = await resolveTokens(page, names);
      const root = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          dots: style.getPropertyValue("--dots-opacity").trim(),
          scheme: style.colorScheme,
        };
      });
      await context.close();
      return { hasTheme, values, root };
    };

    for (const theme of THEMES) {
      const noJs = await resolveIn(browser, false, theme);
      expect(noJs.hasTheme, "no data-theme without JavaScript").toBe(false);
      // The explicit theme, set against the opposite system preference.
      const explicit = await resolveIn(
        browser,
        true,
        theme === "light" ? "dark" : "light",
        theme
      );
      for (const name of names) {
        expectColour(
          noJs.values[name],
          explicit.values[name],
          `no-JS ${theme} ${name}`
        );
      }
      expect(noJs.root, `no-JS ${theme} opacity and color-scheme`).toEqual(
        explicit.root
      );
    }
  });

  test("focus ring contrast", async ({ page }) => {
    const sampleRings = (selector: string) =>
      page.evaluate(async (sel) => {
        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>(
            `${sel} :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))`
          )
        );
        const out = [];
        for (const el of focusable) {
          el.focus();
          // Every background behind the control, nearest first, to the root.
          const surfaces: string[] = [];
          for (let p = el.parentElement; p; p = p.parentElement) {
            const bg = getComputedStyle(p).backgroundColor;
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
              surfaces.push(bg);
            }
          }
          const root = el.closest<HTMLElement>("[data-fixture]");
          const style = getComputedStyle(el);
          // Where the outline is painted, against each ancestor that clips.
          const grow =
            parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
          const box = el.getBoundingClientRect();
          let clipped = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (ps.overflowX === "visible" && ps.overflowY === "visible") {
              continue;
            }
            const r = p.getBoundingClientRect();
            const [left, top] = [r.left + p.clientLeft, r.top + p.clientTop];
            const [right, bottom] = [
              left + p.clientWidth,
              top + p.clientHeight,
            ];
            if (
              box.left - grow < left - 0.5 ||
              box.top - grow < top - 0.5 ||
              box.right + grow > right + 0.5 ||
              box.bottom + grow > bottom + 0.5
            ) {
              clipped = true;
            }
          }
          out.push({
            name: `${root?.dataset.fixture}: ${el.textContent?.trim()}`,
            focused:
              document.activeElement === el && el.matches(":focus-visible"),
            painted: el.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            }),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            ring: style.outlineColor,
            clipped,
            surfaces,
          });
        }
        return out;
      }, selector);

    for (const theme of THEMES) {
      await openThemed(page, "/", theme);
      await inject(page, FRAGMENT_FIXTURES + LOW_RING_FIXTURE);
      // A keypress first, so programmatic focus counts as keyboard focus.
      await page.keyboard.press("Shift");

      const rings = await sampleRings(
        "[data-fragment]:not([data-fragment='low-ring-fixture'])"
      );
      expect(rings.length).toBeGreaterThanOrEqual(5);
      expect(rings.some((r) => r.name.startsWith("turntable"))).toBe(true);
      expect(ringProblems(rings), `${theme}: unpainted or under 3:1`).toEqual(
        []
      );

      // A ring below 3:1, a removed outline, a control at opacity 0 (its
      // own or its parent's) and a ring clipped by its wrapper all fail.
      const broken = await sampleRings("[data-fragment='low-ring-fixture']");
      expect(broken).toHaveLength(5);
      const problems = ringProblems(broken);
      expect(problems).toHaveLength(5);
      expect(problems.some((p) => p.includes("no outline"))).toBe(true);
      expect(problems.filter((p) => p.includes("not painted"))).toHaveLength(2);
      expect(problems).toContain(
        "clipped-ring: Clipped ring: clipped by an ancestor"
      );
    }

    // Control: a translucent surface is composited, not refused. A black ring
    // on 90% white over white is 21:1; a white ring there is 1:1.
    const onFrosted = (ring: string) => ({
      name: `${ring} on frosted white`,
      focused: true,
      painted: true,
      outlineStyle: "solid",
      outlineWidth: "2px",
      ring,
      clipped: false,
      surfaces: ["rgba(255, 255, 255, 0.9)", "rgb(255, 255, 255)"],
    });
    expect(ringProblems([onFrosted("rgb(0, 0, 0)")])).toEqual([]);
    expect(ringProblems([onFrosted("rgb(255, 255, 255)")])).toHaveLength(1);
  });

  test("LCP within budget at the measured sha", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    // Controls: an infinite LCP beside two finite ones would leave a
    // plausible median; it fails, as do a zero LCP and a missing value.
    const [run] = perfRecord().runs;
    expect(
      perfRunProblems(
        JSON.parse(
          `[{"perf":100,"a11y":98,"lcp_ms":1e309,"cls":0},${JSON.stringify(run)},${JSON.stringify(run)}]`
        ) as Array<Record<string, unknown>>
      )
    ).toEqual(["run 1 lcp_ms is not a finite number"]);
    expect(perfRunProblems([{ ...run, lcp_ms: 0 }])).toEqual([
      "run 1 lcp_ms is not positive",
    ]);
    expect(perfRunProblems([{ ...run, cls: undefined }])).toEqual([
      "run 1 cls is not a finite number",
    ]);

    // Controls for the measured-commit gate: a file moved out of `public/`
    // into `docs/`, and a removed one, both show as production changes.
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "prv26-prod-"));
    try {
      const inRepo = (...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd: tmpRepo, stdio: "ignore", env: gitEnv() }
        );
      inRepo("init", "-q");
      fs.mkdirSync(path.join(tmpRepo, "public"));
      fs.mkdirSync(path.join(tmpRepo, "docs"));
      fs.writeFileSync(
        path.join(tmpRepo, "public/a.txt"),
        "moved\n".repeat(30)
      );
      fs.writeFileSync(
        path.join(tmpRepo, "public/b.txt"),
        "removed\n".repeat(30)
      );
      inRepo("add", "-A");
      inRepo("commit", "-q", "--no-verify", "-m", "before");
      inRepo("mv", "public/a.txt", "docs/a.txt");
      inRepo("rm", "-q", "public/b.txt");
      inRepo("commit", "-q", "--no-verify", "-m", "after");
      expect(productionChanges("HEAD~1", "HEAD", tmpRepo).sort()).toEqual([
        "public/a.txt",
        "public/b.txt",
      ]);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }

    // Both records (PRV-2's and PRV-26's) are validated on every execution,
    // and the 3.8 s gate applies to the median recomputed from the runs.
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    for (const file of [PERF, PERF_26]) {
      const perf = JSON.parse(read(file)) as PerfRecord;
      expect(perf.measured_sha, `${file} measured_sha`).toMatch(
        /^[0-9a-f]{40}$/
      );
      expect(perf.route, `${file} route`).toBe("/");
      expect(perf.lighthouse_version, `${file} lighthouse`).toMatch(
        /^\d+\.\d+\.\d+$/
      );
      expect(perf.runs, `${file} runs`).toHaveLength(3);
      expect(perfRunProblems(perf.runs), `${file} runs`).toEqual([]);
      for (const key of ["perf", "a11y", "lcp_ms", "cls"] as const) {
        expect(perf.median[key], `${file} median ${key}`).toBeCloseTo(
          median(perf.runs.map((r) => r[key])),
          6
        );
      }
      expect(
        median(perf.runs.map((r) => r.lcp_ms)),
        `${file} median LCP on /`
      ).toBeLessThanOrEqual(3800);
    }

    // PRV-1's rule: a record binds only the PR that changes it. A later PR
    // that leaves it alone is checked against the thresholds above, never
    // against the record's measured commit.
    // Controls: a push build has no PR, and a PR whose base already holds
    // these records does not bind them.
    const sha = prHead();
    expect(prRange({ CI: "true", PR_HEAD_SHA: "" })).toBeNull();
    expect(prRange({ CI: "true", PR_HEAD_SHA: sha, PR_BASE_SHA: sha })).toEqual(
      { base: sha, head: sha }
    );
    for (const file of [PERF, PERF_26]) {
      expect(
        perfBinding({ CI: "true", PR_HEAD_SHA: sha, PR_BASE_SHA: sha }, file)
      ).toBe(null);
    }
    for (const file of [PERF, PERF_26]) {
      const range = perfBinding(process.env, file);
      if (!range) {
        testInfo.annotations.push({
          type: "not bound",
          description: `${prRange() ? `this PR does not change ${file}` : NO_PR}, so only the thresholds are asserted.`,
        });
        continue;
      }
      const { head } = range;
      const perf = JSON.parse(read(file)) as PerfRecord;

      // This PR changes the record, so it binds: measured at an ancestor of
      // the head, with no code change since. A rebase rewrites the measured
      // commit; re-measure then, as below.
      const remeasure = [
        `Re-measure at ${head}:`,
        "npm run build, then npx next start -p <port>;",
        `run npx -y lighthouse@${perf.lighthouse_version} http://localhost:<port>/ --only-categories=performance,accessibility three times;`,
        `write the three runs and their median to ${file} with measured_sha set to the commit measured;`,
        "commit that file alone, on top.",
      ].join(" ");
      expect(
        gitOk("merge-base", "--is-ancestor", perf.measured_sha, head),
        `${perf.measured_sha} is not an ancestor of ${head}. ${remeasure}`
      ).toBe(true);
      const changed = productionChanges(perf.measured_sha, head);
      expect(
        changed,
        `code changed since ${perf.measured_sha}. ${remeasure}`
      ).toEqual([]);
    }
  });

  test("red hat files match the boards' pins", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(600_000);
    const pins = latinPins();
    const source = read(FONTS);

    // The pins are the Latin faces of google.css, one per family.
    for (const family of RED_HAT_FAMILIES) {
      expect(pins[family], `${family} Latin pin in google.css`).toBeDefined();
    }
    expect(pins["Red Hat Display"].file).not.toBe(pins["Red Hat Text"].file);

    // The declarations use next/font/local and the checked-in copies, which
    // are the pinned bytes; the licences are the originals.
    for (const family of RED_HAT_FAMILIES) {
      const pinned = PINNED_RED_HAT[family];
      const exportName = pinned.exportName;
      expect(source, `${family} loader`).toMatch(
        new RegExp(`export const ${exportName} = localFont\\(\\{`)
      );
      expect(optionValue(fontOptions(source, exportName), "src")).toBe(
        `../${pinned.copy}`
      );
      expect(
        sha256Of(fs.readFileSync(path.join(ROOT, pinned.copy))),
        `${family} copy is its pin`
      ).toBe(pins[family].sha256);
      expect(
        read(pinned.licence) === read(pinned.original),
        `${family} licence is the original`
      ).toBe(true);
    }
    expect(source).toMatch(/import localFont from "next\/font\/local";/);

    // The Type section says where both fonts come from.
    const type = doc().sections.get("Type") ?? "";
    expect(type, "Type section").toMatch(/next\/font\/local/);
    for (const family of RED_HAT_FAMILIES) {
      expect(type, `Type names the ${family} copy`).toContain(
        path.dirname(PINNED_RED_HAT[family].copy)
      );
    }
    expect(type, "Type names the pinned source").toContain(
      "docs/boards/fonts/google.css"
    );

    // A fresh load of the production build of `/`: one successful response
    // per Red Hat family, and its bytes are the family's pin.
    const settle = watchFonts(page);
    await page.goto("/");
    const loads = await settle();
    expect(redHatPinProblems(loads, pins)).toEqual([]);
    // Controls: other bytes, a second response and a failed response each fail.
    const own = loads.filter((l) => l.family === "Red Hat Display");
    expect(
      redHatPinProblems(
        loads.map((l) => (l === own[0] ? { ...l, sha256: "0".repeat(64) } : l)),
        pins
      )
    ).toHaveLength(1);
    expect(redHatPinProblems([...loads, own[0]], pins)).toHaveLength(1);
    expect(
      redHatPinProblems(
        loads.map((l) => (l === own[0] ? { ...l, status: 404 } : l)),
        pins
      )
    ).toHaveLength(1);

    // Manrope and JetBrains Mono (PRV-26 amendment): nothing comes from
    // next/font/google; the Manrope copy is its board pin and the JetBrains
    // Mono copy is the SHA-256 recorded in the ticket.
    expect(source).not.toMatch(/from\s+["']next\/font\/google["']/);
    expect(
      sha256Of(fs.readFileSync(path.join(ROOT, MANROPE.copy))),
      "Manrope copy is its pin"
    ).toBe(pins.Manrope.sha256);
    expect(read(MANROPE.licence) === read(MANROPE.original)).toBe(true);
    expect(
      sha256Of(fs.readFileSync(path.join(ROOT, JETBRAINS_MONO.copy))),
      "JetBrains Mono copy is its recorded SHA-256"
    ).toBe(JETBRAINS_MONO.sha256);
    expect(read(JETBRAINS_MONO.licence)).toMatch(
      /Copyright .*The JetBrains Mono Project Authors/
    );
    expect(read(JETBRAINS_MONO.licence)).toMatch(
      /SIL OPEN FONT LICENSE Version 1\.1/
    );
    const ticket = read(TICKET_26);
    expect(ticket, "ticket records the JetBrains Mono SHA-256").toContain(
      JETBRAINS_MONO.sha256
    );
    expect(ticket, "ticket records the JetBrains Mono source").toContain(
      JETBRAINS_MONO.source
    );
    // Served bytes, on every sampled route: each face is fetched once where
    // its element renders (a Manrope fragment, a `pre` or `code`) and never
    // elsewhere, and every response is the face's pin. What renders is read
    // from the page itself, so a route that later renders a fragment on `/`
    // stays green.
    const shas = {
      Manrope: pins.Manrope.sha256,
      "JetBrains Mono": JETBRAINS_MONO.sha256,
    };
    // A home page that renders a Manrope fragment, as the Range homepage will
    // (a proxy appends one to the home document).
    const fragmentRow = "[data-prv26-manrope-row]";
    const fragmentMarkup =
      '<div data-fragment="central-command" data-prv26-manrope-row>' +
      "<p>Day feed, 12 November</p></div>";
    const scopeOf = async (target: string, markup?: string) => {
      const sample = await page.context().newPage();
      try {
        const settle = watchFonts(sample);
        await sample.goto(target);
        if (markup) await inject(sample, markup);
        const found = await settle();
        const scope = await sample.evaluate<FontScope>(() => ({
          manrope: Array.from(
            document.querySelectorAll<HTMLElement>("[data-fragment]")
          ).some((el) =>
            ["central-command", "habit-tracker"].includes(
              el.dataset.fragment ?? ""
            )
          ),
          mono: document.querySelector("pre, code") !== null,
        }));
        return { loads: found, scope };
      } finally {
        await sample.close();
      }
    };
    const sampled = [
      ...new Set(["/", CODE_ROUTE, ...BUDGET_ROUTES, ...SCOPE_ROUTES]),
    ];
    for (const target of sampled) {
      const { loads: found, scope } = await scopeOf(target);
      expect(
        fontScopeProblems(found, scope, shas),
        `Manrope and JetBrains Mono on ${target}, which renders ${JSON.stringify(scope)}`
      ).toEqual([]);
    }
    // Every font file the production build emits is a pinned file (the Red
    // Hat and Manrope board pins, the recorded JetBrains Mono SHA-256) or the
    // IBM Plex Sans cut: a wrong-byte face on a route no sample visits cannot
    // be there.
    const allowedFonts: Record<string, string> = {
      "Red Hat Display": pins["Red Hat Display"].sha256,
      "Red Hat Text": pins["Red Hat Text"].sha256,
      Manrope: pins.Manrope.sha256,
      "JetBrains Mono": JETBRAINS_MONO.sha256,
      "IBM Plex Sans": sha256Of(fs.readFileSync(path.join(ROOT, PLEX_FILE))),
    };
    const emitted = emittedFonts();
    expect(emitted.length, "font files in the build output").toBeGreaterThan(0);
    expect(
      emittedFontProblems(emitted, allowedFonts),
      "emitted font files"
    ).toEqual([]);
    // Controls: a file with other bytes, and a missing pinned file, each fail.
    expect(
      emittedFontProblems(
        [...emitted, { file: "x.woff2", sha256: "0".repeat(64) }],
        allowedFonts
      )
    ).toHaveLength(1);
    expect(emittedFontProblems(emitted.slice(1), allowedFonts)).toHaveLength(1);
    const injected = await scopeOf("/", FRAGMENT_FIXTURES);
    expect(
      injected.scope.manrope,
      "the fixtures render a Manrope fragment"
    ).toBe(true);
    expect(
      injected.loads.filter((l) => l.family === "Manrope"),
      "Manrope beside the fixtures"
    ).toHaveLength(1);
    expect(fontScopeProblems(injected.loads, injected.scope, shas)).toEqual([]);
    const fragmentHome = await swapFontProxy(baseURL!, null, fragmentMarkup);
    try {
      const native = await scopeOf(`${fragmentHome.url}/`);
      expect(native.scope, "the proxied home renders a fragment").toEqual({
        manrope: true,
        mono: false,
      });
      expect(
        fontScopeProblems(native.loads, native.scope, shas),
        "Manrope where `/` itself renders a fragment"
      ).toEqual([]);
      expect(
        native.loads.filter((l) => l.family === "Manrope"),
        "Manrope on a home that renders a fragment"
      ).toHaveLength(1);
    } finally {
      await fragmentHome.close();
    }
    const codePage = await scopeOf(CODE_ROUTE);
    expect(codePage.scope.mono, "the code route renders code").toBe(true);
    expect(
      codePage.loads.filter((l) => l.family === "JetBrains Mono"),
      "JetBrains Mono on the code route"
    ).toHaveLength(1);
    // Controls: a face where nothing renders it, a face with other bytes, a
    // failed response and a missing face each fail.
    const manropeLoad = injected.loads.find((l) => l.family === "Manrope")!;
    const monoLoad = codePage.loads.find((l) => l.family === "JetBrains Mono")!;
    const none: FontScope = { manrope: false, mono: false };
    expect(fontScopeProblems([manropeLoad], none, shas)).toHaveLength(1);
    expect(fontScopeProblems([monoLoad], none, shas)).toHaveLength(1);
    expect(
      fontScopeProblems(
        [{ ...manropeLoad, sha256: "0".repeat(64) }],
        { ...none, manrope: true },
        shas
      )
    ).toHaveLength(1);
    expect(
      fontScopeProblems(
        [{ ...monoLoad, status: 404 }],
        { ...none, mono: true },
        shas
      )
    ).toHaveLength(1);
    expect(
      fontScopeProblems([], { ...none, manrope: true }, shas)
    ).toHaveLength(1);
    // A Manrope response on a code page is caught, not filtered away.
    expect(
      fontScopeProblems(
        [...codePage.loads, manropeLoad],
        { ...none, mono: true },
        shas
      )
    ).toHaveLength(1);

    // The fidelity harness, on the production build of `/`: an in-memory
    // `chrome/header` row marked built, with a selector that matches the
    // rendered header, reports no font failure for either family.
    const dir = path.resolve("docs/boards");
    const loaded = loadBoards(dir).sections;
    const row = loaded.rows.find((r) => r.id === "chrome/header");
    expect(row, "chrome/header row in sections.json").toBeDefined();
    const withRow = (site: string) => ({
      ...loaded,
      rows: loaded.rows.map((r) =>
        r.id === "chrome/header" ? { ...r, built: true, site } : r
      ),
    });
    const sections = withRow("header");
    // The selector is checked on `/`, the route the row is measured on.
    const homePage = await page.context().newPage();
    await homePage.goto("/");
    expect(
      await homePage.locator("header").count(),
      "headers on /"
    ).toBeGreaterThan(0);
    await homePage.close();
    const only = {
      rows: ["chrome/header"],
      widths: ["1440" as const],
      themes: ["light" as const],
      states: ["default"],
      rm: false,
    };
    const fontFailures = (
      failures: Awaited<ReturnType<typeof checkSite>>["failures"],
      family: string
    ) =>
      failures.filter((f) =>
        f.property.toLowerCase().startsWith(`font ${family.toLowerCase()}`)
      );
    const notDrawn = (
      failures: Awaited<ReturnType<typeof checkSite>>["failures"]
    ) =>
      failures.filter(
        (f) => f.section === "chrome/header" && f.property === "drawn"
      );
    const clean = await checkSite({
      dir,
      baseURL: baseURL!,
      browser,
      only,
      boards: { sections },
    });
    expect(
      clean.checked.filter((c) => c.startsWith("chrome/header ")),
      "comparisons made for chrome/header"
    ).not.toHaveLength(0);
    expect(notDrawn(clean.failures), "the header is drawn on /").toEqual([]);
    for (const family of RED_HAT_FAMILIES) {
      expect(
        fontFailures(clean.failures, family),
        `${family} failures`
      ).toEqual([]);
    }
    // Control: a selector that matches nothing is reported as not drawn, so
    // the assertion above does detect a row the harness could not capture.
    const missing = await checkSite({
      dir,
      baseURL: baseURL!,
      browser,
      only,
      boards: { sections: withRow("[data-prv26-no-such-element]") },
    });
    expect(notDrawn(missing.failures), "a missing header").not.toHaveLength(0);

    // Control: the same run against a server that answers each family's
    // request with other bytes (the other family's file, a valid font that is
    // not that family's pin) fails for that family.
    const bytesOfPin = (family: RedHatFamily) =>
      fs.readFileSync(path.join(ROOT, PINNED_RED_HAT[family].copy));
    for (const family of RED_HAT_FAMILIES) {
      const other = RED_HAT_FAMILIES.find((f) => f !== family) as RedHatFamily;
      const proxy = await swapFontProxy(baseURL!, {
        sha256: pins[family].sha256,
        body: bytesOfPin(other),
      });
      try {
        const control = await checkSite({
          dir,
          baseURL: proxy.url,
          browser,
          only,
          boards: { sections },
        });
        expect(proxy.swapped(), `${family} bytes were swapped`).toBeGreaterThan(
          0
        );
        expect(
          fontFailures(control.failures, family),
          `${family} control failures`
        ).not.toHaveLength(0);
      } finally {
        await proxy.close();
      }
    }

    // Manrope through the same harness: no page renders a Manrope fragment
    // yet, so a proxy appends one to the home document, and the in-memory row
    // is that element. Served as is, the harness reports no Manrope failure;
    // with the proxy swapping Manrope's bytes it reports one.
    const manropeSections = withRow(fragmentRow);
    const manropeRun = async (
      swap: { sha256: string; body: Uint8Array } | null
    ) => {
      const proxy = await swapFontProxy(baseURL!, swap, fragmentMarkup);
      try {
        const result = await checkSite({
          dir,
          baseURL: proxy.url,
          browser,
          only,
          boards: { sections: manropeSections },
        });
        return { result, swapped: proxy.swapped() };
      } finally {
        await proxy.close();
      }
    };
    const manropeClean = await manropeRun(null);
    expect(
      manropeClean.result.checked.filter((c) => c.startsWith("chrome/header ")),
      "comparisons made for the Manrope row"
    ).not.toHaveLength(0);
    expect(notDrawn(manropeClean.result.failures), "the Manrope row").toEqual(
      []
    );
    expect(
      fontFailures(manropeClean.result.failures, "Manrope"),
      "Manrope failures"
    ).toEqual([]);
    const manropeSwapped = await manropeRun({
      sha256: pins.Manrope.sha256,
      body: bytesOfPin("Red Hat Text"),
    });
    expect(
      manropeSwapped.swapped,
      "Manrope bytes were swapped"
    ).toBeGreaterThan(0);
    expect(
      fontFailures(manropeSwapped.result.failures, "Manrope"),
      "Manrope control failures"
    ).not.toHaveLength(0);
  });

  test("changes stay within PRV-26 scope", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    const range = prRange();
    test.skip(!range, `${NO_PR}: PRV-26's scope is checked on its own PR.`);
    const { base, head } = range as PrRange;
    test.skip(
      gitOk("cat-file", "-e", `${base}:${TICKET_26}`),
      `${base} already holds ${TICKET_26}: PRV-26's scope is checked on its own PR.`
    );
    expect(
      gitOk("cat-file", "-e", `${head}:${TICKET_26}`),
      "the PR introduces its ticket"
    ).toBe(true);

    // Files: only Scope's, both paths of a rename.
    expect(
      changedFiles(base, head).filter(
        (f) =>
          !SCOPE_26.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
      ),
      "files changed outside PRV-26's Scope"
    ).toEqual([]);
    const moved = fs.mkdtempSync(path.join(os.tmpdir(), "prv26-rename-"));
    try {
      const inRepo = (...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd: moved, stdio: "ignore", env: gitEnv() }
        );
      inRepo("init", "-q");
      fs.writeFileSync(path.join(moved, "README.md"), "outside\n".repeat(20));
      inRepo("add", "README.md");
      inRepo("commit", "-q", "--no-verify", "-m", "before");
      fs.mkdirSync(path.join(moved, "app/fonts/red-hat-text"), {
        recursive: true,
      });
      inRepo("mv", "README.md", "app/fonts/red-hat-text/OFL.txt");
      inRepo("commit", "-q", "--no-verify", "-m", "after");
      expect(
        changedFiles("HEAD~1", "HEAD", moved).sort(),
        "both paths of a rename"
      ).toEqual(["README.md", "app/fonts/red-hat-text/OFL.txt"]);
    } finally {
      fs.rmSync(moved, { recursive: true, force: true });
    }

    // The other faces. IBM Plex Sans is unchanged. Manrope and JetBrains Mono
    // may change loader and source (PRV-26 amendment), but their options stay
    // as at the base, and nothing imports next/font/google.
    const before = git("show", `${base}:${FONTS}`);
    const after = git("show", `${head}:${FONTS}`);
    expect(
      declaration(after, "ibmPlexSans"),
      "ibmPlexSans at the head"
    ).toBeDefined();
    expect(declaration(after, "ibmPlexSans"), "ibmPlexSans unchanged").toBe(
      declaration(before, "ibmPlexSans")
    );
    // The complete option lists, key by key. The documented differences are
    // the loader, the source file, `subsets` (a local file has no subsets),
    // `style: "normal"`, an explicit fallback setting, and Manrope's one
    // variable range for its four listed weights; everything else is equal.
    const optionMap = astOptions;
    const normalised = (map: Record<string, string>, drop: readonly string[]) =>
      Object.fromEntries(
        Object.entries(map).filter(([k]) => !drop.includes(k))
      );
    const monoProblems = (headSource: string) => {
      const head = optionMap(headSource, JETBRAINS_MONO.exportName);
      const base = optionMap(before, "jetbrainsMono");
      const problems: string[] = [];
      if (head.adjustFontFallback !== "false")
        problems.push("adjustFontFallback is not false");
      if (head.style !== '"normal"') problems.push("style is not normal");
      // By key and value, whatever the order the keys are written in.
      const same = sameOptions(
        normalised(head, ["src", "style", "adjustFontFallback"]),
        normalised(base, ["subsets"])
      );
      if (!same) problems.push("options differ from the base");
      return problems;
    };
    expect(monoProblems(after), "JetBrains Mono options").toEqual([]);
    const manropeBase = optionMap(before, "manrope");
    const manropeHead = optionMap(after, MANROPE.exportName);
    expect(manropeHead.adjustFontFallback, "Manrope fallback").toBe('"Arial"');
    expect(manropeHead.style).toBe('"normal"');
    expect(
      normalised(manropeHead, ["src", "style", "adjustFontFallback", "weight"]),
      "Manrope options"
    ).toEqual(normalised(manropeBase, ["subsets", "weight"]));
    // The base listed four weights; the one variable file covers them all.
    const listed = Array.from(manropeBase.weight.matchAll(/\d+/g), (m) =>
      Number(m[0])
    );
    const [lo, hi] = manropeHead.weight
      .replace(/"/g, "")
      .split(" ")
      .map(Number);
    expect(listed).toHaveLength(4);
    for (const w of listed) expect(w >= lo && w <= hi).toBe(true);
    expect(after).not.toMatch(/from\s+["']next\/font\/google["']/);
    // Controls: a fallback face for JetBrains Mono, another changed option, and
    // a changed loader on IBM Plex Sans each fail.
    expect(
      monoProblems(
        after.replace(
          "adjustFontFallback: false",
          'adjustFontFallback: "Arial"'
        )
      )
    ).not.toEqual([]);
    expect(
      monoProblems(after.replace('weight: "400",', 'weight: "500",'))
    ).not.toEqual([]);
    // A quoted key is read like an unquoted one, so an extra `"fallback"`
    // option fails; reordering unchanged options does not.
    expect(
      monoProblems(
        after.replace(
          "adjustFontFallback: false,",
          'adjustFontFallback: false,\n  "fallback": ["Arial"],'
        )
      )
    ).not.toEqual([]);
    const reordered = after.replace(
      '  display: "swap",\n  preload: false,\n  adjustFontFallback: false,',
      '  preload: false,\n  adjustFontFallback: false,\n  display: "swap",'
    );
    expect(reordered, "the reorder control changes the source").not.toBe(after);
    expect(monoProblems(reordered), "reordered options").toEqual([]);
    expect(
      declaration(
        after.replace(
          '= localFont({\n  src: "../app/fonts/ibm',
          '= Manrope({\n  src: "../app/fonts/ibm'
        ),
        "ibmPlexSans"
      )
    ).not.toBe(declaration(after, "ibmPlexSans"));
  });

  test("board motion rules are present", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    const css = read(CSS);
    expect(missingMotionRules(css)).toEqual([]);
    // A missing keyframe fails.
    expect(missingMotionRules(withoutKeyframes(css, "turn"))).toEqual([
      "@keyframes turn",
    ]);
    // A body that no longer animates fails: the turntable ending where it
    // starts, and a rise that stays transparent.
    expect(css).toContain("rotateY(396deg)");
    expect(
      missingMotionRules(css.replace("rotateY(396deg)", "rotateY(36deg)"))
    ).toEqual(["@keyframes turn as the boards draw it"]);
    const stillRise = css.replace(
      /(@keyframes rise \{[\s\S]*?to \{\s*opacity: )1/,
      "$10"
    );
    expect(stillRise).not.toBe(css);
    expect(missingMotionRules(stillRise)).toEqual([
      "@keyframes rise as the boards draw it",
    ]);
  });

  test("shared surfaces and icons match Range", async ({ page }, testInfo) => {
    chromiumOnly(testInfo);
    expect(read(CSS)).not.toMatch(/grain|mottle|feTurbulence/i);
    expect(read("app/layout.tsx")).not.toMatch(/grain|mottle|feTurbulence/i);

    await page.goto("/");
    const overlays = await page.evaluate(() => {
      const found: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (/grain|mottle|feTurbulence/i.test(rule.cssText))
              found.push(rule.cssText.slice(0, 80));
          }
        } catch {
          // cross-origin
        }
      }
      for (const pseudo of ["::before", "::after"]) {
        const s = getComputedStyle(document.body, pseudo);
        if (s.content !== "none" && s.backgroundImage !== "none")
          found.push(`body${pseudo}`);
      }
      if (document.querySelector("feTurbulence"))
        found.push("feTurbulence element");
      return found;
    });
    expect(overlays).toEqual([]);

    // Control: a CSS icon source in a diff is caught.
    expect(
      addedIconSources(
        [
          '+  mask: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E");',
          "+  background-image: url(/icons/arrow.svg);",
          '+  mask-image: url("data:image/png;base64,iVBORw0KGgo=");',
          "+  -webkit-mask: url(/icons/arrow.png) no-repeat;",
          "+  color: var(--ink);",
        ].join("\n")
      )
    ).toHaveLength(4);

    // The diff checks belong to PRV-2's own PR (PRV-1's rule): a later PR,
    // whose base already holds this suite, skips them.
    const own = ownPr();
    if ("skip" in own) {
      testInfo.annotations.push({
        type: "skip",
        description: `${own.skip}: PRV-2's icon diff checks run on its own PR.`,
      });
      return;
    }
    const base = own.range.base;
    expect(introducesSuite(own.range.head), "the gate closes once merged").toBe(
      false
    );

    // The diff adds no dependency and no icon source.
    const deps = (json: string) => {
      const pkg = JSON.parse(json) as Record<string, Record<string, string>>;
      return Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      });
    };
    const before = new Set(deps(git("show", `${base}:package.json`)));
    expect(
      deps(read("package.json")).filter((d) => !before.has(d)),
      "dependencies added"
    ).toEqual([]);
    const added = git("diff", "--name-only", "--diff-filter=A", base)
      .split("\n")
      .filter(Boolean);
    expect(
      added.filter(
        (f) => /\.(svg|ico)$/i.test(f) || /icon/i.test(path.basename(f))
      )
    ).toEqual([]);
    const codeDiff = git("diff", base, "--", "app", "components", "lib");
    expect(codeDiff).not.toMatch(
      /^\+.*from ["'](?!lucide-react)[^"']*icons?[^"']*["']/m
    );
    expect(addedIconSources(codeDiff), "icon sources added").toEqual([]);
  });

  test("design system documentation covers the scoped inventory", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    const markdown = read(DOC);
    const css = read(CSS);
    expect(docGaps(markdown, liveAliases(css))).toEqual([]);

    // PRV-18 deletes an unused alias and its row: the rest still hold.
    const lessPaper = css.replace(/^\s*--paper: var\(--gallery\);\n/m, "");
    expect(Object.keys(liveAliases(lessPaper))).toHaveLength(5);
    expect(
      docGaps(withoutRow(markdown, "--paper"), liveAliases(lessPaper))
    ).toEqual([]);

    // An entry removed from the doc fails.
    expect(docGaps(withoutRow(markdown, "--frag-cc-news"))).toContain(
      "Product palettes: --frag-cc-news"
    );
    expect(docGaps(withoutRow(markdown, "--paper"))).toContain(
      "Legacy aliases: --paper -> --gallery"
    );
    expect(docGaps(withoutSection(markdown, "Lab tag"))).toContain(
      "Components: Lab tag"
    );
    // A component that keeps its heading and citation but loses a detail.
    const inSection = (
      heading: string,
      edit: (body: string) => string
    ): string => {
      const start = markdown.indexOf(`### ${heading}\n`);
      const end = markdown.indexOf("\n### ", start + 1);
      expect(start, heading).toBeGreaterThanOrEqual(0);
      const body = markdown.slice(start, end);
      const edited = edit(body);
      expect(edited, `${heading} edited`).not.toBe(body);
      return markdown.slice(0, start) + edited + markdown.slice(end);
    };
    expect(
      docGaps(inSection("Lab tag", (b) => b.replace("dashed", "solid")))
    ).toContain('Components: Lab tag says "dashed"');
    // A changed dimension fails too, with the heading and citation kept.
    expect(
      docGaps(
        inSection("Lab tag", (b) =>
          b.replace("0 0.375rem padding", "0 0.5rem padding")
        )
      )
    ).toContain('Components: Lab tag says "0 0.375rem padding"');
    expect(
      docGaps(inSection("Lab tag", (b) => b.replace("a 4px", "a 6px")))
    ).toContain('Components: Lab tag says "a 4px radius"');
    // A component that cites an unrelated board instead of its own.
    const recited = inSection("Chip row", (b) =>
      b.replace("`range-phone`", "`pages-404-desktop`")
    );
    expect(docGaps(recited)).toEqual(
      expect.arrayContaining([
        "Components: Chip row cites range-phone",
        "Components: Chip row cites an unrelated board pages-404-desktop",
      ])
    );
    // The dot fields' opacity, changed.
    expect(
      docGaps(markdown.replace("`0.55` in light", "`0.4` in light"))
    ).toContain("Root colour tokens: --dots-opacity 0.55 / 0.7");
    expect(
      docGaps(withoutSection(markdown, "Font fallback")).length
    ).toBeGreaterThan(0);
    // Blank weight and loading cells, a deleted shadow and a placeholder
    // fallback each fail.
    expect(
      docGaps(
        markdown.replace(
          "| 400, 600, 700         |",
          "|                       |"
        )
      )
    ).toContain(
      "Type: Red Hat Display weights 400, 600, 700, loading variable, Latin, display: 'swap', preload"
    );
    expect(
      docGaps(
        markdown.replace(
          "Latin, `preload: false`                         |",
          "                                                |"
        )
      )
    ).toContain(
      "Type: JetBrains Mono weights 400, loading Latin, preload: false"
    );
    expect(
      docGaps(
        markdown.replace(/ The tab pill casts[\s\S]*?\(`shadow-pill`\)\./, "")
      )
    ).toContain(
      "Shape: The tab pill casts `0 8px 20px -12px rgba(0,0,0,0.35)` (`shadow-pill`)"
    );
    expect(
      docGaps(
        markdown.replace(
          "| final state at first paint                     |",
          "| TBD                                            |"
        )
      )
    ).toContain("Motion: Load with its fallback");
    expect(
      docGaps(markdown.replace("`rise` (560 ms", "`rise` (TBD"))
    ).toContain("Motion: Load with its fallback");

    // Nothing private: PRV-1's denylist finds nothing in the doc, and the doc
    // cites boards by name, never by file or by a local address.
    expect(scanText(DOC, markdown)).toEqual([]);
    expect(markdown).not.toMatch(/\/Users\/|\.dc\.html|localhost/);
  });

  test("changes stay within PRV-2 scope", async ({ browser }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(420_000);
    // PRV-1's rule: PRV-2's scope binds PRV-2's own PR, the one whose base
    // has no copy of this suite. Every later PR, and every push build, skips it.
    const own = ownPr();
    test.skip(
      "skip" in own,
      `${"skip" in own ? own.skip : ""}: PRV-2's scope is checked on its own PR.`
    );
    const { base, head } = (own as { range: PrRange }).range;
    expect(introducesSuite(head), "the gate closes once merged").toBe(false);

    // Controls: hidden text is not counted as content, and the same path on
    // another origin is a different destination.
    const probe = await browser.newPage({
      baseURL: String(testInfo.project.use.baseURL),
    });
    await probe.goto("/");
    await probe.evaluate(() => {
      for (const style of [
        "display: none",
        "visibility: hidden",
        "opacity: 0",
      ]) {
        const p = document.createElement("p");
        p.style.cssText = style;
        p.textContent = "PRV2 hidden probe";
        document.body.append(p);
      }
    });
    expect(await probe.evaluate(visibleText)).not.toContain(
      "PRV2 hidden probe"
    );
    await probe.close();
    expect(normalizeDestination("mailto:hello@studiosc.dev", [])).not.toBe(
      normalizeDestination("sms:hello@studiosc.dev", [])
    );
    expect(
      normalizeDestination("https://elsewhere.example/work?x=1#a", [
        "http://localhost:1",
      ])
    ).not.toBe(
      normalizeDestination("http://localhost:1/work?x=1#a", [
        "http://localhost:1",
      ])
    );

    // Files: only Scope's, and never the deviations log (owner, 2026-11-24).
    // The PR head against its base, as PRV-1's scope check does: what a local
    // run writes into the working tree is not part of the PR.
    expect(SCOPE_FILES as readonly string[]).not.toContain(DEVIATIONS);
    expect(
      outsideScope(changedFiles(base, head)),
      "files changed outside PRV-2's Scope"
    ).toEqual([]);

    // Control: a file moved from outside Scope into an allowed directory
    // counts at its source too, as PRV-1's --no-renames does.
    const moved = fs.mkdtempSync(path.join(os.tmpdir(), "prv2-rename-"));
    try {
      const inRepo = (...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.invalid",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd: moved, stdio: "ignore", env: gitEnv() }
        );
      inRepo("init", "-q");
      fs.writeFileSync(path.join(moved, "README.md"), "outside\n".repeat(20));
      inRepo("add", "README.md");
      inRepo("commit", "-q", "--no-verify", "-m", "before");
      fs.mkdirSync(path.join(moved, "e2e/fixtures/design-tokens"), {
        recursive: true,
      });
      inRepo("mv", "README.md", "e2e/fixtures/design-tokens/README.md");
      inRepo("commit", "-q", "--no-verify", "-m", "after");
      expect(
        outsideScope(changedFiles("HEAD~1", "HEAD", moved)),
        "a rename's source"
      ).toEqual(["README.md"]);
    } finally {
      fs.rmSync(moved, { recursive: true, force: true });
    }

    // Routes: the base, built from the PR base, against this server.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prv2-base-"));
    let server: ChildProcess | undefined;
    try {
      execFileSync("sh", ["-c", `git archive ${base} | tar -x -C "${dir}"`], {
        cwd: ROOT,
      });
      fs.symlinkSync(
        path.join(ROOT, "node_modules"),
        path.join(dir, "node_modules")
      );
      const env = {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        // The same placeholder CI builds with; the contact form is not exercised.
        RESEND_API_KEY: process.env.RESEND_API_KEY ?? "dummy-key-for-build",
      };
      // Webpack, as Turbopack refuses a node_modules symlink outside the root.
      execFileSync(
        path.join(dir, "node_modules/.bin/next"),
        ["build", "--webpack"],
        {
          cwd: dir,
          env,
          stdio: "ignore",
        }
      );
      const port = await freePort();
      server = spawn(
        path.join(dir, "node_modules/.bin/next"),
        ["start", "-p", String(port)],
        {
          cwd: dir,
          env,
          stdio: "ignore",
        }
      );
      const baseURL = `http://localhost:${port}`;
      await waitFor(baseURL);
      const headURL = String(testInfo.project.use.baseURL);
      const origins = [new URL(baseURL).origin, new URL(headURL).origin];
      const dest = (url: string) => normalizeDestination(url, origins);

      // What a visitor sees: text whose element is rendered and not hidden,
      // every link resolved against the page, and whether each in-page
      // target exists.
      const snapshot = async (origin: string, route: string, phone = false) => {
        const context = await browser.newContext({
          baseURL: origin,
          ...(phone ? { viewport: { width: 390, height: 844 } } : {}),
        });
        const page = await context.newPage();
        const response = await page.goto(route);
        await page.waitForLoadState("networkidle");
        if (phone) {
          await page.getByRole("button", { name: "Toggle menu" }).click();
          await page.waitForFunction(() => {
            const menu = document.getElementById("mobile-menu");
            return !!menu && getComputedStyle(menu).opacity === "1";
          });
        }
        const text = await settledText(page);
        const result = await page.evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>("a[href]")
          );
          return { links: anchors.map((a) => a.href) };
        });
        await context.close();
        return {
          status: response?.status() ?? 0,
          text,
          links: result.links.map(dest),
          absolute: result.links,
        };
      };
      // The navigation a visitor uses: each header link (the open menu on a
      // phone) clicked on the rendered page, and where the click lands. A
      // link that cannot be clicked, or lands elsewhere, differs from the base.
      const activate = async (
        origin: string,
        route: string,
        phone: boolean,
        opts: { css?: string; limit?: number } = {}
      ) => {
        const context = await browser.newContext({
          baseURL: origin,
          ...(phone ? { viewport: { width: 390, height: 844 } } : {}),
        });
        const page = await context.newPage();
        const selector = phone ? "#mobile-menu a[href]" : "header a[href]";
        const open = async () => {
          await page.goto(route);
          await page.waitForLoadState("networkidle");
          if (opts.css) await page.addStyleTag({ content: opts.css });
          if (phone) {
            await page.getByRole("button", { name: "Toggle menu" }).click();
            await page.waitForFunction(() => {
              const menu = document.getElementById("mobile-menu");
              return !!menu && getComputedStyle(menu).opacity === "1";
            });
          }
        };
        const landed: string[] = [];
        await open();
        const count = Math.min(
          await page.locator(selector).count(),
          opts.limit ?? Infinity
        );
        for (let i = 0; i < count; i++) {
          if (i > 0) await open();
          const link = page.locator(selector).nth(i);
          const href = await link.evaluate(
            (a) => (a as HTMLAnchorElement).href
          );
          if (!(await link.isVisible())) {
            landed.push(`hidden ${dest(href)}`);
          } else if (new URL(href).origin !== new URL(origin).origin) {
            landed.push(dest(href));
          } else {
            try {
              await link.click({ timeout: 3000 });
              await page
                .waitForURL(href, { timeout: 5000 })
                .catch(() => undefined);
              await page.waitForLoadState("networkidle");
              landed.push(`${dest(href)} lands on ${dest(page.url())}`);
            } catch {
              landed.push(`${dest(href)} cannot be clicked`);
            }
          }
        }
        await context.close();
        return landed;
      };
      // Control: navigation a stylesheet makes unclickable is caught, though
      // its text and href are unchanged.
      const [blocked] = await activate(headURL, "/", false, {
        css: "header nav { pointer-events: none }",
        limit: 1,
      });
      expect(blocked).toMatch(/cannot be clicked$/);

      // Whether the page at `url` has the element its fragment names.
      const targetOf = async (url: string) => {
        const id = decodeURIComponent(new URL(url).hash.slice(1));
        const page = await browser.newPage();
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        const found = await page.evaluate(
          (i) => !!document.getElementById(i),
          id
        );
        await page.close();
        return found ? "exists" : "missing";
      };
      const resolveLink = async (url: string) => {
        const context = await browser.newContext();
        const response = await context.request.get(url, { maxRedirects: 10 });
        const final = finalWithFragment(response.url(), url);
        await context.close();
        const status = response.status();
        // A link to a fragment is followed to its page, and the target checked.
        const target =
          status === 200 && new URL(final).hash ? await targetOf(final) : null;
        return { status, to: dest(final), target };
      };
      // Controls: a redirect's own fragment survives, and a followed link to
      // a missing target is caught.
      expect(
        finalWithFragment("http://h.test/a#redirected", "http://h.test/b#asked")
      ).toBe("http://h.test/a#redirected");
      expect(
        finalWithFragment("http://h.test/a", "http://h.test/b#asked")
      ).toBe("http://h.test/a#asked");
      expect(await targetOf(`${headURL}/about#seth`)).toBe("exists");
      expect(await targetOf(`${headURL}/about#prv2-missing`)).toBe("missing");

      const views = [
        ...SCOPE_ROUTES.map((route) => ({ route, phone: false })),
        { route: "/", phone: true },
      ];
      for (const { route, phone } of views) {
        const label = phone ? `${route} (phone, menu open)` : route;
        const [before, after] = [
          await snapshot(baseURL, route, phone),
          await snapshot(headURL, route, phone),
        ];
        expect(after.status, `${label} still renders`).toBe(before.status);
        expect(after.text, `${label} visible text`).toBe(before.text);
        expect(after.links, `${label} link destinations`).toEqual(before.links);
        const navBefore = await activate(baseURL, route, phone);
        expect(
          navBefore.some((l) => l.includes(" lands on ")),
          `${label}: the base has navigation to click`
        ).toBe(true);
        expect(
          await activate(headURL, route, phone),
          `${label} navigation, clicked`
        ).toEqual(navBefore);

        // Each link on either test server, followed to its final URL.
        const local = (list: string[]) =>
          list.filter((u) => origins.includes(new URL(u).origin));
        const [bLinks, aLinks] = [
          local(before.absolute),
          local(after.absolute),
        ];
        for (let i = 0; i < bLinks.length; i++) {
          const [b, a] = [
            await resolveLink(bLinks[i]),
            await resolveLink(aLinks[i]),
          ];
          const name = `${label} -> ${dest(bLinks[i])}`;
          if (b.status === 200) {
            expect(a, name).toEqual(b);
          } else {
            // A route a later ticket builds keeps its existing status.
            expect(a.status, name).toBe(b.status);
          }
        }
      }
    } finally {
      server?.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("one-time checks skip a branch cut before PRV-2", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    // A merge ref carries this suite though the branch's head does not: the
    // head is the commit before the suite arrived, the base one that holds it.
    const added = git("log", "--diff-filter=A", "--format=%H", "--", SPEC_FILE)
      .split("\n")
      .filter(Boolean)
      .at(-1)!;
    const before = git("rev-parse", `${added}^`);
    expect(introducesSuite(before)).toBe(true);
    expect(introducesSuite(added)).toBe(false);
    const oldBranch = {
      CI: "true",
      GITHUB_EVENT_NAME: "pull_request",
      PR_BASE_SHA: added,
      PR_HEAD_SHA: before,
    };
    expect(ownPr(oldBranch)).toEqual({
      skip: `${added} already holds ${SPEC_FILE}`,
    });
    expect(perfBinding(oldBranch)).toBeNull();
    // PRV-2's own PR still binds both.
    const own = { ...oldBranch, PR_BASE_SHA: before, PR_HEAD_SHA: added };
    expect(ownPr(own)).toEqual({ range: { base: before, head: added } });
  });
});

// ---------------------------------------------------------------------------

/**
 * The text a visitor sees, run in the page: text nodes whose element is
 * rendered, visible and not transparent, whitespace collapsed.
 */
function visibleText(): string {
  const skip = "script, style, noscript, template, nextjs-portal";
  const parts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(skip)) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      continue;
    parts.push(n.textContent ?? "");
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The visible text once entrance animations have finished: no animation
 * running and the same text on three reads 300ms apart (10s at most), so a
 * card still fading in on one server is not read as missing content.
 */
async function settledText(page: Page): Promise<string> {
  const until = Date.now() + 10_000;
  let last = "";
  let same = 0;
  while (Date.now() < until) {
    const [text, running] = await Promise.all([
      page.evaluate(visibleText),
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length
      ),
    ]);
    same = text === last && running === 0 ? same + 1 : 0;
    last = text;
    if (same >= 2) return text;
    await page.waitForTimeout(300);
  }
  return last;
}

const TICKET_26 = "docs/tickets/PRV-26.md";
const SCOPE_26 = [
  "lib/fonts.ts",
  "app/fonts/red-hat-display/red-hat-display-latin.woff2",
  "app/fonts/red-hat-display/OFL.txt",
  "app/fonts/red-hat-text/red-hat-text-latin.woff2",
  "app/fonts/red-hat-text/OFL.txt",
  "app/fonts/manrope/manrope-latin.woff2",
  "app/fonts/manrope/OFL.txt",
  "app/fonts/jetbrains-mono/jetbrains-mono-latin.woff2",
  "app/fonts/jetbrains-mono/OFL.txt",
  "e2e/design-tokens.spec.ts",
  "docs/design-system.md",
  "docs/perf/prv-26.json",
  TICKET_26,
] as const;

/** One whole `export const <name> = <loader>({ ... });` declaration, or undefined. */
function declaration(source: string, name: string): string | undefined {
  return new RegExp(
    `export const ${name} = [A-Za-z_]+\\(\\{[\\s\\S]*?\\}\\);`
  ).exec(source)?.[0];
}

/**
 * The option object of `export const <name> = <loader>({ ... })`, read from the
 * TypeScript syntax tree: each key (quoted or not) to its value, strings as
 * JSON and anything else as its source with whitespace collapsed. A spread or
 * a computed key becomes an entry of its own, so it can never match.
 */
function astOptions(source: string, name: string): Record<string, string> {
  const file = ts.createSourceFile(
    "fonts.ts",
    source,
    ts.ScriptTarget.Latest,
    true
  );
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const arg = node.initializer.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) found = arg;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!found) throw new Error(`lib/fonts.ts has no options for ${name}`);
  const out: Record<string, string> = {};
  found.properties.forEach((prop, i) => {
    const key =
      ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)
        ? ts.isIdentifier(prop.name) ||
          ts.isStringLiteralLike(prop.name) ||
          ts.isNumericLiteral(prop.name)
          ? prop.name.text
          : `<computed ${i}>`
        : `<unsupported ${i}>`;
    out[key] = ts.isPropertyAssignment(prop)
      ? ts.isStringLiteralLike(prop.initializer)
        ? JSON.stringify(prop.initializer.text)
        : prop.initializer.getText(file).replace(/\s+/g, " ")
      : prop.getText(file).replace(/\s+/g, " ");
  });
  return out;
}

/** Two option objects with the same keys and values, in any order. */
function sameOptions(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return (
    ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
  );
}

/**
 * The font files a production build emits (everything under `.next/static`
 * and `public/` with a font extension) that are not among the allowed hashes,
 * and the allowed hashes no emitted file has.
 */
function emittedFontProblems(
  files: ReadonlyArray<{ file: string; sha256: string }>,
  allowed: Record<string, string>
): string[] {
  const names = new Map(Object.entries(allowed).map(([n, h]) => [h, n]));
  const problems = files
    .filter((f) => !names.has(f.sha256))
    .map((f) => `${f.file} (${f.sha256}) is not a pinned or allowed font`);
  const seen = new Set(files.map((f) => f.sha256));
  for (const [name, hash] of Object.entries(allowed)) {
    if (!seen.has(hash)) problems.push(`${name} is not emitted by the build`);
  }
  return problems;
}

function emittedFonts(): Array<{ file: string; sha256: string }> {
  const out: Array<{ file: string; sha256: string }> = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(woff2?|ttf|otf|eot)$/i.test(entry.name)) {
        out.push({
          file: path.relative(ROOT, full),
          sha256: sha256Of(fs.readFileSync(full)),
        });
      }
    }
  };
  walk(path.join(ROOT, ".next/static"));
  walk(path.join(ROOT, "public"));
  return out;
}

/** What a route renders that decides which of the two pinned faces it may load. */
interface FontScope {
  /** A Central Command or habit-tracker fragment: the Manrope fragments. */
  manrope: boolean;
  /** A `pre` or `code` element: JetBrains Mono's only use. */
  mono: boolean;
}

/**
 * What is wrong with the Manrope and JetBrains Mono responses of one page,
 * given what the page renders: each face is fetched exactly once where its
 * element renders and never elsewhere, and every response is a 2xx whose bytes
 * are the face's pin (Manrope: the board's; JetBrains Mono: the ticket's).
 */
function fontScopeProblems(
  loads: readonly FontLoad[],
  scope: FontScope,
  shas: { Manrope: string; "JetBrains Mono": string }
): string[] {
  const problems: string[] = [];
  const wants = { Manrope: scope.manrope, "JetBrains Mono": scope.mono };
  for (const family of ["Manrope", "JetBrains Mono"] as const) {
    const own = loads.filter((l) => l.family === family);
    if (own.length !== (wants[family] ? 1 : 0)) {
      problems.push(
        `${family}: ${own.length} responses where ${wants[family] ? "one is" : "none are"} expected`
      );
    }
    for (const l of own) {
      if (l.status < 200 || l.status >= 300) {
        problems.push(`${family}: status ${l.status}`);
      } else if (l.sha256 !== shas[family]) {
        problems.push(`${family}: sha256 ${l.sha256} is not its pin`);
      }
    }
  }
  return problems;
}

/**
 * A proxy in front of the site that answers a request for the font file with
 * the given sha256 with other bytes: how the control run serves unpinned bytes.
 */
async function swapFontProxy(
  target: string,
  swap: { sha256: string; body: Uint8Array } | null,
  appendToHome?: string
): Promise<{ url: string; swapped: () => number; close: () => Promise<void> }> {
  let swapped = 0;
  const server = http.createServer((req, res) => {
    void (async () => {
      const upstream = await fetch(new URL(req.url ?? "/", target), {
        headers: { accept: String(req.headers.accept ?? "*/*") },
        redirect: "manual",
      });
      let body: Uint8Array = Buffer.from(await upstream.arrayBuffer());
      if (swap && sha256Of(Buffer.from(body)) === swap.sha256) {
        body = swap.body;
        swapped += 1;
      }
      // The home document with markup appended: a page that renders a fragment.
      if (
        appendToHome &&
        req.url === "/" &&
        /text\/html/.test(upstream.headers.get("content-type") ?? "")
      ) {
        body = Buffer.from(
          Buffer.from(body)
            .toString("utf8")
            .replace("</body>", `${appendToHome}</body>`)
        );
      }
      const headers: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(key))
          headers[key] = value;
      });
      headers["content-length"] = String(body.length);
      res.writeHead(upstream.status, headers);
      res.end(body);
    })().catch(() => {
      res.writeHead(502);
      res.end();
    });
  });
  const port = await freePort();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve)
  );
  return {
    url: `http://127.0.0.1:${port}`,
    swapped: () => swapped,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      srv.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject()
      );
    });
  });
}

async function waitFor(url: string, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not start`);
}
