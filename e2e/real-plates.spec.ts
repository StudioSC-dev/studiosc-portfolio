import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  RANGE_CATEGORIES,
  validateRange,
  type RangeCategory,
} from "../content/range";
import { getProjects } from "../lib/mdx";
import {
  BILLS,
  money,
  TOTAL,
} from "../components/range/fragments/tallyandtrace/fixture";
import {
  PHONE_ROUTES,
  ROUTES,
} from "../components/range/fragments/route-checks/fixture";
import { checkSite } from "../scripts/boards/check";
import { describe as describeFailure } from "../scripts/boards/compare";
import type { Sections } from "../scripts/boards/model";
import { rowStates } from "../scripts/boards/plan";
import { git, gitOk, prRange, ROOT, type PrRange } from "./support/git";
import { HOME_ROUTE } from "./support/home";
import { stubVercelInsights } from "./support/page";

/**
 * PRV-6: the Tally & Trace, Sites and Testing plates, at /preview/home while
 * `rangeHome` is off. Boards: range-light-desktop (1440), range-phone (390).
 */

const SIZES = {
  1440: { width: 1440, height: 900 },
  390: { width: 390, height: 844 },
} as const;
type Width = keyof typeof SIZES;

const TABS = [
  "Dashboards",
  "Finance",
  "Mobile",
  "AI features",
  "3D & motion",
  "Sites",
  "Testing",
];
const FINANCE = 1;
const SITES = 5;
const TESTING = 6;

const SECTIONS = "docs/boards/sections.json";
const MERGED = "docs/boards/merged.json";
const URLS = "e2e/fixtures/urls.json";
const SPEC_FILE = "e2e/real-plates.spec.ts";
const RANGE_CONTENT = "content/range.ts";
const INTERIOR_ROWS = [
  "home/plate-finance-interior",
  "home/plate-sites-interior",
  "home/plate-testing-interior",
];
const PLATE_IDS = ["finance", "sites", "testing"];
const BOARDS = {
  1440: "docs/boards/range-light-desktop.dc.html",
  390: "docs/boards/range-phone.dc.html",
} as const;

/** The pinned provenance for the two Christine lines (orchestrator, PRV-6). */
const FINANCE_PIN = {
  repo: "StudioSC-dev/tally-and-trace",
  path: "frontend/e2e/amounts.spec.ts",
  test: "amount styling preserves transaction layout",
  sha: "8d6a4d45c405d13926192ca3aa6828dcbd9b4ab2",
};
const TESTING_PIN = {
  repo: "StudioSC-dev/studiosc-portfolio",
  path: "e2e/guards.spec.ts",
  test: "every route renders without a console error",
  sha: "2473f216fb51a6598b5492e6dd0fdc07bc0254e8",
};

const FRAGMENTS_DIR = "components/range/fragments";
/** What the diff against the PR base may touch (PRV-6 Scope, edit boundary). */
const SCOPE = [
  `${FRAGMENTS_DIR}/tallyandtrace/`,
  `${FRAGMENTS_DIR}/portfolio-site/`,
  `${FRAGMENTS_DIR}/route-checks/`,
  "components/range/",
  RANGE_CONTENT,
  SECTIONS,
  MERGED,
  "e2e/range.spec.ts",
  SPEC_FILE,
  "docs/tickets/PRV-6.md",
];

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "the plates are checked once, in Chromium, at the two board widths"
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

async function pick(page: Page, _width: Width, index: number) {
  void _width;
  await tabs(page).nth(index).click();
  await expect(slides(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`^${index + 1} of 7`)
  );
}

/** The board's text for a plate: its figure caption (the first in the slide). */
function boardCaption(width: Width, index: number): string {
  const html = read(BOARDS[width]);
  const at = html.indexOf(`aria-label="${index + 1} of 7:`);
  const rest = html.slice(at);
  const caption = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/.exec(rest);
  if (!caption)
    throw new Error(`no caption on ${BOARDS[width]} plate ${index}`);
  return norm(caption[1].replace(/&amp;/g, "&"));
}

