import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  FRAGMENT_IDS,
  RANGE_CATEGORIES,
  validateRange,
  type RangeCategory,
} from "../content/range";
import { flags } from "../lib/flags";
import { getProjects } from "../lib/mdx";
import {
  FEED,
  PHONE_FEED,
} from "../components/range/fragments/central-command/fixture";
import { checkSite } from "../scripts/boards/check";
import type { Sections } from "../scripts/boards/model";
import { rowStates } from "../scripts/boards/plan";
import { perfRunProblems } from "./fixtures/design-tokens/checks";
import {
  changedByPr,
  git,
  gitBuffer,
  gitOk,
  prRange,
  ROOT,
  type Env,
  type PrRange,
} from "./support/git";
import { HOME_ROUTE } from "./support/home";
import { stubVercelInsights } from "./support/page";
import { layoutShift } from "./support/perf";

/**
 * PRV-5: the opener, the Range shell and the Central Command plate, at
 * /preview/home while `rangeHome` is off. Boards: range-light-desktop (1440),
 * range-phone (390).
 */

const SIZES = {
  1440: { width: 1440, height: 900 },
  390: { width: 390, height: 844 },
} as const;
type Width = keyof typeof SIZES;

const IDS = ["dashboards", "finance", "mobile", "ai", "3d", "sites", "testing"];
const TABS = [
  "Dashboards",
  "Finance",
  "Mobile",
  "AI features",
  "3D & motion",
  "Sites",
  "Testing",
];
const WORDS = [
  "dashboards",
  "finance apps",
  "mobile apps",
  "AI features",
  "3D scenes",
  "websites",
  "test suites",
];
const NAMES = [
  "Central Command",
  "Tally & Trace",
  "Pocket habit tracker",
  "Form helper",
  "Turntable scene",
  "StudioSC Portfolio",
  "StudioSC Portfolio",
];
const LAB = [false, false, true, true, true, false, false];
const label = (i: number) =>
  `${i + 1} of 7: ${TABS[i]}, ${NAMES[i]}${LAB[i] ? " [Lab demo]" : ""}`;

const SECTIONS = "docs/boards/sections.json";
const MERGED = "docs/boards/merged.json";
const URLS = "e2e/fixtures/urls.json";
const PERF = "docs/perf/prv-5.json";
const SPEC_FILE = "e2e/range.spec.ts";
const TICKET = "docs/tickets/PRV-5.md";
/** SHA-256 of the audited ticket as committed, without its id line. */
const TICKET_SHA256 =
  "5f3dd261302880bc157fe7191ca87805613eec4cb38b02ebfc60426e56e831d5";
const PRV5_ROWS = [
  "home/opener",
  "home/range",
  "home/plate-dashboards",
  "home/plate-finance",
  "home/plate-mobile",
  "home/plate-ai",
  "home/plate-3d",
  "home/plate-sites",
  "home/plate-testing",
];

const SCOPE = [
  "components/range/",
  "components/home/RangeHome.tsx",
  "content/range.ts",
  "lib/flags.ts",
  "app/preview/home/",
  "e2e/range.spec.ts",
  "e2e/support/home.ts",
  "e2e/fixtures/urls.json",
  "docs/boards/sections.json",
  "docs/boards/merged.json",
  "docs/perf/prv-5.json",
  // The ticket itself, without its id line (orchestrator, wave 2), and
  // pinned below: the PR may make exactly that change and nothing else.
  TICKET,
];

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "the Range is checked once, in Chromium, at the two board widths"
  );
}

async function open(page: Page, width: Width) {
  await page.setViewportSize(SIZES[width]);
  await stubVercelInsights(page);
  await page.goto(HOME_ROUTE);
}

const tabs = (page: Page) =>
  page.getByRole("group", { name: "Choose a category" }).getByRole("button");
const slides = (page: Page) =>
  page.locator('[aria-roledescription="slide"]:visible');
const counter = (page: Page) =>
  page.locator('[data-board-section="home/range"] p[aria-live="polite"]');
const peek = (page: Page, side: "left" | "right") =>
  page.locator(`[data-board-key="peek-${side}"]`);
const word = (page: Page) => page.locator("h1 [data-range-word]");
const opener = (page: Page) =>
  page.locator('[data-board-section="home/opener"]');

/** PRV-8 links the credit's names; before it merges they are plain text. */
const prv8Merged = () =>
  (JSON.parse(read(MERGED)) as string[]).includes("PRV-8");

/** The counter's visible text, without the words only a screen reader reads. */
const counterText = (page: Page) =>
  counter(page).evaluate((p) =>
    [...p.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
  );

/** The peek's shown category: the text of its one displayed item. */
const peekText = (page: Page, side: "left" | "right") =>
  peek(page, side)
    .locator("p:visible")
    .allInnerTexts()
    .then((t) => t.join(" "));

/** The interior rows PRV-6 and PRV-7 build, by category id. */
function interiorBuilt(id: string): boolean {
  const sections = JSON.parse(read(SECTIONS)) as Sections;
  return Boolean(
    sections.rows.find((r) => r.id === `home/plate-${id}-interior`)?.built
  );
}

async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished))
  );
}

