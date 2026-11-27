import { readFileSync } from "node:fs";
import path from "node:path";
import {
  expect,
  test,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import { checkSite } from "../scripts/boards/check";
import { parseDeviations, type Sections } from "../scripts/boards/model";
import { rowStates } from "../scripts/boards/plan";
import {
  git,
  gitOk,
  prRange,
  ROOT,
  type Env,
  type PrRange,
} from "./support/git";
import { HOME_ROUTE } from "./support/home";
import { stubVercelInsights } from "./support/page";
import { firstLoadJs } from "./support/perf";

/**
 * PRV-7: the lab demos on the Mobile, AI features and 3D & motion plates, at
 * /preview/home while `rangeHome` is off. Boards: range-light-desktop (1440),
 * range-phone (390).
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
const WORDS = [
  "dashboards",
  "finance apps",
  "mobile apps",
  "AI features",
  "3D scenes",
  "websites",
  "test suites",
];

/** The three lab plates: their tab, name, Built with value and demo marker. */
const LABS = [
  {
    index: 2,
    id: "mobile",
    tab: "Mobile",
    name: "Pocket habit tracker",
    builtWith: "React",
    // A string only the demo's own chunk holds.
    marker: "Walk 20 minutes",
  },
  {
    index: 3,
    id: "ai",
    tab: "AI features",
    name: "Form helper",
    builtWith: "React",
    marker: "Thanks for flagging the late invoices",
  },
  {
    index: 4,
    id: "3d",
    tab: "3D & motion",
    name: "Turntable scene",
    builtWith: "React and CSS 3D transforms",
    marker: "turn 14s linear infinite",
  },
] as const;

const LAB_LINE =
  "Nobody's hired us for one of these yet. We built this so you don't have to take our word for it.";
const PHONE_LAB_LINE =
  "A lab demo. Nobody's hired us for one of these yet, so we built one anyway.";
const CAPTIONS = [
  "A lab demo in a phone frame. Tick a habit; the count and the list answer straight away.",
  "A lab demo with a scripted draft that streams in word by word. The real one would call a language model.",
  "Pause the cube to hold its position, then play to resume the turn.",
];
const TURNTABLE_DESCRIPTION =
  "A six-sided CSS cube that turns while this plate is open.";
const SCRIPT_A =
  "Thanks for raising this, and sorry for the wait. Invoices now go out the same day they are approved, because approval has moved out of email and into the billing screen. If either client wants a copy resent, reply here and I will send it today.";
const SCRIPT_B =
  "Thanks for flagging the late invoices. I'll check what held them up and follow up with an update today.";

const SECTIONS = "docs/boards/sections.json";
const MERGED = "docs/boards/merged.json";
const DEVIATIONS = "docs/boards/deviations.md";
const SPEC_FILE = "e2e/lab.spec.ts";
const PRV7_ROWS = [
  "home/plate-mobile-interior",
  "home/plate-ai-interior",
  "home/plate-3d-interior",
];
const SCOPE = [
  "content/range.ts",
  "components/range/",
  SPEC_FILE,
  SECTIONS,
  MERGED,
  DEVIATIONS,
  "docs/tickets/PRV-7.md",
];

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "the lab plates are checked once, in Chromium, at the two board widths"
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
const demo = (page: Page, id: string) =>
  page.locator(`[data-lab-demo="${id}"]`);

async function pick(page: Page, index: number) {
  await tabs(page).nth(index).click();
  await expect(tabs(page).nth(index)).toHaveAttribute("aria-pressed", "true");
}

/** The page's HTML entities, decoded for the few the server writes. */
const decode = (html: string) =>
  html
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

// ===========================================================================

test("all seven categories", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  await expect(tabs(page)).toHaveText(TABS);
  // Dashboards is picked on load.
  await expect(tabs(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("h1 [data-range-word]")).toHaveText(WORDS[0]);
  for (let i = 0; i < 7; i++) {
    await pick(page, i);
    await expect(page.locator("h1 [data-range-word]")).toHaveText(WORDS[i]);
    for (let j = 0; j < 7; j++)
      await expect(tabs(page).nth(j)).toHaveAttribute(
        "aria-pressed",
        String(i === j)
      );
  }
});

test("habit tracker", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  await pick(page, 2);
  const root = demo(page, "habit-tracker");
  await expect(root).toBeVisible();
  const count = root.locator('[role="status"]');
  const habit = (name: string) => root.getByRole("button", { name });
  const names = [
    "Drink water",
    "Walk 20 minutes",
    "Read 10 pages",
    "Sleep by 23:00",
  ];
  // The board rests with the first two done.
  await expect(count).toHaveText("2 of 4 done");
  for (const [i, name] of names.entries())
    await expect(habit(name)).toHaveAttribute("aria-pressed", String(i < 2));

  // Every habit, off then on again, with the count following each step.
  let done = 2;
  for (const [i, name] of names.entries()) {
    const was = i < 2;
    await habit(name).click();
    done += was ? -1 : 1;
    await expect(habit(name)).toHaveAttribute("aria-pressed", String(!was));
    await expect(count).toHaveText(`${done} of 4 done`);
    await habit(name).click();
    done += was ? 1 : -1;
    await expect(habit(name)).toHaveAttribute("aria-pressed", String(was));
    await expect(count).toHaveText(`${done} of 4 done`);
  }
  // The two ends: none done, then all four.
  for (const name of names.slice(0, 2)) await habit(name).click();
  await expect(count).toHaveText("0 of 4 done");
  for (const name of names) await habit(name).click();
  await expect(count).toHaveText("4 of 4 done");
  for (const name of names)
    await expect(habit(name)).toHaveAttribute("aria-pressed", "true");
});