/** The bills (name, account) the board's script draws, in its order. */
function boardBills(width: Width): [string, string][] {
  const html = read(BOARDS[width]);
  return [
    ...html.matchAll(/\{ name: '([^']+)', from: '([^']+)', due: \d+/g),
  ].map((m) => [m[1], m[2]]);
}

/** The route paths the board's Testing table draws for a width. */
function boardRoutes(width: Width): string[] {
  const html = read(BOARDS[width]);
  const at = html.indexOf('aria-label="7 of 7:');
  const end = html.indexOf("</figure>", at);
  return [
    ...html
      .slice(at, end)
      .matchAll(/role="cell" style="font-weight: 600;">(\/[^<]*)</g),
  ].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// The ledger.

type Key = "name" | "due" | "amount";
const HEADS: Record<Key, string> = {
  name: "Bill",
  due: "Due",
  amount: "Amount",
};

const ledger = (page: Page) =>
  page.locator('[data-fragment="tallyandtrace"]:visible [role="table"]');

/** Data rows' cells, with the Due and Amount columns per width. */
async function ledgerRows(table: Locator, width: Width) {
  return table.evaluate((el, w) => {
    const rows = [...el.querySelectorAll('[role="row"]')];
    const text = (n: Element | undefined) =>
      (n?.textContent ?? "").replace(/\s+/g, " ").trim();
    const edge = (n: Element | undefined) => {
      if (!n) return NaN;
      const range = document.createRange();
      range.selectNodeContents(n);
      return range.getBoundingClientRect().right;
    };
    const data = rows.slice(1, -1).map((row) => {
      const cells = [...row.querySelectorAll('[role="cell"]')];
      const amount = cells[w === 1440 ? 3 : 2];
      return {
        name: text(w === 1440 ? cells[0] : cells[0].firstElementChild!),
        due: text(cells[w === 1440 ? 2 : 1]),
        amount: text(amount),
        edge: edge(amount),
      };
    });
    const total = rows[rows.length - 1];
    const totalCell = total.querySelectorAll('[role="cell"]')[1];
    // Rows that hold red text, by index among the data rows.
    const red: number[] = [];
    rows.slice(1, -1).forEach((row, i) => {
      for (const node of [row, ...row.querySelectorAll("*")]) {
        const own = [...node.childNodes].some(
          (c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim()
        );
        if (own && getComputedStyle(node).color === "rgb(179, 38, 30)") {
          red.push(i);
          break;
        }
      }
    });
    const redOutside = rows.some(
      (row, i) =>
        (i === 0 || i === rows.length - 1) &&
        [row, ...row.querySelectorAll("*")].some(
          (n) => getComputedStyle(n).color === "rgb(179, 38, 30)"
        )
    );
    const sorts = [...el.querySelectorAll('[role="columnheader"]')].map(
      (h) => `${text(h)}:${h.getAttribute("aria-sort")}`
    );
    return {
      data,
      total: text(totalCell),
      totalEdge: edge(totalCell),
      red,
      redOutside,
      sorts,
    };
  }, width);
}

const centavos = (label: string) =>
  Math.round(Number(label.replace(/[^0-9.]/g, "")) * 100);

function expectedOrder(key: Key, dir: 1 | -1) {
  return BILLS.slice().sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * dir;
    if (key === "due") return (a.due - b.due) * dir;
    return (a.centavos - b.centavos) * dir;
  });
}

async function checkLedger(
  page: Page,
  width: Width,
  key: Key,
  dir: 1 | -1,
  step: string
) {
  const got = await ledgerRows(ledger(page), width);
  const want = expectedOrder(key, dir);
  expect(
    got.data.map((r) => r.name),
    `${step} order`
  ).toEqual(want.map((b) => (width === 1440 ? b.name : b.phoneName)));
  expect(
    got.data.map((r) => centavos(r.amount)),
    `${step} amounts`
  ).toEqual(want.map((b) => b.centavos));
  // One right edge for every amount and the total (±1px).
  const edges = [...got.data.map((r) => r.edge), got.totalEdge];
  expect(
    Math.max(...edges) - Math.min(...edges),
    `${step} edge`
  ).toBeLessThanOrEqual(1);
  // The total equals the sum of the data rows.
  const sum = got.data.reduce((s, r) => s + centavos(r.amount), 0);
  expect(centavos(got.total), `${step} total`).toBe(sum);
  expect(got.total).toBe(TOTAL);
  // Only overdue rows hold red, and each says "overdue".
  const overdue = got.data
    .map((r, i) => (/overdue/i.test(r.due) ? i : -1))
    .filter((i) => i >= 0);
  expect(got.red, `${step} red`).toEqual(overdue);
  expect(
    overdue.map((i) => got.data[i].name),
    `${step} overdue rows`
  ).toEqual(
    want
      .filter((b) => b.overdue)
      .map((b) => (width === 1440 ? b.name : b.phoneName))
  );
  expect(got.redOutside).toBe(false);
  // aria-sort names the active column and direction only.
  expect(got.sorts.filter((s) => !s.startsWith("Paid from"))).toEqual(
    (["name", "due", "amount"] as Key[]).map(
      (k) =>
        `${HEADS[k]}:${k === key ? (dir === 1 ? "ascending" : "descending") : "none"}`
    )
  );
}

// ---------------------------------------------------------------------------
// Rendering a plate outside the build, as range.spec.ts does.

const RENDER = [
  'import { createElement } from "react";',
  'import { renderToStaticMarkup } from "react-dom/server";',
  'import { Plate } from "./components/range/Plate";',
  'import { FRAGMENTS } from "./components/range/fragments";',
  'import { RANGE_CATEGORIES } from "./content/range";',
  "const plate = JSON.parse(process.env.RANGE_PLATE);",
  "const category = RANGE_CATEGORIES.find((c) => c.id === process.env.RANGE_ID);",
  "const shown = { ...category, plate };",
  'console.log(renderToStaticMarkup(createElement(Plate, { category: shown, name: "x", fragment: FRAGMENTS[plate.fragmentId] })));',
].join(" ");

function renderPlate(id: string, plate: RangeCategory["plate"]): string {
  return execFileSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["-e", RENDER],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        RANGE_ID: id,
        RANGE_PLATE: JSON.stringify(plate),
      },
    }
  );
}