/**
 * A finished animation's transform. The boards' keyframes end at
 * `transform: none` with fill `both`, which Chromium computes as the identity
 * matrix: no offset, the same as none.
 */
const SETTLED = ["none", "matrix(1, 0, 0, 1, 0, 0)"];
const transformOf = (target: Locator) =>
  target.evaluate((el) => getComputedStyle(el).transform);

/** One element's running or finished CSS animations: name, duration, delay. */
const animationsOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) =>
    el.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName,
      duration: Number(a.effect?.getTiming().duration),
      delay: Number(a.effect?.getTiming().delay),
    }))
  );

/**
 * The Central Command plate's server HTML for a given plate entry, rendered
 * outside the build: Playwright compiles TSX for component tests, so the
 * plate is rendered by tsx in a child process instead.
 */
const RENDER = [
  'import { createElement } from "react";',
  'import { renderToStaticMarkup } from "react-dom/server";',
  'import { Plate } from "./components/range/Plate";',
  'import { centralCommand } from "./components/range/fragments/central-command";',
  'import { RANGE_CATEGORIES } from "./content/range";',
  "const plate = JSON.parse(process.env.RANGE_PLATE);",
  "const category = { ...RANGE_CATEGORIES[0], plate };",
  'console.log(renderToStaticMarkup(createElement(Plate, { category, name: "Central Command", fragment: centralCommand })));',
].join(" ");

function renderPlate(plate: RangeCategory["plate"]): string {
  return execFileSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["-e", RENDER],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, RANGE_PLATE: JSON.stringify(plate) },
    }
  );
}

// ---------------------------------------------------------------------------
// The PR this suite was written for, as PRV-1's convention binds it.

const NO_PR = "a CI build without PR_HEAD_SHA (a push) has no PR to judge";

function introducesSuite(sha: string): boolean {
  return !gitOk(["cat-file", "-e", `${sha}:${SPEC_FILE}`]);
}

function ownPr(env: Env = process.env): { range: PrRange } | { skip: string } {
  const range = prRange(env);
  if (!range) return { skip: NO_PR };
  if (!introducesSuite(range.base))
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  return { range };
}

const changedFiles = (base: string, head: string) =>
  git(["diff", "--name-only", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean);

const outsideScope = (files: string[]) =>
  files.filter(
    (f) => !SCOPE.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
  );

const showJson = <T>(sha: string, file: string): T =>
  JSON.parse(git(["show", `${sha}:${file}`])) as T;

// ===========================================================================

test("the whole shell", async ({ page, browser }, testInfo) => {
  chromiumOnly(testInfo);
  // The shipped list, through PRV-3's validator against the project files.
  const projects = await getProjects();
  const statuses = Object.fromEntries(projects.map((p) => [p.slug, p.status]));
  expect(() => validateRange(RANGE_CATEGORIES, statuses)).not.toThrow();
  expect(RANGE_CATEGORIES.map((c) => c.id)).toEqual(IDS);
  expect(RANGE_CATEGORIES.map((c) => c.tab)).toEqual(TABS);
  expect(RANGE_CATEGORIES.map((c) => c.plate.fragmentId)).toEqual([
    ...FRAGMENT_IDS,
  ]);

  for (const width of [1440, 390] as const) {
    await open(page, width);
    await expect(tabs(page)).toHaveText(TABS);
    await expect(slides(page)).toHaveCount(1);
    await expect(slides(page)).toHaveAttribute("aria-label", label(0));
    expect(await counterText(page)).toBe("1 of 7");
    // Each plate whose interior is not built yet is its frame and title only.
    for (let i = 1; i < 7; i++) {
      if (interiorBuilt(IDS[i])) continue;
      await tabs(page).nth(i).click();
      await expect(slides(page)).toHaveAttribute("aria-label", label(i));
      const text = norm(await slides(page).innerText());
      expect(text).toBe(LAB[i] ? `${NAMES[i]} Lab demo` : NAMES[i]);
    }
  }

  // 1440: the peeks show the previous and next categories, wrapping.
  await open(page, 1440);
  expect(await peekText(page, "left")).toContain("Testing");
  expect(await peekText(page, "right")).toContain("Finance");
  await tabs(page).nth(6).click();
  expect(await peekText(page, "left")).toContain("Sites");
  expect(await peekText(page, "right")).toContain("Dashboards");
  // 390: no side peeks.
  await open(page, 390);
  await expect(peek(page, "left")).toBeHidden();
  await expect(peek(page, "right")).toBeHidden();

  // JavaScript off: every plate is in the server HTML, six of them hidden.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: String(testInfo.project.use.baseURL),
  });
  const noJs = await context.newPage();
  await noJs.goto(HOME_ROUTE);
  const all = noJs.locator('[aria-roledescription="slide"]');
  await expect(all).toHaveCount(7);
  await expect(
    noJs.locator('[aria-roledescription="slide"][hidden]')
  ).toHaveCount(6);
  for (let i = 0; i < 7; i++)
    await expect(all.nth(i)).toHaveAttribute("aria-label", label(i));
  await expect(all.nth(0)).not.toHaveAttribute("hidden");
  await context.close();
});

