import { execFileSync, spawn, type ChildProcess } from "node:child_process";
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

import {
  addedIconSources,
  docGaps,
  expectedFontConfig,
  normalizeDestination,
  ringProblems,
  unexpectedFragmentFonts,
  failingPairings,
  firstFamily,
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
const DEVIATIONS = "docs/boards/deviations.md";
/** The self-hosted IBM Plex Sans cut, and the name inside the file (see lib/fonts.ts). */
const PLEX_FILE = "app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2";
const PLEX_INTERNAL_NAME = "SSC Fragment Sans";
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
 * Resolves colour tokens to computed rgb, through a probe inside `scope`, so
 * `var()` chains and context overrides apply. Without a scope the probe sits
 * directly on <html>, so it reads the values `:root` declares and nothing a
 * descendant overrides.
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
      const probe = document.createElement("span");
      parent.append(probe);
      const out: Record<string, string> = {};
      for (const name of names) {
        probe.style.backgroundColor = "";
        probe.style.backgroundColor = `var(${name})`;
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
        family: families[r.url()] ?? "unknown",
        url: r.url(),
        bytes: body.length,
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

/** git, without any GIT_* variable a hook might have set. */
function git(...args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))
  );
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: env as NodeJS.ProcessEnv,
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
function prBase(): string {
  return process.env.PR_BASE_SHA || git("merge-base", "origin/main", "HEAD");
}

/** The commit under test: PR_HEAD_SHA when CI passes it, else HEAD. */
function prHead(): string {
  return git("rev-parse", process.env.PR_HEAD_SHA || "HEAD");
}

const SPEC_FILE = "e2e/design-tokens.spec.ts";

/**
 * PRV-1's convention for checks bound to one PR: PRV-2's own diff checks run
 * only on the PR that introduces this suite, the one whose base has no copy
 * of it. On every later PR they skip, with a reason.
 */
function introducesSuite(base: string): boolean {
  return !gitOk("cat-file", "-e", `${base}:${SPEC_FILE}`);
}