const category = (id: string) => {
  const found = RANGE_CATEGORIES.find((c) => c.id === id);
  if (!found || found.plate.kind !== "real") throw new Error(`no plate ${id}`);
  return found as RangeCategory & {
    plate: Extract<RangeCategory["plate"], { kind: "real" }>;
  };
};

// ---------------------------------------------------------------------------
// The PR this suite was written for.

const NO_PR = "a CI build without PR_HEAD_SHA (a push) has no PR to judge";

function ownPr(): { range: PrRange } | { skip: string } {
  const range = prRange();
  if (!range) return { skip: NO_PR };
  if (gitOk(["cat-file", "-e", `${range.base}:${SPEC_FILE}`]))
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  return { range };
}

const outsideScope = (files: string[]) =>
  files.filter(
    (f) => !SCOPE.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
  );

/** content/range.ts without the three plate entries, to compare the rest. */
function withoutPlateEntries(source: string): string {
  let out = source;
  for (const id of PLATE_IDS) {
    const start = out.indexOf(`  {\n    id: "${id}",`);
    if (start < 0) throw new Error(`no entry ${id}`);
    const end = out.indexOf("\n  },\n", start);
    out = out.slice(0, start) + out.slice(end + "\n  },\n".length);
  }
  return out;
}

const showJson = <T>(sha: string, file: string): T =>
  JSON.parse(git(["show", `${sha}:${file}`])) as T;

/** sections.json with the three interior rows' `built` flags neutralised. */
const neutral = (s: Sections) => ({
  ...s,
  rows: s.rows.map((r) =>
    INTERIOR_ROWS.includes(r.id) ? { ...r, built: false } : r
  ),
});