test("every control picks a plate", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  const expectPicked = async (i: number, desktop: boolean) => {
    await expect(slides(page)).toHaveCount(1);
    await expect(slides(page)).toHaveAttribute("aria-label", label(i));
    await expect(
      tabs(page).and(page.locator('[aria-pressed="true"]'))
    ).toHaveCount(1);
    await expect(tabs(page).nth(i)).toHaveAttribute("aria-pressed", "true");
    expect(await counterText(page)).toBe(`${i + 1} of 7`);
    if (desktop) {
      expect(await peekText(page, "left")).toContain(TABS[(i + 6) % 7]);
      expect(await peekText(page, "right")).toContain(TABS[(i + 1) % 7]);
    }
  };
  for (const width of [1440, 390] as const) {
    const desktop = width === 1440;
    await open(page, width);
    await expectPicked(0, desktop);
    // Nothing moves on its own.
    await page.waitForTimeout(3000);
    await expectPicked(0, desktop);
    for (const i of [3, 1, 6, 5, 0]) {
      await tabs(page).nth(i).click();
      await expectPicked(i, desktop);
    }
    // Back from the first wraps to the last; next from the last wraps back.
    await page.getByRole("button", { name: "Previous plate" }).click();
    await expectPicked(6, desktop);
    await page.getByRole("button", { name: "Next plate" }).click();
    await expectPicked(0, desktop);
    await page.getByRole("button", { name: "Next plate" }).click();
    await expectPicked(1, desktop);
    await page.getByRole("button", { name: "Previous plate" }).click();
    await expectPicked(0, desktop);
  }
});

test("the word follows the tab", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await expect(page.locator("h1")).toHaveCount(1);
    const accent = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent)";
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    expect(norm(await page.locator("h1").innerText())).toBe(
      "We build dashboards. We break them first."
    );
    for (let i = 0; i < 7; i++) {
      await tabs(page).nth(i).click();
      await expect(word(page)).toHaveText(WORDS[i]);
      await expect(word(page)).toHaveCSS("color", accent);
      expect(norm(await page.locator("h1").innerText())).toBe(
        `We build ${WORDS[i]}. We break them first.`
      );
    }
  }
});

test("swap motion, fallback and announcement", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  await settle(page);
  const slide = '[aria-roledescription="slide"]:not([hidden])';
  const plateAnimation = async () => (await animationsOf(page, slide))[0];

  // Next enters from the right: word 280 ms, plate 240 ms, peeks 240 ms.
  await page.getByRole("button", { name: "Next plate" }).click();
  expect(await animationsOf(page, "h1 [data-range-word]")).toEqual([
    { name: "word-in", duration: 280, delay: 0 },
  ]);
  expect(await plateAnimation()).toEqual({
    name: "plate-from-right",
    duration: 240,
    delay: 0,
  });
  for (const side of ["left", "right"]) {
    const item = `[data-board-key="peek-${side}"] div:not([hidden])[data-motion]`;
    expect(await animationsOf(page, item)).toEqual([
      { name: "plate-fade", duration: 240, delay: 0 },
    ]);
  }
  await settle(page);
  expect(SETTLED).toContain(await transformOf(page.locator(slide)));
  await expect(page.locator(slide)).toHaveCSS("opacity", "1");
  await expect(counter(page)).toHaveText("Finance, 2 of 7: finance apps");

  // Previous enters from the left, and so does the wrap from the first.
  await page.getByRole("button", { name: "Previous plate" }).click();
  expect((await plateAnimation()).name).toBe("plate-from-left");
  await page.getByRole("button", { name: "Previous plate" }).click();
  expect((await plateAnimation()).name).toBe("plate-from-left");
  await expect(counter(page)).toHaveText("Testing, 7 of 7: test suites");
  // Next from the last wraps forward, from the right.
  await page.getByRole("button", { name: "Next plate" }).click();
  expect((await plateAnimation()).name).toBe("plate-from-right");
  // A direct pick: a higher index from the right, a lower one from the left.
  await tabs(page).nth(4).click();
  expect((await plateAnimation()).name).toBe("plate-from-right");
  await tabs(page).nth(2).click();
  expect((await plateAnimation()).name).toBe("plate-from-left");
  await expect(counter(page)).toHaveText("Mobile, 3 of 7: mobile apps");
  await settle(page);
  expect(SETTLED).toContain(await transformOf(page.locator(slide)));
  await expect(page.locator(slide)).toHaveCSS("opacity", "1");

  // Reduced motion: no change computes an animation; the end state is at once.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1440);
  await page.getByRole("button", { name: "Next plate" }).click();
  expect(await animationsOf(page, slide)).toEqual([]);
  expect(await animationsOf(page, "h1 [data-range-word]")).toEqual([]);
  expect(
    await animationsOf(
      page,
      '[data-board-key="peek-left"] div:not([hidden])[data-motion]'
    )
  ).toEqual([]);
  await expect(page.locator(slide)).toHaveCSS("opacity", "1");
  await expect(page.locator(slide)).toHaveCSS("transform", "none");
  await expect(counter(page)).toHaveText("Finance, 2 of 7: finance apps");
});