test("form helper", async ({ page, browser }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  await pick(page, 3);
  const root = demo(page, "form-helper");
  await expect(root).toBeVisible();
  const draft = root.getByRole("button", { name: /^Draft/ });
  const stream = root.locator("[data-draft]");
  const announce = root.locator("[data-announce]");
  await expect(draft).toHaveText("Draft a reply");
  await expect(announce).toHaveAttribute("role", "status");
  await expect(
    root.getByText("The draft appears here as it is written.")
  ).toBeVisible();

  // What the polite region said, and the requests made while drafting.
  await announce.evaluate((el) => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    new MutationObserver(() => {
      const text = el.textContent ?? "";
      if (text) w.__said.push(text);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  const said = () =>
    page.evaluate(() => (window as unknown as { __said: string[] }).__said);

  // Draft 1: Script A streams in word by word.
  await draft.click();
  const seen = new Set<number>();
  for (let i = 0; i < 12; i++) {
    seen.add(
      norm(await stream.innerText())
        .split(" ")
        .filter(Boolean).length
    );
    await page.waitForTimeout(100);
  }
  expect(seen.size).toBeGreaterThan(3);
  await expect(draft).toHaveText("Draft again");
  await expect(stream).toHaveText(SCRIPT_A);
  expect(await said()).toEqual([SCRIPT_A]);
  // The stream is visual only: inside an aria-hidden box.
  expect(
    await stream.evaluate((el) => !!el.closest('[aria-hidden="true"]'))
  ).toBe(true);
  await expect(announce).toHaveText(SCRIPT_A);

  // Draft 2: Script B. A press while it streams leaves the draft running.
  await draft.click();
  await draft.click();
  await draft.click();
  await expect(stream).toHaveText(SCRIPT_B);
  await expect(announce).toHaveText(SCRIPT_B);
  await page.waitForTimeout(300);
  await expect(stream).toHaveText(SCRIPT_B);
  expect(await said()).toEqual([SCRIPT_A, SCRIPT_B]);

  // Draft 3: back to Script A.
  await draft.click();
  await expect(stream).toHaveText(SCRIPT_A);
  await expect(announce).toHaveText(SCRIPT_A);
  await expect(draft).toHaveText("Draft again");
  expect(await said()).toEqual([SCRIPT_A, SCRIPT_B, SCRIPT_A]);

  // Nothing went over the network while drafting.
  expect(requests.map((r) => r.url())).toEqual([]);

  // Under reduced motion the whole reply shows at once.
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    reducedMotion: "reduce",
    viewport: SIZES[1440],
  });
  const still = await context.newPage();
  await stubVercelInsights(still);
  await still.goto(HOME_ROUTE);
  await pick(still, 3);
  const stillDraft = demo(still, "form-helper").getByRole("button", {
    name: /^Draft/,
  });
  await expect(stillDraft).toHaveText("Draft a reply");
  await stillDraft.click();
  await expect(demo(still, "form-helper").locator("[data-draft]")).toHaveText(
    SCRIPT_A,
    { timeout: 100 }
  );
  await expect(stillDraft).toHaveText("Draft again");
  await context.close();
});

test("turntable", async ({ page, browser }, testInfo) => {
  chromiumOnly(testInfo);
  await open(page, 1440);
  await pick(page, 4);
  const root = demo(page, "turntable");
  await expect(root).toBeVisible();
  const cube = root.locator("[data-cube]");
  const button = root.getByRole("button", { name: /^(Pause|Play)$/ });
  const faces = cube.locator("> span");
  await expect(cube).toHaveAttribute("aria-hidden", "true");
  await expect(faces).toHaveCount(6);

  const turn = () =>
    cube.evaluate((el) => {
      const [a] = el.getAnimations() as CSSAnimation[];
      return a
        ? {
            name: a.animationName,
            state: a.playState,
            duration: Number(a.effect?.getTiming().duration),
            iterations: a.effect?.getTiming().iterations,
            time: Number(a.currentTime),
          }
        : null;
    });
  const matrix = () => cube.evaluate((el) => getComputedStyle(el).transform);

  // It turns once every 14 seconds while selected and playing.
  await page.waitForTimeout(1200);
  const first = await turn();
  expect(first).toMatchObject({
    name: "turn",
    state: "running",
    duration: 14000,
    iterations: Infinity,
  });
  const a = await matrix();
  await page.waitForTimeout(400);
  expect(await matrix()).not.toBe(a);

  // Pause holds the cube at its angle.
  await expect(button).toHaveText("Pause");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(button).toHaveText("Play");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);
  const held = await turn();
  expect(held?.state).toBe("paused");
  const heldMatrix = await matrix();
  await page.waitForTimeout(600);
  expect(await matrix()).toBe(heldMatrix);
  expect((await turn())?.time).toBe(held?.time);

  // Play resumes from that angle, not from the start.
  await button.click();
  await expect(button).toHaveText("Pause");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  const resumed = await turn();
  expect(resumed?.state).toBe("running");
  expect(resumed?.time).toBeGreaterThanOrEqual(held?.time ?? Infinity);
  expect(resumed?.time).toBeLessThan((held?.time ?? 0) + 1000);
  await page.waitForTimeout(400);
  expect((await turn())?.time).toBeGreaterThan(resumed?.time ?? Infinity);

  // Deselected, it stops; a paused cube stays paused when its plate returns.
  await button.click();
  await pick(page, 0);
  await expect(root).toBeHidden();
  expect(await turn()).toBeNull();
  await pick(page, 4);
  await expect(button).toHaveText("Play");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect((await turn())?.state).toBe("paused");
  await button.click();
  await expect(button).toHaveText("Pause");
  expect((await turn())?.state).toBe("running");
  await pick(page, 5);
  expect(await turn()).toBeNull();

  // Under reduced motion the cube stays still.
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    reducedMotion: "reduce",
    viewport: SIZES[1440],
  });
  const still = await context.newPage();
  await stubVercelInsights(still);
  await still.goto(HOME_ROUTE);
  await pick(still, 4);
  const stillCube = demo(still, "turntable").locator("[data-cube]");
  await expect(stillCube).toBeVisible();
  const at = () => stillCube.evaluate((el) => getComputedStyle(el).transform);
  const before = await at();
  await still.waitForTimeout(500);
  expect(await at()).toBe(before);
  expect(await stillCube.evaluate((el) => el.getAnimations().length)).toBe(0);
  await context.close();
});