// ===========================================================================

test("made-up fixtures", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  // Every ledger row is a fixture bill, every route a fixture route, and
  // each caption is the board's, at both widths.
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await pick(page, width, FINANCE);
    const got = await ledgerRows(ledger(page), width);
    expect(got.data.map((r) => r.name).sort()).toEqual(
      BILLS.map((b) => (width === 1440 ? b.name : b.phoneName)).sort()
    );
    for (const row of got.data)
      expect(BILLS.map((b) => money(b.centavos))).toContain(row.amount);
    await expect(slides(page).locator("figcaption:visible")).toHaveText(
      boardCaption(width, FINANCE)
    );

    await pick(page, width, SITES);
    await expect(slides(page).locator("figcaption:visible")).toHaveText(
      boardCaption(width, SITES)
    );

    await pick(page, width, TESTING);
    const paths = await slides(page)
      .locator('[role="table"]:visible [role="row"] [role="cell"]:first-child')
      .allInnerTexts();
    expect(paths).toEqual(
      (width === 1440 ? ROUTES : PHONE_ROUTES).map((r) => r.path)
    );
    await expect(slides(page).locator("figcaption:visible")).toHaveText(
      boardCaption(width, TESTING)
    );
  }
  // The fixture's accounts are the board's made-up ones, nothing else.
  const accounts = (width: Width) =>
    [...new Set(boardBills(width).map(([, from]) => from))].sort();
  expect([...new Set(BILLS.map((b) => b.from))].sort()).toEqual(accounts(1440));
});

test("real routes", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  const urls = (JSON.parse(read(URLS)) as { urls: string[] }).urls;
  for (const route of ROUTES) expect(urls).toContain(route.path);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await pick(page, width, TESTING);
    const rows = slides(page).locator('[role="table"]:visible [role="row"]');
    // Header excluded.
    const want = width === 1440 ? 6 : 4;
    await expect(rows).toHaveCount(want + 1);
    const paths = await rows
      .locator('[role="cell"]:first-child')
      .allInnerTexts();
    expect(paths).toEqual(boardRoutes(width));
    expect(paths).toHaveLength(want);
  }
});

test("ledger", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await pick(page, width, FINANCE);
    const head = (key: Key) =>
      ledger(page).getByRole("button", { name: HEADS[key], exact: true });
    // The default is Due, ascending.
    await checkLedger(page, width, "due", 1, `${width} initial`);
    // Bill, Amount and Due each sort both ways; the active header reverses.
    for (const key of ["name", "amount", "due"] as Key[]) {
      await head(key).click();
      const first = 1;
      await checkLedger(page, width, key, first, `${width} ${key} first`);
      await head(key).click();
      await checkLedger(
        page,
        width,
        key,
        -first as 1 | -1,
        `${width} ${key} second`
      );
    }
  }
});