test("load moment plays once", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  const opener = '[data-board-section="home/opener"]';
  const range = '[data-board-section="home/range"]';
  const line = (n: number) => page.locator(`h1 > span:nth-child(${n})`);
  const tabRow = () => page.locator(`${range} > div[data-motion]`).nth(0);
  const stage = () => page.locator(`${range} > div[data-motion]`).nth(1);
  const dots = (scope: string) =>
    page.locator(`${scope} > svg[data-motion]:visible`);
  const css = (target: Locator) =>
    target.evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.animationName} ${cs.animationDuration} ${cs.animationDelay}`;
    });

  for (const width of [1440, 390] as const) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, width);
    expect(await css(line(1))).toBe("rise 0.56s 0s");
    expect(await css(line(2))).toBe("rise 0.56s 0.09s");
    await expect(dots(opener)).toHaveCount(width === 1440 ? 1 : 2);
    for (const svg of await dots(opener).all())
      expect((await css(svg)).split(" ").slice(0, 2).join(" ")).toBe(
        "fade-in 0.9s"
      );
    if (width === 1440) {
      expect(await css(tabRow())).toBe("fade-in 0.42s 0.36s");
      expect(await css(stage())).toBe("stage-in 0.64s 0.22s");
      expect((await css(dots(range))).split(" ").slice(0, 2).join(" ")).toBe(
        "fade-in 0.9s"
      );
    } else {
      expect(await css(tabRow())).toBe("fade-in 0.42s 0.3s");
      expect((await css(stage())).split(" ")[0]).toBe("none");
    }

    // Settled: full opacity and no transform; the dots keep their drawn
    // orientation (the phone's left field is the right one mirrored).
    await settle(page);
    for (const target of [line(1), line(2), tabRow(), stage()]) {
      await expect(target).toHaveCSS("opacity", "1");
      expect(SETTLED).toContain(await transformOf(target));
    }
    // The board's dots settle at fade-in's last frame.
    for (const svg of await dots(opener).all())
      await expect(svg).toHaveCSS("opacity", "1");
    if (width === 390)
      await expect(dots(opener).nth(1)).toHaveCSS("scale", "-1 1");

    // No later tab, back, next or theme action starts any of them again.
    await page.evaluate(() => {
      const w = window as unknown as { __starts: string[] };
      w.__starts = [];
      document.addEventListener("animationstart", (e) =>
        w.__starts.push(e.animationName)
      );
    });
    await tabs(page).nth(3).click();
    await page.getByRole("button", { name: "Next plate" }).click();
    await page.getByRole("button", { name: "Previous plate" }).click();
    await page.getByRole("button", { name: /^switch to (the )?dark/i }).click();
    await page.waitForTimeout(1000);
    const starts = await page.evaluate(
      () => (window as unknown as { __starts: string[] }).__starts
    );
    expect(
      starts.filter((n) => ["rise", "fade-in", "stage-in"].includes(n))
    ).toEqual([]);
    await page.evaluate(() => localStorage.clear());
  }

  // Reduced motion: none is computed; the first frame is already final.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390] as const) {
    await open(page, width);
    for (const target of [
      line(1),
      line(2),
      tabRow(),
      stage(),
      ...(await dots(opener).all()),
    ])
      expect((await css(target)).split(" ")[0]).toBe("none");
    for (const target of [line(1), line(2), tabRow(), stage()])
      await expect(target).toHaveCSS("opacity", "1");
  }
});

test("peeks are drawings", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  for (const side of ["left", "right"] as const) {
    await expect(peek(page, side)).toHaveAttribute("aria-hidden", "true");
    await expect(peek(page, side)).toHaveAttribute("inert", "");
    await expect(
      peek(page, side).locator("a, button, input, select, textarea, [tabindex]")
    ).toHaveCount(0);
  }

  const order = async (count: number) => {
    await opener(page).getByRole("link", { name: "Every project" }).focus();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("Tab");
      names.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el?.getAttribute("aria-label") || norm(el?.innerText ?? "");
          function norm(s: string) {
            return s.replace(/\s+/g, " ").trim();
          }
        })
      );
    }
    return names;
  };
  // PRV-8 links the credit's two names, which then join the plate's links.
  const credit = prv8Merged() ? ["Seth", "Christine"] : [];
  expect(await order(11 + credit.length)).toEqual([
    ...TABS,
    ...credit,
    "Read the case study",
    "Open the demo",
    "Previous plate",
    "Next plate",
  ]);
  await open(page, 390);
  expect(await order(13 + credit.length)).toEqual([
    "Scroll the categories back",
    ...TABS,
    "Scroll the categories forward",
    ...credit,
    "Read the case study",
    "Open the demo",
    "Previous plate",
    "Next plate",
  ]);
});

test("phone chip row", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 390);
  const row = page.locator("#range-categories");
  const scroll = () => row.evaluate((el) => el.scrollLeft);
  const max = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(max).toBeGreaterThan(0);
  expect(await scroll()).toBe(0);

  // Each scroll button moves the row its way and leaves the pick alone.
  await page
    .getByRole("button", { name: "Scroll the categories forward" })
    .click();
  await expect.poll(scroll).toBeGreaterThan(0);
  await expect(tabs(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(slides(page)).toHaveAttribute("aria-label", label(0));
  const forward = await scroll();
  await page.waitForTimeout(600);
  await page
    .getByRole("button", { name: "Scroll the categories back" })
    .click();
  await expect.poll(scroll).toBeLessThan(forward);
  await expect(tabs(page).nth(0)).toHaveAttribute("aria-pressed", "true");

  // A picked chip comes to the middle, where the range allows.
  const offCentre = (i: number) =>
    page.evaluate((index) => {
      const r = document.getElementById("range-categories")!;
      const chip = r.querySelectorAll("button")[index];
      const a = r.getBoundingClientRect();
      const b = chip.getBoundingClientRect();
      return Math.abs(b.left + b.width / 2 - (a.left + a.width / 2));
    }, i);
  await tabs(page).nth(3).click();
  await expect.poll(() => offCentre(3)).toBeLessThanOrEqual(8);
  // At either end the row stops at its limit with the pick in view.
  await tabs(page).nth(6).click();
  await expect.poll(scroll).toBeGreaterThanOrEqual(max - 1);
  await expect(tabs(page).nth(6)).toBeInViewport({ ratio: 1 });
  await tabs(page).nth(0).click();
  await expect.poll(scroll).toBe(0);
  await expect(tabs(page).nth(0)).toBeInViewport({ ratio: 1 });

  // The page itself never scrolls sideways.
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(sideways).toBeLessThanOrEqual(0);
});

test("day feed", async ({ page, browser }, testInfo) => {
  chromiumOnly(testInfo);
  // Server modules only.
  for (const file of ["Feed.tsx", "Peek.tsx", "fixture.ts", "index.ts"]) {
    const source = read(`components/range/fragments/central-command/${file}`);
    expect(source).not.toMatch(/["']use client["']/);
  }
  const times = (list: readonly { time: string }[]) => list.map((e) => e.time);
  expect(times(FEED)).toEqual([...times(FEED)].sort());

  for (const [width, entries] of [
    [1440, FEED.map((e) => ({ ...e, shown: e.text }))],
    [390, PHONE_FEED.map((e) => ({ ...e, shown: e.phone }))],
  ] as const) {
    await open(page, width);
    const items = slides(page).locator("li[data-source]:visible");
    await expect(items).toHaveCount(width === 1440 ? 6 : 4);
    const rendered = (await items.allInnerTexts()).map(norm);
    expect(rendered).toEqual(
      entries.map((e) => `${e.time} ${e.name} ${e.shown}`)
    );
    const sources = await items.evaluateAll((els) =>
      els.map((li) => ({
        source: li.getAttribute("data-source")!,
        name: li.querySelector("strong")!.textContent,
        colour: getComputedStyle(li.querySelector("[data-colour]")!)
          .backgroundColor,
        token: (() => {
          const probe = document.createElement("span");
          probe.style.color = `var(--frag-cc-${li.getAttribute("data-source")})`;
          document.body.append(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        })(),
      }))
    );
    for (const s of sources) expect(s.colour).toBe(s.token);
    expect(new Set(sources.map((s) => s.colour)).size).toBe(sources.length);
    expect(sources.map((s) => s.name)).toEqual(entries.map((e) => e.name));
    if (width === 390) {
      const box = await slides(page).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      const sideways = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(sideways).toBeLessThanOrEqual(0);
    }
  }

  // With JavaScript disabled, the server HTML alone shows the feed rows, in
  // order, at both widths.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: String(testInfo.project.use.baseURL),
  });
  const noJs = await context.newPage();
  for (const [width, shown] of [
    [1440, FEED.map((e) => `${e.time} ${e.name} ${e.text}`)],
    [390, PHONE_FEED.map((e) => `${e.time} ${e.name} ${e.phone}`)],
  ] as const) {
    await noJs.setViewportSize(SIZES[width]);
    await noJs.goto(HOME_ROUTE);
    const rows = slides(noJs).locator("li[data-source]:visible");
    await expect(rows).toHaveCount(shown.length);
    expect((await rows.allInnerTexts()).map(norm)).toEqual([...shown]);
  }
  await context.close();
});

test("credit and Christine lines", async ({ page, request }, testInfo) => {
  chromiumOnly(testInfo);
  const html = await (await request.get(HOME_ROUTE)).text();
  expect(html).not.toContain("Illustrative wording");
  const linked = prv8Merged();
  for (const width of [1440, 390] as const) {
    await open(page, width);
    const credit = slides(page).locator("p:visible", {
      hasText: "Built by Seth · Tested by Christine",
    });
    await expect(credit).toHaveCount(1);
    await expect(credit).toHaveText("Built by Seth · Tested by Christine");
    // Plain text until PRV-8 merges (D15); then its two person anchors.
    if (linked) {
      await expect(credit.locator("a")).toHaveCount(2);
      await expect(credit.locator("a").nth(0)).toHaveText("Seth");
      await expect(credit.locator("a").nth(0)).toHaveAttribute("href", "#seth");
      await expect(credit.locator("a").nth(1)).toHaveText("Christine");
      await expect(credit.locator("a").nth(1)).toHaveAttribute(
        "href",
        "#christine"
      );
    } else {
      await expect(credit.locator("a")).toHaveCount(0);
    }
    // No pinned check ships for Central Command, so no Christine line.
    await expect(slides(page).locator("[data-christine-line]")).toHaveCount(0);
    await expect(slides(page)).not.toContainText("Checked by Christine");
  }

  // With a valid, audit-pinned check, the plate renders the supplied text in
  // the Christine line's own element, once per layout; without it, the whole
  // line is absent and the credit stays.
  const cc = RANGE_CATEGORIES[0];
  expect(cc.plate.kind).toBe("real");
  const real = cc.plate as Extract<RangeCategory["plate"], { kind: "real" }>;
  const supplied = (text: string): RangeCategory["plate"] => ({
    ...real,
    christineCheck: {
      repo: "StudioSC-dev/studiosc-centralcommand",
      path: "e2e/feed.spec.ts",
      test: "day feed order",
      sha: "0123456789abcdef0123456789abcdef01234567",
      text,
    },
  });
  const DISTINCT = "Fixture check q7x: zebra feed rows stay in order.";
  const OTHER = "Fixture check k2w: walrus entries keep one colour.";
  const BOARD =
    "The day feed stays in time order, and each entry keeps its source's colour.";
  const projects = await getProjects();
  const slugs = projects.map((p) => p.slug);
  expect(() =>
    validateRange([{ ...cc, plate: supplied(DISTINCT) }], slugs)
  ).not.toThrow();

  /** The Christine lines in rendered plate HTML: desktop, then phone. */
  const linesIn = async (html: string) => {
    await page.setContent(html);
    return {
      desktop: (
        await page.locator(".md\\:grid [data-christine-line]").allInnerTexts()
      ).map(norm),
      phone: (
        await page.locator(".md\\:hidden [data-christine-line]").allInnerTexts()
      ).map(norm),
    };
  };
  const expected = (text: string) => ({
    desktop: [`Checked by Christine. ${text}`],
    phone: [`Checked by Christine. ${text}`],
  });
  const withCheck = renderPlate(supplied(DISTINCT));
  expect(await linesIn(withCheck)).toEqual(expected(DISTINCT));
  expect(await linesIn(renderPlate(supplied(OTHER)))).toEqual(expected(OTHER));
  expect(withCheck).not.toContain("Illustrative wording");
  // Control: a plate that printed fixed copy instead of the supplied text
  // fails the same assertion.
  const hardCoded = withCheck.split(DISTINCT).join(BOARD);
  expect(await linesIn(hardCoded)).not.toEqual(expected(DISTINCT));

  const without = renderPlate(real);
  expect(without).not.toContain("data-christine-line");
  expect(without).not.toContain("Checked by Christine");
  expect(without).toContain("Built by Seth · Tested by Christine");
  expect(without).not.toContain("Illustrative wording");
});

test("small client, LCP holds", async ({
  page,
  browser,
  request,
}, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(180_000);
  const baseURL = String(testInfo.project.use.baseURL);
  /** The script URLs a route loads, with every Range control used once. */
  const scriptsOf = async (route: string, useRange: boolean) => {
    const context = await browser.newContext({ baseURL });
    const p = await context.newPage();
    await stubVercelInsights(p);
    const urls = new Set<string>();
    p.on("requestfinished", (r) => {
      if (r.resourceType() === "script" && r.url().includes("/_next/"))
        urls.add(new URL(r.url()).pathname);
    });
    for (const width of useRange ? ([1440, 390] as const) : ([1440] as const)) {
      await p.setViewportSize(SIZES[width]);
      await p.goto(route, { waitUntil: "networkidle" });
      if (useRange) {
        for (let i = 1; i < 7; i++) await tabs(p).nth(i).click();
        await p.getByRole("button", { name: "Next plate" }).click();
        await p.getByRole("button", { name: "Previous plate" }).click();
        await p.waitForLoadState("networkidle");
      }
    }
    await context.close();
    return urls;
  };
  // The layout alone: a static page with no client code of its own.
  const baseline = await scriptsOf("/privacy/hermes-personal-assistant", false);
  const range = await scriptsOf(HOME_ROUTE, true);
  const introduced = [...range].filter((u) => !baseline.has(u));
  let gzip = 0;
  for (const url of introduced)
    gzip += gzipSync(await (await request.get(url)).body()).length;
  testInfo.annotations.push({
    type: "range client",
    description: `${introduced.length} chunks, ${gzip} bytes gzip: ${introduced.join(", ")}`,
  });
  expect(introduced.length).toBeGreaterThan(0);
  expect(gzip).toBeLessThanOrEqual(8 * 1024);

  // No layout shift from navigation to five seconds after load.
  expect(await layoutShift(browser, baseURL, HOME_ROUTE)).toBe(0);
  await page.close();

  // The committed Lighthouse record, under the epic's perf JSON rule.
  const perf = JSON.parse(read(PERF)) as {
    measured_sha: string;
    route: string;
    lighthouse_version: string;
    runs: Array<Record<"perf" | "a11y" | "lcp_ms" | "cls", number>>;
    median: Record<"perf" | "a11y" | "lcp_ms" | "cls", number>;
  };
  expect(perf.measured_sha).toMatch(/^[0-9a-f]{40}$/);
  expect(perf.route).toBe("/preview/home");
  expect(perf.lighthouse_version).toMatch(/^\d+\.\d+\.\d+/);
  expect(perf.runs).toHaveLength(3);
  expect(perfRunProblems(perf.runs)).toEqual([]);
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
  for (const key of ["perf", "a11y", "lcp_ms", "cls"] as const)
    expect(perf.median[key]).toBeCloseTo(
      median(perf.runs.map((r) => r[key])),
      6
    );
  expect(perf.median.lcp_ms).toBeLessThanOrEqual(3800);
  // The record binds the PR that changes it: measured at an ancestor of the
  // head, with no code change since.
  const range2 = prRange();
  if (!range2 || !changedByPr(range2, PERF)) {
    testInfo.annotations.push({
      type: "not bound",
      description: `${range2 ? `this PR does not change ${PERF}` : NO_PR}; only the thresholds are asserted.`,
    });
    return;
  }
  expect(
    gitOk(["merge-base", "--is-ancestor", perf.measured_sha, range2.head])
  ).toBe(true);
  const changed = git(["diff", "--name-only", perf.measured_sha, range2.head])
    .split("\n")
    .filter((f) => /^(app|components|content|lib|public)\//.test(f));
  expect(changed).toEqual([]);
});

test("home behind the flag", async ({ page, request }, testInfo) => {
  chromiumOnly(testInfo);
  expect(flags.rangeHome).toBe(false);
  expect(HOME_ROUTE).toBe("/preview/home");
  const urls = (JSON.parse(read(URLS)) as { urls: string[] }).urls;
  expect(urls).toContain("/preview/home");

  // / is still the old home: no Range, no link to the preview.
  await stubVercelInsights(page);
  await page.goto("/");
  await expect(page.locator('[data-board-section="home/range"]')).toHaveCount(
    0
  );
  await expect(page.locator('a[href*="/preview"]')).toHaveCount(0);

  // The preview: noindex, linked from nowhere, out of any sitemap.
  await page.goto(HOME_ROUTE);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/
  );
  await expect(page.locator('a[href*="/preview"]')).toHaveCount(0);
  const sitemap = await request.get("/sitemap.xml");
  if (sitemap.ok()) expect(await sitemap.text()).not.toContain("/preview");
  else expect(sitemap.status()).toBe(404);

  const OPENER_LINKS: Record<string, string> = {
    "Start a project": "/contact",
    "Every project": "#work",
  };
  const links: Record<string, string> = {
    ...OPENER_LINKS,
    "Read the case study": "/work/central-command",
    "Open the demo": "https://centralcommand.studiosc.dev",
  };
  for (const width of [1440, 390] as const) {
    await open(page, width);
    // Control: another link of the same name elsewhere on the page (PRV-4's
    // header CTA) neither breaks nor satisfies these checks.
    await page.evaluate(() => {
      const decoy = document.createElement("a");
      decoy.href = "/elsewhere";
      decoy.textContent = "Start a project";
      document.body.prepend(decoy);
    });
    for (const [name, href] of Object.entries(links)) {
      const scope = name in OPENER_LINKS ? opener(page) : slides(page);
      await expect(
        scope.getByRole("link", { name, exact: true })
      ).toHaveAttribute("href", href);
    }
  }
});

test("PRV-5 fidelity rows", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(300_000);
  const sections = JSON.parse(read(SECTIONS)) as Sections;
  const mine = sections.rows.filter((r) => r.ticket === "PRV-5");
  expect(mine.map((r) => r.id)).toEqual(PRV5_ROWS);
  for (const row of mine) {
    expect(row.built).toBe(true);
    expect(row.route).toBe("/preview/home");
    for (const width of ["1440", "390"] as const)
      for (const theme of ["light", "dark"] as const)
        expect(row.sources[width]?.[theme]?.board).toBeTruthy();
  }
  expect(JSON.parse(read(MERGED))).toContain("PRV-5");
  // On PRV-5's own PR the interiors PRV-6 and PRV-7 build stay unbuilt.
  const own = ownPr();
  if ("range" in own) {
    const later = sections.rows.filter((r) =>
      /^home\/plate-.*-interior$/.test(r.id)
    );
    expect(later).toHaveLength(6);
    for (const row of later) expect(row.built).toBe(false);
  }
  // fidelity.spec.ts judges every built row in every state. This pass shows
  // the harness compares each PRV-5 row in the first state the boards draw
  // for it, at both widths and in both themes; a row is only ever compared
  // in a state of its own.
  const wanted: string[] = [];
  for (const row of mine)
    for (const width of ["1440", "390"] as const) {
      const states = rowStates(sections, row, width);
      expect(states.length).toBeGreaterThan(0);
      for (const theme of ["light", "dark"])
        wanted.push(`${row.id} ${states[0]} ${width} ${theme}`);
    }
  const states = [...new Set(wanted.map((w) => w.split(" ")[1]))];
  const result = await checkSite({
    dir: path.join(ROOT, "docs/boards"),
    baseURL: String(testInfo.project.use.baseURL),
    browser,
    only: { rows: PRV5_ROWS, states, rm: false },
  });
  for (const comparison of wanted) expect(result.checked).toContain(comparison);
  for (const comparison of result.checked) {
    const [id, state] = comparison.split(" ");
    expect(mine.find((r) => r.id === id)?.states).toContain(state);
  }
});

test("changes stay within scope", async ({}, testInfo) => {
  chromiumOnly(testInfo);
  const own = ownPr();
  test.skip(
    "skip" in own,
    `${"skip" in own ? own.skip : ""}: PRV-5's scope is checked on its own PR.`
  );
  const { base, head } = (own as { range: PrRange }).range;
  const files = changedFiles(base, head);
  expect(outsideScope(files)).toEqual([]);
  expect(files).not.toContain("e2e/homepage.spec.ts");
  // Control: a file outside Scope is caught, and so is any other ticket.
  expect(
    outsideScope([
      "e2e/homepage.spec.ts",
      "components/range/x.tsx",
      "docs/tickets/PRV-4.md",
      TICKET,
    ])
  ).toEqual(["e2e/homepage.spec.ts", "docs/tickets/PRV-4.md"]);

  // The ticket: the only docs/tickets change is dropping its "PRV-5" id
  // line, and the result is the audited text.
  const ticketDocs = files.filter((f) => f.startsWith("docs/tickets/"));
  expect(ticketDocs).toEqual([TICKET]);
  const ticketAt = (sha: string) => gitBuffer(["show", `${sha}:${TICKET}`]);
  const ticketBefore = ticketAt(base).toString("utf8");
  expect(ticketBefore.startsWith("PRV-5\n")).toBe(true);
  expect(ticketAt(head).toString("utf8")).toBe(
    ticketBefore.slice("PRV-5\n".length)
  );
  expect(createHash("sha256").update(ticketAt(head)).digest("hex")).toBe(
    TICKET_SHA256
  );

  // urls.json gains only /preview/home.
  const urlsBefore = showJson<{ sha: string; note: string; urls: string[] }>(
    base,
    URLS
  );
  const urlsAfter = JSON.parse(read(URLS)) as typeof urlsBefore;
  expect(urlsAfter).toEqual({
    ...urlsBefore,
    urls: [...urlsBefore.urls, "/preview/home"],
  });

  // merged.json gains only PRV-5.
  const mergedBefore = showJson<string[]>(base, MERGED);
  expect(JSON.parse(read(MERGED))).toEqual([...mergedBefore, "PRV-5"]);

  // sections.json changes only the PRV-5 rows' built flags.
  const before = showJson<Sections>(base, SECTIONS);
  const after = JSON.parse(read(SECTIONS)) as Sections;
  const strip = (s: Sections) => ({
    ...s,
    rows: s.rows.map((r) =>
      PRV5_ROWS.includes(r.id) ? { ...r, built: false } : r
    ),
  });
  expect(strip(after)).toEqual(strip(before));
  for (const id of PRV5_ROWS)
    expect(before.rows.find((r) => r.id === id)?.built).toBe(false);
});