/** Whether `file` differs between two commits (or is new at `head`). */
function changedBetween(base: string, head: string, file: string): boolean {
  return !gitOk("diff", "--quiet", base, head, "--", file);
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
    expect(aliases).toHaveLength(6);

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

    // The font declarations, read from lib/fonts.ts.
    const source = read(FONTS);
    const display = fontOptions(source, "redHatDisplay");
    const text = fontOptions(source, "redHatText");
    for (const [name, opts] of [
      ["Red Hat Display", display],
      ["Red Hat Text", text],
    ] as const) {
      expect(optionValue(opts, "subsets"), `${name} subsets`).toEqual([
        "latin",
      ]);
      expect(
        optionValue(opts, "adjustFontFallback"),
        `${name} adjustFontFallback`
      ).toBe(true);
      const weights = optionValue(opts, "weight");
      if (steps.includes(1)) {
        expect(
          Array.isArray(weights),
          `step 1 trims ${name} to listed weights`
        ).toBe(true);
        for (const w of weights as string[])
          expect(config.weights[name]).toContain(w);
      }
      expect(optionValue(opts, "display"), `${name} display`).toBe(
        config.display[name]
      );
    }

    const mono = fontOptions(source, "jetbrainsMono");
    expect(optionValue(mono, "weight")).toBe("400");
    expect(optionValue(mono, "preload")).toBe(false);
    expect(optionValue(mono, "subsets")).toEqual(["latin"]);
    const manrope = fontOptions(source, "manrope");
    expect(optionValue(manrope, "subsets"), "Manrope subsets").toEqual([
      "latin",
    ]);
    expect(optionValue(manrope, "preload"), "Manrope preload").toBe(false);
    expect(optionValue(manrope, "weight"), "Manrope weights").toEqual([
      ...BOARD_WEIGHTS.Manrope,
    ]);

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

    const faces = await page.evaluate(() => {
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
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSFontFaceRule) {
            const fam = rule.style
              .getPropertyValue("font-family")
              .replace(/["']/g, "");
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
      };
    });
    expect(faces.headings.length).toBeGreaterThan(0);
    // The weight range each emitted Red Hat face covers ("400 900" or "600").
    const covers = (family: string, weight: number) =>
      (faces.fontWeights[family] ?? []).some((range) => {
        const [lo, hi = lo] = range.split(/\s+/).map(Number);
        return weight >= lo && weight <= hi;
      });
    for (const h of faces.headings) {
      expect(firstFamily(h.family), `${h.tag} family`).toBe(config.headingFace);
      const weight = Number(h.weight);
      expect(weight, `${h.tag} weight`).toBeGreaterThanOrEqual(
        config.headingWeights[0]
      );
      expect(weight, `${h.tag} weight`).toBeLessThanOrEqual(
        config.headingWeights[1]
      );
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

    // A fragment face loads only where a fragment that uses it renders, so a
    // route that later renders a fragment (the Range home) stays green.
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
        expect(firstFamily(c.family), `${fixture}: "${c.text}"`).toBe(face);
      }
    }
    const withFragments = await fragmentWatch();
    // An exception counts only if the owner accepted it before this PR: it
    // is read from the PR base, never from this branch.
    const base = prBase();
    const deviations = gitOk("cat-file", "-e", `${base}:${DEVIATIONS}`)
      ? fragmentFontDeviations(git("show", `${base}:${DEVIATIONS}`))
      : [];
    const recorded = perfRecord().fragment_font_bytes;
    for (const [face, family] of Object.entries(FRAGMENT_FAMILY)) {
      const bytes = bytesOf(withFragments, new RegExp(`^${family}$`));
      expect(recorded[face], `${PERF} records the ${face} bytes`).toBe(bytes);
      expect(
        bytes,
        `${face} is requested where its fragment renders`
      ).toBeGreaterThan(0);
      if (bytes > 40 * KIB) {
        const deviation = deviations.find((d) => d.face === face);
        expect(
          deviation,
          `${face} is ${bytes} bytes on a fragment route, over 40 KiB, with no accepted deviation in ${DEVIATIONS} at the PR base`
        ).toBeDefined();
        expect(
          deviation!.gate,
          `${face} deviation names the failed gate`
        ).toMatch(/40 KiB/);
        expect(
          deviation!.bytes,
          `${face} deviation records the measured cost`
        ).toBeGreaterThanOrEqual(bytes);
        expect(
          deviation!.accepted,
          `${face} deviation is accepted by the owner`
        ).toBe(true);
      }
    }

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
              /JetBrains Mono/.test(
                getComputedStyle(el).fontFamily.split(",")[0]
              )
            )
            .map((el) => el.tagName.toLowerCase()),
        };
      });
      expect(mono.code.length, `code on ${route}`).toBeGreaterThan(0);
      for (const c of mono.code) {
        expect(firstFamily(c.family)).toBe("JetBrains Mono");
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
          let surface = "rgb(255, 255, 255)";
          for (let p = el.parentElement; p; p = p.parentElement) {
            const bg = getComputedStyle(p).backgroundColor;
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
              surface = bg;
              break;
            }
          }
          const root = el.closest<HTMLElement>("[data-fixture]");
          const style = getComputedStyle(el);
          out.push({
            name: `${root?.dataset.fixture}: ${el.textContent?.trim()}`,
            focused:
              document.activeElement === el && el.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            ring: style.outlineColor,
            surface,
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

      // A ring below 3:1 and a removed outline both fail the same check.
      const broken = await sampleRings("[data-fragment='low-ring-fixture']");
      expect(broken).toHaveLength(2);
      const problems = ringProblems(broken);
      expect(problems).toHaveLength(2);
      expect(problems.some((p) => p.includes("no outline"))).toBe(true);
    }
  });

  test("LCP within budget at the measured sha", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    const perf = perfRecord();
    expect(perf.measured_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(perf.route).toBe("/");
    expect(perf.lighthouse_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(perf.runs).toHaveLength(3);
    for (const run of perf.runs) {
      for (const key of ["perf", "a11y", "lcp_ms", "cls"] as const) {
        expect(typeof run[key], `run ${key}`).toBe("number");
      }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    for (const key of ["perf", "a11y", "lcp_ms", "cls"] as const) {
      expect(perf.median[key], `median ${key}`).toBeCloseTo(
        median(perf.runs.map((r) => r[key])),
        6
      );
    }
    expect(perf.median.lcp_ms, "median LCP on /").toBeLessThanOrEqual(3800);

    // PRV-1's rule: the record binds only the PR that changes it. A later PR
    // that leaves it alone is checked against the thresholds above, never
    // against PRV-2's measured commit.
    const [base, head] = [prBase(), prHead()];
    // Control: a PR whose base already holds this record does not bind it.
    expect(changedBetween(head, head, PERF)).toBe(false);
    if (!changedBetween(base, head, PERF)) {
      testInfo.annotations.push({
        type: "not bound",
        description: `${PERF} is unchanged against ${base}, so only the thresholds are asserted.`,
      });
      return;
    }

    // This PR changes the record, so it binds: measured at an ancestor of the
    // head, with no code change since. A rebase rewrites the measured commit;
    // re-measure then, as below.
    const remeasure = [
      `Re-measure at ${head}:`,
      "npm run build, then npx next start -p <port>;",
      `run npx -y lighthouse@${perf.lighthouse_version} http://localhost:<port>/ --only-categories=performance,accessibility three times;`,
      `write the three runs and their median to ${PERF} with measured_sha set to the commit measured;`,
      "commit that file alone, on top.",
    ].join(" ");
    expect(
      gitOk("merge-base", "--is-ancestor", perf.measured_sha, head),
      `${perf.measured_sha} is not an ancestor of ${head}. ${remeasure}`
    ).toBe(true);
    const changed = git("diff", "--name-only", perf.measured_sha, head)
      .split("\n")
      .filter((f) => /^(app|components|content|lib|public)\//.test(f));
    expect(
      changed,
      `code changed since ${perf.measured_sha}. ${remeasure}`
    ).toEqual([]);
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
          "+  color: var(--ink);",
        ].join("\n")
      )
    ).toHaveLength(2);

    // The diff checks belong to PRV-2's own PR (PRV-1's rule): a later PR,
    // whose base already holds this suite, skips them.
    const base = prBase();
    expect(introducesSuite(prHead()), "the gate closes once merged").toBe(
      false
    );
    if (!introducesSuite(base)) {
      testInfo.annotations.push({
        type: "skip",
        description: `${base} already holds ${SPEC_FILE}: PRV-2's icon diff checks ran on its own PR.`,
      });
      return;
    }

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
    expect(docGaps(markdown)).toEqual([]);

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

    // Nothing private: the doc cites boards by name, never by location.
    expect(markdown).not.toMatch(
      /\/(home|srv|tmp|Users)\/|\.dc\.html|LAB_[D]OMAIN|localhost/
    );
  });

  test("changes stay within PRV-2 scope", async ({ browser }, testInfo) => {
    chromiumOnly(testInfo);
    test.setTimeout(420_000);
    const base = prBase();

    // PRV-1's rule: PRV-2's scope binds PRV-2's own PR, the one whose base
    // has no copy of this suite. Every later PR skips it.
    expect(introducesSuite(prHead()), "the gate closes once merged").toBe(
      false
    );
    test.skip(
      !introducesSuite(base),
      `${base} already holds ${SPEC_FILE}: PRV-2's scope was checked on its own PR.`
    );

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
    expect(SCOPE_FILES as readonly string[]).not.toContain(DEVIATIONS);
    const changed = git("diff", "--name-only", base)
      .split("\n")
      .filter(Boolean);
    const outside = changed.filter(
      (f) =>
        !SCOPE_FILES.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
    );
    expect(outside, "files changed outside PRV-2's Scope").toEqual([]);

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
        const text = await page.evaluate(visibleText);
        const result = await page.evaluate(() => {
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>("a[href]")
          );
          return {
            links: anchors.map((a) => a.href),
            targets: anchors
              .filter(
                (a) =>
                  a.hash &&
                  a.origin === location.origin &&
                  a.pathname === location.pathname
              )
              .map(
                (a) =>
                  `${a.hash} ${document.getElementById(decodeURIComponent(a.hash.slice(1))) ? "exists" : "missing"}`
              ),
          };
        });
        await context.close();
        return {
          status: response?.status() ?? 0,
          text,
          links: result.links.map(dest),
          absolute: result.links,
          targets: result.targets,
        };
      };
      const resolveLink = async (url: string) => {
        const context = await browser.newContext();
        const response = await context.request.get(url, { maxRedirects: 10 });
        const final = new URL(response.url());
        final.hash = new URL(url).hash;
        await context.close();
        return { status: response.status(), to: dest(final.href) };
      };

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
        expect(after.targets, `${label} in-page targets`).toEqual(
          before.targets
        );

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