test("ticks land", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  const ticks = () => slides(page).locator("[data-tick]");
  for (let round = 0; round < 2; round++) {
    const t0 = await page.evaluate(() => performance.now());
    await pick(page, 1440, TESTING);
    await expect(ticks()).toHaveCount(12);
    const seen = await ticks().evaluateAll(async (els) => {
      const out: {
        name: string;
        delay: number;
        start: number;
        opacity: string;
      }[] = [];
      for (const el of els) {
        const style = getComputedStyle(el);
        const [animation] = el.getAnimations();
        await animation.ready;
        out.push({
          name: style.animationName,
          delay: parseFloat(style.animationDelay) * 1000,
          start: Number(animation.startTime),
          opacity: "",
        });
      }
      await Promise.all(
        els.flatMap((e) => e.getAnimations().map((a) => a.finished))
      );
      return out.map((o, i) => ({
        ...o,
        opacity: getComputedStyle(els[i]).opacity,
      }));
    });
    expect(seen.map((s) => s.name)).toEqual(Array(12).fill("tick-in"));
    for (let i = 1; i < 12; i++)
      expect(seen[i].delay - seen[i - 1].delay, `tick ${i}`).toBeCloseTo(70, 0);
    // The animation starts afresh each time Testing is selected.
    for (const s of seen) expect(s.start).toBeGreaterThanOrEqual(t0);
    expect(seen.map((s) => s.opacity)).toEqual(Array(12).fill("1"));
    // Away and back, so the next round is a new selection.
    await pick(page, 1440, FINANCE);
  }

  // Reduced motion: all twelve are visible at once, with no animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1440);
  await pick(page, 1440, TESTING);
  await expect(ticks()).toHaveCount(12);
  for (let i = 0; i < 12; i++) {
    await expect(ticks().nth(i)).toBeVisible();
    await expect(ticks().nth(i)).toHaveCSS("opacity", "1");
    await expect(ticks().nth(i)).toHaveCSS("animation-name", "none");
  }
  expect(
    await ticks().evaluateAll(
      (els) => els.flatMap((e) => e.getAnimations()).length
    )
  ).toBe(0);

  // 390: eight Pass results, shown at once, with no tick animation.
  for (const motion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion: motion });
    await open(page, 390);
    await pick(page, 390, TESTING);
    const passes = slides(page).locator('[role="cell"]:visible', {
      hasText: /^Pass$/,
    });
    await expect(passes).toHaveCount(8);
    for (let i = 0; i < 8; i++) await expect(passes.nth(i)).toBeVisible();
    await expect(slides(page).locator("[data-tick]:visible")).toHaveCount(0);
    const animations = await slides(page)
      .locator('[role="table"]:visible')
      .evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);
  }
});

/** Every `.ts` and `.tsx` file under a folder, with its source. */
function sources(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(name)) out.push({ file: rel, text: read(rel) });
  }
  return out;
}

test("static, phone-fit, small", async ({
  page,
  browser,
  request,
}, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(180_000);
  // The Sites folder, the Testing table and the peeks hold no client code.
  for (const dir of ["portfolio-site", "route-checks"])
    for (const { file, text } of sources(`${FRAGMENTS_DIR}/${dir}`))
      expect(text, file).not.toMatch(/["']use client["']/);
  // The ledger's own client module is the only one in tallyandtrace.
  const clients = sources(`${FRAGMENTS_DIR}/tallyandtrace`)
    .filter(({ text }) => /["']use client["']/.test(text))
    .map(({ file }) => path.basename(file));
  expect(clients).toEqual(["Ledger.tsx"]);

  // Every plate fits 390.
  await open(page, 390);
  for (let i = 0; i < 7; i++) {
    await pick(page, 390, i);
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished))
    );
    const over = await page.evaluate(() => {
      const root = document.documentElement;
      const slide = document.querySelector(
        '[aria-roledescription="slide"]:not([hidden])'
      )!;
      return {
        page: root.scrollWidth - root.clientWidth,
        plate: slide.scrollWidth - slide.clientWidth,
        right: slide.getBoundingClientRect().right - root.clientWidth,
      };
    });
    expect(over, TABS[i]).toEqual({
      page: 0,
      plate: expect.any(Number),
      right: expect.any(Number),
    });
    expect(over.plate, `${TABS[i]} plate`).toBeLessThanOrEqual(0);
    expect(over.right, `${TABS[i]} edge`).toBeLessThanOrEqual(0);
  }

  // The range's client JS stays within PRV-5 AC10's 8 KiB gzip.
  const baseURL = String(testInfo.project.use.baseURL);
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
        await p
          .getByRole("group", { name: "Choose a category" })
          .getByRole("button")
          .first()
          .click();
        await p.getByRole("button", { name: "Next plate" }).click();
        await p.getByRole("button", { name: "Previous plate" }).click();
        await p.getByRole("button", { name: "Finance" }).click();
        await p.getByRole("button", { name: "Bill", exact: true }).click();
        await p.waitForLoadState("networkidle");
      }
    }
    await context.close();
    return urls;
  };
  const baseline = await scriptsOf("/privacy/hermes-personal-assistant", false);
  const range = await scriptsOf(HOME_ROUTE, true);
  const introduced = [...range].filter((u) => !baseline.has(u));
  let gzip = 0;
  for (const url of introduced)
    gzip += gzipSync(await (await request.get(url)).body()).length;
  testInfo.annotations.push({
    type: "range client",
    description: `${introduced.length} chunks, ${gzip} bytes gzip`,
  });
  expect(introduced.length).toBeGreaterThan(0);
  expect(gzip).toBeLessThanOrEqual(8 * 1024);
});