test("lab plates are honest", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    for (const lab of LABS) {
      await pick(page, lab.index);
      const slide = slides(page);
      const text = norm(await slide.innerText());
      // The dashed tag, on the title.
      await expect(slide.getByRole("heading", { level: 2 })).toHaveText(
        `${lab.name} Lab demo`
      );
      await expect(
        slide.getByRole("heading", { level: 2 }).getByText("Lab demo")
      ).toHaveCSS("border-top-style", "dashed");
      // What no lab plate shows, at either width.
      for (const absent of [
        "Status",
        "Started",
        "Built by",
        "Tested by",
        "Checked by Christine",
        "PLACEHOLDER",
        "In QA",
        "Read the case study",
      ])
        expect(text).not.toContain(absent);
      if (width === 1440) {
        await expect(slide.locator("dt:visible")).toHaveText(["Built with"]);
        await expect(slide.locator("dd:visible")).toHaveText([lab.builtWith]);
        expect(text).toContain(LAB_LINE);
        expect(text).not.toContain(PHONE_LAB_LINE);
      } else {
        // The phone layout draws no Built with row.
        await expect(slide.locator("dt:visible, dd:visible")).toHaveCount(0);
        expect(text).not.toContain("Built with");
        expect(text).toContain(PHONE_LAB_LINE);
        expect(text).not.toContain(LAB_LINE);
      }
    }
  }
});

