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
  contrast,
  docGaps,
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
  REQUIRED_PAIRINGS,
  RETIRED_DARK_TOKENS,
  SCOPE_FILES,
  SCOPE_ROUTES,
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
 * Resolves colour tokens to computed rgb, through a probe inside `scope`
 * (the page when omitted), so `var()` chains and context overrides apply.
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
        : document.body;
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

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/** The PR base: PR_BASE_SHA when CI passes it, else the merge base with origin/main. */
function prBase(): string {
  return process.env.PR_BASE_SHA || git("merge-base", "origin/main", "HEAD");
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

      // Context tokens, each read on its fixture.
      await inject(page, FRAGMENT_FIXTURES);
      const scopes: Record<string, string | undefined> = {
        ":root": undefined,
        "[data-fragment]": '[data-fixture="tallyandtrace"]',
        '[data-stage="turntable"]': '[data-stage="turntable"]',
      };
      const contexts = table(doc(), "Context tokens");
      expect(contexts.length).toBeGreaterThanOrEqual(CONTEXT_TOKENS.length);
      for (const c of contexts) {
        expect(c.Context in scopes, `fixture for ${c.Context}`).toBe(true);
        const value = (await resolveTokens(page, [c.Token], scopes[c.Context]))[
          c.Token
        ];
        expectColour(
          value,
          i === 1 ? c.Light : c.Dark,
          `${theme} ${c.Token} in ${c.Context}`
        );
      }

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
          expect(BOARD_WEIGHTS[name]).toContain(w);
      }
    }
    expect(optionValue(display, "display")).toBe(
      steps.includes(3) ? "optional" : "swap"
    );
    expect(optionValue(text, "display")).toBe("swap");

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
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSFontFaceRule) {
            const fam = rule.style
              .getPropertyValue("font-family")
              .replace(/["']/g, "");
            fontDisplay[fam] = rule.style.getPropertyValue("font-display");
          }
        }
      }
      return {
        headings: Array.from(
          document.querySelectorAll("main h1, main h2, main h3")
        ).map(pick),
        body: pick(document.body),
        paragraphs: Array.from(document.querySelectorAll("main p"))
          .slice(0, 5)
          .map(pick),
        fontDisplay,
      };
    });
    expect(faces.headings.length).toBeGreaterThan(0);
    for (const h of faces.headings) {
      if (steps.includes(2)) {
        expect(firstFamily(h.family), `${h.tag} family`).toBe("Red Hat Text");
        expect(Number(h.weight)).toBeGreaterThanOrEqual(600);
        expect(Number(h.weight)).toBeLessThanOrEqual(700);
      } else {
        expect(firstFamily(h.family), `${h.tag} family`).toBe(
          "Red Hat Display"
        );
        expect(BOARD_WEIGHTS["Red Hat Display"], `${h.tag} weight`).toContain(
          h.weight
        );
      }
    }
    expect(firstFamily(faces.body.family)).toBe("Red Hat Text");
    for (const p of faces.paragraphs)
      expect(firstFamily(p.family)).toBe("Red Hat Text");
    expect(faces.fontDisplay["Red Hat Display"]).toBe(
      steps.includes(3) ? "optional" : "swap"
    );
    expect(faces.fontDisplay["Red Hat Text"]).toBe("swap");

    // No fragment face and no code face on any page without a fragment or code.
    for (const route of new Set([...BUDGET_ROUTES, ...SCOPE_ROUTES])) {
      if (route === "/blog/tallyandtrace-performance") continue; // a post: checked for code below
      const watch = watchFonts(page);
      await page.goto(route);
      const loads = await watch();
      expect(
        loads.filter((l) => FRAGMENT_FAMILIES.includes(l.family)),
        `fragment faces on ${route}`
      ).toEqual([]);
    }

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
    const deviations = fs.existsSync(path.join(ROOT, DEVIATIONS))
      ? fragmentFontDeviations(read(DEVIATIONS))
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
          `${face} is ${bytes} bytes on a fragment route, over 40 KiB, with no deviation in ${DEVIATIONS}`
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
        const f = getComputedStyle(fade);
        return {
          animationName: m.animationName,
          animations: motion.getAnimations().length,
          transitionDuration: f.transitionDuration,
          transitionProperty: f.transitionProperty,
        };
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
      return { state, transition };
    };

    const reduced = await run(true);
    expect(reduced.state.animationName).toBe("none");
    expect(reduced.state.animations).toBe(0);
    expect(reduced.state.transitionProperty).toBe("none");
    expect(reduced.state.transitionDuration).toBe("0s");

    const full = await run(false);
    expect(full.state.animationName).toBe("rise");
    expect(full.state.animations).toBeGreaterThan(0);
    expect(full.state.transitionDuration).toBe("0.22s");

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
    ];
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
      const hasTheme = await page.evaluate(() =>
        document.documentElement.hasAttribute("data-theme")
      );
      if (pin) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, pin);
      }
      const values = await resolveTokens(page, names);
      await context.close();
      return { hasTheme, values };
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
        const out: Array<{
          name: string;
          ring: string;
          surface: string;
          visible: boolean;
        }> = [];
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
          out.push({
            name: `${root?.dataset.fixture}: ${el.textContent?.trim()}`,
            ring: getComputedStyle(el).outlineColor,
            surface,
            visible: el.matches(":focus-visible"),
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
        "[data-fragment]:not([data-fixture='low-ring'])"
      );
      expect(rings.length).toBeGreaterThanOrEqual(5);
      expect(rings.some((r) => r.name.startsWith("turntable"))).toBe(true);
      for (const r of rings)
        expect(r.visible, `${theme} ${r.name} focus-visible`).toBe(true);
      const failing = (list: typeof rings) =>
        list
          .filter((r) => contrast(r.ring, r.surface) < 3)
          .map((r) => `${r.name}: ${contrast(r.ring, r.surface).toFixed(2)}:1`);
      expect(failing(rings), `${theme}: rings under 3:1`).toEqual([]);

      // A fixture ring below 3:1 fails the same check.
      const low = await sampleRings('[data-fixture="low-ring"]');
      expect(low).toHaveLength(1);
      expect(failing(low)).toHaveLength(1);
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

    const head = process.env.PR_HEAD_SHA;
    if (head) {
      // The PR binds the record: measured at an ancestor, with no code change since.
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", perf.measured_sha, head],
        { cwd: ROOT }
      );
      const changed = git("diff", "--name-only", perf.measured_sha, head)
        .split("\n")
        .filter((f) => /^(app|components|content|lib|public)\//.test(f));
      expect(changed, `code changed since ${perf.measured_sha}`).toEqual([]);
    } else {
      testInfo.annotations.push({
        type: "not bound",
        description:
          "PR_HEAD_SHA is unset (not a pull_request run), so only the thresholds are asserted.",
      });
    }
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

    // The diff adds no icon library and no icon source.
    const base = prBase();
    const packageDiff = git(
      "diff",
      base,
      "--",
      "package.json",
      "package-lock.json"
    );
    const iconLibraries =
      /^\+.*"(react-icons|@heroicons\/[^"]+|@fortawesome\/[^"]+|@phosphor-icons\/[^"]+|@tabler\/icons[^"]*|feather-icons|react-feather|@radix-ui\/react-icons|@mui\/icons-material|ionicons|bootstrap-icons|remixicon|@iconify\/[^"]+|simple-icons|@mdi\/[^"]+|lucide(?!-react)[^"]*)"\s*:/m;
    expect(packageDiff).not.toMatch(iconLibraries);
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
    expect(codeDiff).not.toMatch(/^\+.*<svg/m);
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

    // Files: only Scope's.
    const changed = git("diff", "--name-only", base)
      .split("\n")
      .filter(Boolean);
    const outside = changed.filter(
      (f) =>
        !SCOPE_FILES.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
    );
    expect(outside, "files changed outside PRV-2's Scope").toEqual([]);

    // deviations.md may change only by its fragment-font section.
    if (changed.includes(DEVIATIONS)) {
      const before = (() => {
        try {
          return git("show", `${base}:${DEVIATIONS}`);
        } catch {
          return "";
        }
      })();
      const after = read(DEVIATIONS);
      const heading = parseDoc(after).headings.find((h) =>
        /fragment-font deviations/i.test(h)
      );
      expect(
        heading,
        `${DEVIATIONS} changes only by a fragment-font section`
      ).toBeDefined();
      const rest = withoutSection(after, heading!).trim();
      expect(rest, `${DEVIATIONS} outside the fragment-font section`).toBe(
        before.trim()
      );
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

      const snapshot = async (origin: string, route: string) => {
        const context = await browser.newContext({ baseURL: origin });
        const page = await context.newPage();
        const response = await page.goto(route);
        const result = await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll(
              "script, style, noscript, template, nextjs-portal, #__next-build-watcher"
            )
            .forEach((n) => n.remove());
          return {
            text: (clone.textContent ?? "").replace(/\s+/g, " ").trim(),
            links: Array.from(
              document.querySelectorAll<HTMLAnchorElement>("a[href]")
            ).map((a) => a.getAttribute("href")!),
          };
        });
        await context.close();
        return { status: response?.status() ?? 0, ...result };
      };
      const resolveLink = async (origin: string, href: string) => {
        const context = await browser.newContext({ baseURL: origin });
        const response = await context.request.get(href, { maxRedirects: 10 });
        const final = new URL(response.url());
        await context.close();
        return {
          status: response.status(),
          path: final.pathname + final.search,
        };
      };

      for (const route of SCOPE_ROUTES) {
        const [before, after] = [
          await snapshot(baseURL, route),
          await snapshot(headURL, route),
        ];
        expect(after.status, `${route} still renders`).toBe(before.status);
        expect(after.text, `${route} text`).toBe(before.text);
        expect(after.links, `${route} link destinations`).toEqual(before.links);

        const sameOrigin = [...new Set(before.links)].filter(
          (h) => h.startsWith("/") && !h.startsWith("//")
        );
        for (const href of sameOrigin) {
          const [b, a] = [
            await resolveLink(baseURL, href),
            await resolveLink(headURL, href),
          ];
          if (b.status === 200) {
            expect(a, `${route} -> ${href}`).toEqual(b);
          } else {
            // A route a later ticket builds keeps its existing status.
            expect(a.status, `${route} -> ${href}`).toBe(b.status);
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