test("lines are real", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  const cases = [
    { id: "finance", pin: FINANCE_PIN, other: "testing" },
    { id: "testing", pin: TESTING_PIN, other: "finance" },
  ] as const;
  const slugs = (await getProjects()).map((p) => p.slug);
  const lines = async (html: string) => {
    await page.setContent(html);
    return {
      desktop: await page.locator(".md\\:grid [data-christine-line]").count(),
      phone: await page.locator(".md\\:hidden [data-christine-line]").count(),
      text: (await page.locator("[data-christine-line]").allInnerTexts()).map(
        norm
      ),
    };
  };
  for (const { id, pin, other } of cases) {
    const shipped = category(id).plate;
    // Complete provenance: the specified repo, file, test and pinned SHA.
    expect(shipped.christineCheck).toMatchObject(pin);
    expect(shipped.christineCheck?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(() => validateRange([category(id)], slugs)).not.toThrow();
    const full = renderPlate(id, shipped);
    const got = await lines(full);
    const text = `Checked by Christine. ${shipped.christineCheck?.text}`;
    expect(got).toEqual({ desktop: 1, phone: 1, text: [text, text] });
    expect(full).not.toContain("Illustrative wording");

    // Incomplete provenance omits the whole line, and the credit stays.
    for (const broken of [
      undefined,
      { ...shipped.christineCheck, sha: "8d6a4d4" },
      { ...shipped.christineCheck, sha: undefined },
      { ...shipped.christineCheck, test: "" },
    ]) {
      if (broken)
        expect(() =>
          validateRange(
            [
              {
                ...category(id),
                plate: { ...shipped, christineCheck: broken },
              },
            ],
            slugs
          )
        ).toThrow();
      const { christineCheck: _drop, ...rest } = shipped;
      void _drop;
      const html = renderPlate(id, rest as typeof shipped);
      expect(await lines(html)).toEqual({ desktop: 0, phone: 0, text: [] });
      expect(html).not.toContain("Checked by Christine");
      expect(html).toContain("Built by Seth");
      expect(html).not.toContain("Illustrative wording");
    }
    // Each line stands alone: the other plate's line is unaffected.
    expect(category(other).plate.christineCheck).toBeDefined();
  }
  // The live page shows both lines and never the drawn "Illustrative wording".
  for (const width of [1440, 390] as const) {
    await open(page, width);
    for (const [index, id] of [
      [FINANCE, "finance"],
      [TESTING, "testing"],
    ] as const) {
      await pick(page, width, index);
      await expect(
        slides(page).locator("[data-christine-line]:visible")
      ).toHaveText(
        new RegExp(
          `Checked by Christine\\. ${category(id).plate.christineCheck?.text.replace(/[.]/g, "\\.")}`
        )
      );
      await expect(slides(page)).not.toContainText("Illustrative wording");
    }
    await pick(page, width, SITES);
    await expect(
      slides(page).locator("[data-christine-line]:visible")
    ).toHaveCount(0);
  }
});

test("ledger labels match the boards", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await pick(page, width, FINANCE);
    const board = boardBills(width);
    expect(board).toHaveLength(6);
    const rows = ledger(page).locator('[role="row"]');
    const texts = await rows.allInnerTexts();
    // Data rows: header first, total last.
    const data = texts.slice(1, -1).map(norm);
    for (const [name, from] of board) {
      const row = data.find((t) => t.startsWith(name));
      expect(row, `${width} ${name}`).toBeDefined();
      expect(row, `${width} ${name} account`).toContain(from);
    }
    expect(data).toHaveLength(board.length);
    if (width === 1440)
      await expect(ledger(page).getByRole("columnheader")).toHaveText([
        "Bill",
        "Paid from",
        "Due",
        "Amount",
      ]);
    else
      await expect(ledger(page).getByRole("columnheader")).toHaveText([
        "Bill",
        "Due",
        "Amount",
      ]);
  }
});