/** Every script response of a page, by url, in the order it was requested. */
function trackScripts(page: Page) {
  const urls: string[] = [];
  const bodies = new Map<string, Promise<string>>();
  page.on("response", (response) => {
    const request = response.request();
    if (request.resourceType() !== "script") return;
    if (/\/_vercel\//.test(request.url())) return;
    urls.push(request.url());
    bodies.set(
      request.url(),
      response.text().catch(() => "")
    );
  });
  return { urls, bodies };
}

test("demos load on pick", async ({ page, request, browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(180_000);
  // The server HTML carries each lab plate's shell, with no demo in it.
  const html = decode(await (await request.get(HOME_ROUTE)).text());
  const plain = decode(html.replace(/<[^>]+>/g, "|"));
  for (const [i, lab] of LABS.entries()) {
    expect(plain).toContain(lab.name);
    expect(plain).toContain(LAB_LINE);
    expect(plain).toContain(PHONE_LAB_LINE);
    expect(plain).toContain(CAPTIONS[i]);
    expect(plain).toContain(lab.builtWith);
  }
  expect(html.match(/Lab demo/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  expect(html).toContain("Built with");
  expect(html).not.toContain("data-lab-demo");

  // A fresh load mounts no demo, and requests no demo code.
  await page.setViewportSize(SIZES[1440]);
  await stubVercelInsights(page);
  const scripts = trackScripts(page);
  await page.goto(HOME_ROUTE, { waitUntil: "networkidle" });
  await expect(page.locator("[data-lab-demo]")).toHaveCount(0);
  const stages: Record<string, number> = {};
  const stage = (n: number) => {
    for (const url of scripts.urls) stages[url] ??= n;
  };
  stage(0);
  const bodyOf = async (url: string) => (await scripts.bodies.get(url)) ?? "";
  for (const url of Object.keys(stages))
    for (const lab of LABS) expect(await bodyOf(url)).not.toContain(lab.marker);

  // Each pick requests the chunk that holds its demo, and then mounts it.
  for (const [n, lab] of LABS.entries()) {
    const before = scripts.urls.length;
    await pick(page, lab.index);
    const id = ["habit-tracker", "form-helper", "turntable"][n];
    await expect(demo(page, id)).toBeVisible();
    stage(n + 1);
    const fresh = scripts.urls.slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    let holds = false;
    for (const url of fresh)
      if ((await bodyOf(url)).includes(lab.marker)) holds = true;
    expect(holds).toBe(true);
    // No other demo is mounted yet.
    await expect(page.locator("[data-lab-demo]")).toHaveCount(n + 1);
  }
  // A chunk holding demo code is first requested on a pick of a plate that uses it.
  for (const [url, at] of Object.entries(stages)) {
    const body = await bodyOf(url);
    const users = LABS.map((lab, n) =>
      body.includes(lab.marker) ? n + 1 : 0
    ).filter(Boolean);
    if (users.length > 0) expect(users).toContain(at);
  }

  // Switching away and back keeps each demo mounted, with no new request.
  await pick(page, 2);
  await demo(page, "habit-tracker")
    .getByRole("button", { name: "Read 10 pages" })
    .click();
  const settled = scripts.urls.length;
  await pick(page, 0);
  await pick(page, 2);
  await expect(
    demo(page, "habit-tracker").locator('[role="status"]')
  ).toHaveText("3 of 4 done");
  await pick(page, 3);
  await pick(page, 4);
  await pick(page, 5);
  await pick(page, 2);
  await page.waitForLoadState("networkidle");
  expect(scripts.urls.length).toBe(settled);
  await expect(page.locator("[data-lab-demo]")).toHaveCount(3);

  // The home's first-load JS stays within 3% of its budget.
  const baseline = JSON.parse(read("e2e/fixtures/perf-baseline.json")) as {
    current: Record<string, number>;
  };
  const load = await firstLoadJs(
    browser,
    String(testInfo.project.use.baseURL),
    "/"
  );
  expect(load.status).toBe(200);
  expect(load.bytes).toBeLessThanOrEqual(baseline.current["/"] * 1.03);
});

test("turntable copy describes the cube", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of [1440, 390] as const) {
    await open(page, width);
    await pick(page, 4);
    const slide = slides(page);
    await expect(
      slide.locator("p:visible").filter({ hasText: TURNTABLE_DESCRIPTION })
    ).toHaveText(TURNTABLE_DESCRIPTION);
    await expect(slide.locator("figcaption:visible")).toHaveText(CAPTIONS[2]);
    const text = await slide.innerText();
    for (const banned of ["three.js", "would be"])
      expect(text.toLowerCase()).not.toContain(banned);
  }
});

test("lab fidelity rows", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(600_000);
  const sections = JSON.parse(read(SECTIONS)) as Sections;
  const mine = sections.rows.filter((r) => r.ticket === "PRV-7");
  expect(mine.map((r) => r.id)).toEqual(PRV7_ROWS);
  for (const row of mine) {
    expect(row.built).toBe(true);
    expect(row.route).toBe("/preview/home");
    for (const width of ["1440", "390"] as const)
      for (const theme of ["light", "dark"] as const)
        expect(row.sources[width]?.[theme]?.board).toBeTruthy();
  }
  expect(JSON.parse(read(MERGED))).toContain("PRV-7");

  // The inherited check, on these rows in every state they draw, at both
  // widths and in both themes.
  const wanted: string[] = [];
  for (const row of mine)
    for (const width of ["1440", "390"] as const)
      for (const state of rowStates(sections, row, width))
        for (const theme of ["light", "dark"])
          wanted.push(`${row.id} ${state} ${width} ${theme}`);
  expect(wanted).toHaveLength(12);
  const result = await checkSite({
    dir: path.join(ROOT, "docs/boards"),
    baseURL: String(testInfo.project.use.baseURL),
    browser,
    only: { rows: PRV7_ROWS, rm: false },
  });
  for (const comparison of wanted) expect(result.checked).toContain(comparison);
  expect(result.failures).toEqual([]);
});

// ---------------------------------------------------------------------------
// The PR this suite was written for, as PRV-1's convention binds it.

function ownPr(env: Env = process.env): { range: PrRange } | { skip: string } {
  const range = prRange(env);
  if (!range)
    return {
      skip: "a CI build without PR_HEAD_SHA (a push) has no PR to judge",
    };
  if (gitOk(["cat-file", "-e", `${range.base}:${SPEC_FILE}`]))
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  return { range };
}

const showJson = <T>(sha: string, file: string): T =>
  JSON.parse(git(["show", `${sha}:${file}`])) as T;
const outsideScope = (files: string[]) =>
  files.filter(
    (f) => !SCOPE.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
  );

test("changes stay within PRV-7 scope", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  const own = ownPr();
  test.skip(
    "skip" in own,
    `${"skip" in own ? own.skip : ""}: PRV-7's scope is checked on its own PR.`
  );
  const { base, head } = (own as { range: PrRange }).range;
  const files = git(["diff", "--name-only", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean);
  expect(outsideScope(files)).toEqual([]);
  // Control: a file outside Scope is caught.
  expect(
    outsideScope(["app/page.tsx", "components/range/x.tsx", "lib/flags.ts"])
  ).toEqual(["app/page.tsx", "lib/flags.ts"]);

  // The ticket: only its id line is dropped.
  const before = git(["show", `${base}:docs/tickets/PRV-7.md`]);
  expect(before.startsWith("PRV-7\n")).toBe(true);
  expect(read("docs/tickets/PRV-7.md")).toBe(before.slice("PRV-7\n".length));

  // merged.json gains only PRV-7.
  expect(JSON.parse(read(MERGED))).toEqual([
    ...showJson<string[]>(base, MERGED),
    "PRV-7",
  ]);

  // sections.json changes only the three lab interior rows' built flags.
  const sectionsBefore = showJson<Sections>(base, SECTIONS);
  const sectionsAfter = JSON.parse(read(SECTIONS)) as Sections;
  const strip = (s: Sections) => ({
    ...s,
    rows: s.rows.map((r) =>
      PRV7_ROWS.includes(r.id) ? { ...r, built: false } : r
    ),
  });
  expect(strip(sectionsAfter)).toEqual(strip(sectionsBefore));
  for (const id of PRV7_ROWS)
    expect(sectionsBefore.rows.find((r) => r.id === id)?.built).toBe(false);

  // deviations.md: D2 drops the three lab plates (now built, not blank), the
  // PRV-7 rows are added, and every other row is untouched.
  const was = parseDeviations(git(["show", `${base}:${DEVIATIONS}`]));
  const now = parseDeviations(read(DEVIATIONS));
  const SIGNED = "owner, 2026-11-27";
  const copyRows = ["P7-1", "P7-2", "P7-3"];
  const geometry = [
    "P7-4a",
    "P7-4b",
    "P7-4c",
    "P7-4d",
    "P7-4e",
    "P7-4f",
    "P7-4g",
  ];
  const added = [...copyRows, ...geometry];
  expect(now.map((d) => d.id)).toEqual([...was.map((d) => d.id), ...added]);
  // D1 differs from the base only by the owner's signature; D2 is narrowed;
  // every other row is untouched.
  for (const d of was.filter((x) => x.id !== "D2" && x.id !== "D1"))
    expect(now.find((x) => x.id === d.id)).toEqual(d);
  expect(now.find((d) => d.id === "D1")).toEqual({
    ...was.find((d) => d.id === "D1")!,
    accepted: SIGNED,
  });
  const d2 = was.find((d) => d.id === "D2")!;
  expect(now.find((d) => d.id === "D2")).toEqual({
    ...d2,
    section: ["seth/photos", "christine/photos"],
    state: d2.state.filter((s) => !/^tab-/.test(s)),
  });
  for (const id of copyRows) {
    const d = now.find((x) => x.id === id)!;
    expect(d.accepted).toBe(SIGNED);
    expect(d.property).toBe("copy");
  }
  // The geometry rows cover only the 3D plate's description and caption
  // heights and y, and the frame's height.
  for (const id of geometry) {
    const d = now.find((x) => x.id === id)!;
    expect(d.accepted).toBe(SIGNED);
    expect(d.section).toEqual(["home/plate-3d-interior"]);
    expect(d.state).toEqual(["tab-3d", "tab-3d-rm"]);
    expect(d.property).toMatch(/^key (text:[014]|frame:0) (height|y)$/);
  }

  // The public home and the non-lab plates keep their content.
  await open(page, 1440);
  for (const i of [0, 1, 5, 6]) {
    await pick(page, i);
    await expect(
      page.locator('[data-board-section$="-interior"]:visible')
    ).toHaveCount(0);
    await expect(page.locator("[data-lab-demo]")).toHaveCount(0);
  }
  const home = await (await page.request.get("/")).text();
  expect(home).not.toContain("data-lab-demo");
  expect(home).not.toContain("Pocket habit tracker");
});