test("PRV-6 fidelity rows", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(600_000);
  const sections = JSON.parse(read(SECTIONS)) as Sections;
  const mine = sections.rows.filter((r) => r.ticket === "PRV-6");
  expect(mine.map((r) => r.id)).toEqual(INTERIOR_ROWS);
  for (const row of mine) {
    expect(row.built).toBe(true);
    expect(row.route).toBe("/preview/home");
  }
  expect(JSON.parse(read(MERGED))).toContain("PRV-6");

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
    only: { rows: INTERIOR_ROWS, states, rm: false },
  });
  expect(result.failures.map((f) => describeFailure(f))).toEqual([]);
  for (const comparison of wanted) expect(result.checked).toContain(comparison);
});

test("changes stay within scope", async ({}, testInfo) => {
  chromiumOnly(testInfo);
  // Control: the allowlist catches a path outside the boundary.
  expect(
    outsideScope([
      "components/range/fragments/tallyandtrace/Ledger.tsx",
      "components/range/Plate.tsx",
      "content/range.ts",
      "e2e/real-plates.spec.ts",
      "e2e/homepage.spec.ts",
      "lib/flags.ts",
      "e2e/fixtures/urls.json",
      "docs/tickets/PRV-7.md",
    ])
  ).toEqual([
    "e2e/homepage.spec.ts",
    "lib/flags.ts",
    "e2e/fixtures/urls.json",
    "docs/tickets/PRV-7.md",
  ]);
  // Control: the content check ignores the three entries and nothing else.
  const sample = read(RANGE_CONTENT);
  expect(withoutPlateEntries(sample.replace("A money app", "A cash app"))).toBe(
    withoutPlateEntries(sample)
  );
  expect(
    withoutPlateEntries(sample.replace("Pocket habit tracker", "Habits"))
  ).not.toBe(withoutPlateEntries(sample));
  expect(
    neutral({ rows: [{ id: INTERIOR_ROWS[0], built: true }] } as Sections)
  ).toEqual(
    neutral({ rows: [{ id: INTERIOR_ROWS[0], built: false }] } as Sections)
  );
  expect(
    neutral({ rows: [{ id: "home/people", built: true }] } as Sections)
  ).not.toEqual(
    neutral({ rows: [{ id: "home/people", built: false }] } as Sections)
  );

  const own = ownPr();
  test.skip(
    "skip" in own,
    `${"skip" in own ? own.skip : ""}: PRV-6's scope is checked on its own PR.`
  );
  const { base, head } = (own as { range: PrRange }).range;
  const files = git(["diff", "--name-only", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean);
  expect(outsideScope(files)).toEqual([]);
  // urls.json is a read-only input.
  expect(files).not.toContain(URLS);
  // content/range.ts changes only inside the three plate entries.
  expect(withoutPlateEntries(git(["show", `${head}:${RANGE_CONTENT}`]))).toBe(
    withoutPlateEntries(git(["show", `${base}:${RANGE_CONTENT}`]))
  );
  // sections.json changes only the three interior rows' built flags.
  expect(neutral(showJson<Sections>(head, SECTIONS))).toEqual(
    neutral(showJson<Sections>(base, SECTIONS))
  );
  for (const row of showJson<Sections>(base, SECTIONS).rows.filter((r) =>
    INTERIOR_ROWS.includes(r.id)
  ))
    expect(row.built).toBe(false);
  // merged.json gains only PRV-6.
  expect(showJson<string[]>(head, MERGED)).toEqual([
    ...showJson<string[]>(base, MERGED),
    "PRV-6",
  ]);
});
