import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import * as links from "../lib/links";
import { THEME_STORAGE_KEY } from "../lib/theme";
import { STATUS_KEYS, STATUSES } from "../lib/statuses";
import { checkSite } from "../scripts/boards/check";
import { describe as describeFailure } from "../scripts/boards/compare";
import {
  isAccepted,
  loadBoards,
  readJson,
  type Sections,
} from "../scripts/boards/model";
import { TSX } from "./support/config";
import { BUDGET_ROUTES } from "./support/perf";
import { collectErrors, stubVercelInsights } from "./support/page";
import { existsAt, git, prRange, type PrRange, ROOT } from "./support/git";

/**
 * PRV-4: the shared header and footer, the theme switch, and the shared
 * primitives (CtaLink, PageHeader, StatusText, FilterGroup).
 */

const DESKTOP = { width: 1440, height: 900 };

const chromiumOnly = (name: string) =>
  test.skip(name !== "chromium", "one browser is enough for this check");

async function open(page: Page, route: string) {
  await stubVercelInsights(page);
  const response = await page.goto(route);
  await page.waitForLoadState("networkidle");
  return response;
}

/** The token values for both themes, read off :root. */
async function themeTokens(page: Page, name: string) {
  return page.evaluate((token) => {
    const root = document.documentElement;
    const was = root.getAttribute("data-theme");
    const read = (theme: string) => {
      root.setAttribute("data-theme", theme);
      return getComputedStyle(root).getPropertyValue(token).trim();
    };
    const out = { light: read("light"), dark: read("dark") };
    if (was) root.setAttribute("data-theme", was);
    return out;
  }, name);
}

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));

const toggle = (page: Page) =>
  page.getByRole("button", { name: /^Switch to the (dark|light) theme$/ });

/** Stores a theme choice before any page script runs. */
const storeChoice = (page: Page, choice: string) =>
  page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [THEME_STORAGE_KEY, choice]
  );

/** Every read of localStorage throws, as when site data is blocked. */
const blockStorage = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage is blocked", "SecurityError");
      },
    });
  });

interface FirstFrame {
  theme: string | null;
  gallery: string;
}

/** Records the theme and --gallery on the page's first animation frame. */
const recordFirstFrame = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __firstFrame: Promise<FirstFrame> };
    w.__firstFrame = new Promise((resolve) =>
      requestAnimationFrame(() => {
        const root = document.documentElement;
        resolve({
          theme: root.getAttribute("data-theme"),
          gallery: getComputedStyle(root).getPropertyValue("--gallery").trim(),
        });
      })
    );
  });

const firstFrame = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __firstFrame: Promise<FirstFrame> }).__firstFrame
  );

/** Holds back every Next.js script, so nothing hydrates. */
const holdHydration = (page: Page) =>
  page.route(/\/_next\/static\/.*\.js(\?|$)/, (route) => route.abort());

/**
 * Where a nav link lands: Writing keeps href="/blog", and once PRV-14 merges
 * /blog redirects to the work stream at /blog/work.
 */
const landsOn = (href: string) =>
  href === "/blog" &&
  readJson<string[]>(path.join(ROOT, "docs/boards/merged.json")).includes(
    "PRV-14"
  )
    ? "/blog/work"
    : href;

const CASE_SLUGS = readdirSync(path.join(ROOT, "content/projects"))
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => f.replace(/\.mdx$/, ""));

/** The computed colour a token resolves to, as `rgb(...)`. */
async function tokenColour(page: Page, token: string) {
  return page.evaluate((t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

interface Render {
  /** The component's module, repo-relative. */
  module: string;
  props: Record<string, unknown>;
  children?: string;
}

/**
 * Renders shared components to static markup in a plain Node process. The
 * test runner compiles JSX for its own component testing, so a component
 * imported here would not render as React.
 */
function renderMarkup(renders: Render[]): string[] {
  // Outside the repo, so no lint, type-check or git status ever sees it.
  const dir = mkdtempSync(path.join(tmpdir(), "prv4-render-"));
  const script = path.join(dir, "render.mjs");
  const calls = renders.map((r, i) => {
    const args = [`C${i}`, JSON.stringify(r.props)];
    if (r.children !== undefined) args.push(JSON.stringify(r.children));
    return `renderToStaticMarkup(createElement(${args.join(", ")}))`;
  });
  writeFileSync(
    script,
    [
      'import { createRequire } from "node:module";',
      `const require = createRequire(${JSON.stringify(path.join(ROOT, "package.json"))});`,
      'const { createElement } = require("react");',
      'const { renderToStaticMarkup } = require("react-dom/server");',
      ...renders.map(
        (r, i) =>
          `const C${i} = (await import(${JSON.stringify(path.join(ROOT, r.module))})).default;`
      ),
      `console.log(JSON.stringify([${calls.join(", ")}]));`,
    ].join("\n")
  );
  try {
    const out = execFileSync(
      TSX,
      ["--tsconfig", path.join(ROOT, "tsconfig.json"), script],
      { cwd: ROOT, encoding: "utf8" }
    );
    return JSON.parse(out.trim().split("\n").at(-1)!) as string[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PHONE = { width: 390, height: 844 };

/** The header's nav, in order: [label, href]. */
const NAV: [string, string][] = [
  ["Work", "/work"],
  ["Writing", "/blog"],
  ["Start a project", "/contact"],
];

/** An arrow glyph at the end of a label: →, ↓, ↗, ⟶, ➔ and the like. */
const TRAILING_ARROW = /[←-⇿➔-➿⟰-⟿⤀-⥿⬀-⬯]\s*$/u;

/** The files a module reaches through local imports, repo-relative. */
function localImports(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(path.join(ROOT, entry), "utf8");
  const specifiers = [
    ...source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  for (const spec of specifiers) {
    let base: string | null = null;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith("."))
      base = path.posix.join(path.posix.dirname(entry), spec);
    if (!base) continue;
    const file = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ].find(
      (f) =>
        /\.(ts|tsx)$/.test(f) &&
        existsSync(path.join(ROOT, f)) &&
        statSync(path.join(ROOT, f)).isFile()
    );
    if (file) localImports(file, seen);
  }
  return seen;
}

/** The board's footer: its copy, and its links as [label, href]. */
function boardFooter(board: string) {
  const html = readFileSync(path.join(ROOT, "docs/boards", board), "utf8");
  const footer = /<footer[\s\S]*?<\/footer>/.exec(html)?.[0] ?? "";
  const text = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const anchors = [
    ...footer.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
  ].map((m) => [text(m[2]), m[1]]);
  return { copy: text(footer), links: anchors };
}

/** Left edges at the shared alignment points: header, first heading, footer. */
async function leftEdges(page: Page, phone: boolean) {
  return page.evaluate((isPhone) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const header = document.querySelector(
      '[data-board-section="chrome/header"]'
    )!;
    const anchor = isPhone
      ? [...header.querySelectorAll("button")].find(
          (b) => visible(b) && /theme$/.test(b.getAttribute("aria-label") ?? "")
        )
      : header.querySelector('a[aria-label="StudioSC, home"]');
    const heading = [
      ...document.querySelectorAll("main h1, main h2, main h3, main h4"),
    ].find(visible);
    const footer = document.querySelector(
      '[data-board-section="chrome/footer"] p'
    );
    return {
      header: anchor?.getBoundingClientRect().left ?? NaN,
      heading: heading?.getBoundingClientRect().left ?? NaN,
      footer: footer?.getBoundingClientRect().left ?? NaN,
    };
  }, phone);
}

/** Every file under `dir`, repo-relative. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir), {
    withFileTypes: true,
  })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(rel));
    else out.push(rel);
  }
  return out;
}

/** The files PRV-4 may change (AC12), and the ticket it commits. */
const SCOPE = [
  "app/layout.tsx",
  "app/not-found.tsx",
  "lib/theme.ts",
  "lib/links.ts",
  "components/layout/",
  "components/ui/",
  "components/contact/ContactForm.tsx",
  "e2e/fixtures/perf-baseline.json",
  "e2e/guards.spec.ts",
  "docs/boards/sections.json",
  "docs/boards/merged.json",
  "e2e/chrome.spec.ts",
  "e2e/navigation.spec.ts",
  "docs/tickets/PRV-4.md",
];

/** Files PRV-4 may change only where a line calls a changed primitive. */
const CALLERS = [
  "app/work/page.tsx",
  "app/work/[slug]/page.tsx",
  "app/blog/page.tsx",
  "app/about/page.tsx",
  "app/contact/page.tsx",
  "app/privacy/hermes-personal-assistant/page.tsx",
  "components/home/Hero.tsx",
  "components/home/ProjectCard.tsx",
  "app/page.tsx",
];

/**
 * What a change in a caller may be about: a changed primitive (its import,
 * its call, the removed `label` eyebrow and `size`), or the removed export.
 */
const CALLER_HUNK =
  /StatusBadge|StatusText|CtaLink|PageHeader|^\s*label="|INSTAGRAM|Sized `sm`/m;

/** An outer content wrapper, moved onto the shared left edge. */
const WRAPPER_LINE = /^\s*<(?:section|div) className="[^"]*">\s*$/;

/** The callers whose outer content wrappers may move to the shared edge. */
const WRAPPER_FILES = [
  "components/home/Hero.tsx",
  "components/home/ProjectCard.tsx",
  "app/page.tsx",
  // The /work wrapper carries the shared left edge AC1 asks for.
  "app/work/page.tsx",
];

/** A file's changed hunks, each as its removed and added lines. */
function hunks(fork: string, head: string, file: string): string[][] {
  const out: string[][] = [];
  for (const line of git(["diff", "-U0", fork, head, "--", file]).split("\n")) {
    if (line.startsWith("@@")) out.push([]);
    else if (out.length && /^[+-](?![+-]{2} )/.test(line))
      out[out.length - 1].push(line.slice(1));
  }
  return out;
}

const SPEC_FILE = "e2e/chrome.spec.ts";

/** PRV-4's own PR, or why its one-time checks skip. */
function ownPr(): { range: PrRange } | { skip: string } {
  const range = prRange();
  if (!range) return { skip: "a push build has no PR to judge" };
  if (existsAt(range.base, SPEC_FILE))
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  return { range };
}

test.describe("chrome", () => {
  test("theme follows, stores, no flash", async ({ page }) => {
    await stubVercelInsights(page);
    const errors = collectErrors(page);

    // No saved choice: the system setting, on load and when it changes.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const gallery = await themeTokens(page, "--gallery");
    expect(await theme(page)).toBe("dark");
    await expect(toggle(page)).toHaveAccessibleName(
      "Switch to the light theme"
    );
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
    await expect(toggle(page)).toHaveAccessibleName("Switch to the dark theme");

    // A choice is stored, survives a reload and beats the system setting.
    await toggle(page).click();
    await expect.poll(() => theme(page)).toBe("dark");
    await expect(toggle(page)).toHaveAccessibleName(
      "Switch to the light theme"
    );
    await page.reload();
    expect(await theme(page)).toBe("dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    expect(await theme(page)).toBe("dark");
    expect(errors).toEqual([]);

    // The first frame, with hydration held back.
    const cases: [
      string,
      "light" | "dark" | null,
      "light" | "dark",
      boolean,
    ][] = [
      ["saved dark, light system", "dark", "light", false],
      ["saved light, dark system", "light", "dark", false],
      ["no choice, light system", null, "light", false],
      ["no choice, dark system", null, "dark", false],
      ["storage blocked, dark system", null, "dark", true],
    ];
    for (const [name, saved, system, blocked] of cases) {
      const context = await page.context().browser()!.newContext({
        baseURL: test.info().project.use.baseURL,
        colorScheme: system,
      });
      const p = await context.newPage();
      await stubVercelInsights(p);
      await holdHydration(p);
      if (saved) await storeChoice(p, saved);
      if (blocked) await blockStorage(p);
      await recordFirstFrame(p);
      await p.goto("/");
      const expected = saved ?? system;
      const frame = await firstFrame(p);
      expect(frame, name).toEqual({
        theme: expected,
        gallery: gallery[expected],
      });
      await context.close();
    }
  });

  test("theme follows, stores, no flash: storage that throws", async ({
    page,
  }) => {
    await stubVercelInsights(page);
    const errors = collectErrors(page);
    await blockStorage(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await theme(page)).toBe("dark");
    await toggle(page).click();
    await expect.poll(() => theme(page)).toBe("light");
    await expect(toggle(page)).toHaveAccessibleName("Switch to the dark theme");
    // The choice holds for the page though storage could not keep it.
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await theme(page)).toBe("light");
    expect(errors).toEqual([]);
  });

  test("theme follows, stores, no flash: a change while hydrating", async ({
    page,
  }) => {
    await stubVercelInsights(page);
    // Hold every Next.js script until the system setting has changed.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
      await held;
      await route.continue();
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    // The head script ran before the change; only hydration can catch it.
    expect(await theme(page)).toBe("light");
    release();
    await expect.poll(() => theme(page)).toBe("dark");
    await expect(toggle(page)).toHaveAccessibleName(
      "Switch to the light theme"
    );
  });

  test("theme reveal and its fallbacks", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    await page.setViewportSize(DESKTOP);
    await open(page, "/");
    const errors = collectErrors(page);

    // Keep the transition the toggle starts, to inspect it.
    await page.evaluate(() => {
      const w = window as unknown as { __vt: ViewTransition | null };
      const start = document.startViewTransition.bind(document);
      w.__vt = null;
      document.startViewTransition = (
        update?: ViewTransitionUpdateCallback
      ) => {
        const t = start(update);
        w.__vt = t;
        return t;
      };
    });
    const button = toggle(page);
    const box = (await button.boundingBox())!;
    await button.click();
    const reveal = await page.evaluate(async () => {
      const w = window as unknown as { __vt: ViewTransition | null };
      if (!w.__vt) return null;
      await w.__vt.ready;
      const root = document.documentElement;
      const animations = document
        .getAnimations()
        .filter(
          (a) =>
            (a.effect as KeyframeEffect | null)?.pseudoElement ===
            "::view-transition-new(root)"
        );
      const a = animations[0] as CSSAnimation | undefined;
      const effect = a?.effect as KeyframeEffect | undefined;
      return {
        name: a?.animationName ?? null,
        duration: effect?.getComputedTiming().duration ?? null,
        from: String(effect?.getKeyframes()[0]?.clipPath ?? ""),
        to: String(effect?.getKeyframes().at(-1)?.clipPath ?? ""),
        rx: getComputedStyle(root).getPropertyValue("--rx").trim(),
        ry: getComputedStyle(root).getPropertyValue("--ry").trim(),
      };
    });
    expect(reveal).not.toBeNull();
    expect(reveal!.name).toBe("theme-reveal");
    expect(reveal!.duration).toBe(560);
    // A circle that grows from nothing, centred on the toggle, until it
    // covers the whole viewport.
    const centre = `${box.x + box.width / 2}px ${box.y + box.height / 2}px`;
    expect(reveal!.from).toBe(`circle(0px at ${centre})`);
    const end = /^circle\(([\d.]+)px at (.+)\)$/.exec(reveal!.to);
    expect(end?.[2]).toBe(centre);
    expect(Number(end?.[1])).toBeGreaterThanOrEqual(
      Math.hypot(DESKTOP.width, DESKTOP.height)
    );
    expect(`${reveal!.rx} ${reveal!.ry}`).toBe(centre);
    await expect.poll(() => theme(page)).toBe("dark");

    // Reduced motion: no transition is started, and the theme still changes.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      (window as unknown as { __vt: ViewTransition | null }).__vt = null;
    });
    await toggle(page).click();
    expect(await theme(page)).toBe("light");
    expect(
      await page.evaluate(
        () => (window as unknown as { __vt: ViewTransition | null }).__vt
      )
    ).toBeNull();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // No startViewTransition: an instant change, with no error.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      Reflect.deleteProperty(Document.prototype, "startViewTransition");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => "startViewTransition" in document)).toBe(
      false
    );
    const before = await theme(page);
    await toggle(page).click();
    expect(await theme(page)).toBe(before === "dark" ? "light" : "dark");
    expect(errors).toEqual([]);
  });
});

test.describe("chrome", () => {
  test("status as a word", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    // The shared renderer: the word, and nothing else, for all four.
    const rendered = renderMarkup(
      STATUS_KEYS.map((status) => ({
        module: "components/ui/StatusText.tsx",
        props: { status },
      }))
    );
    expect(rendered).toEqual(
      STATUS_KEYS.map(
        (status) =>
          `<span data-status="${status}">${STATUSES[status].label}</span>`
      )
    );

    const routes = ["/", "/work", ...CASE_SLUGS.map((s) => `/work/${s}`)];
    for (const route of routes) {
      await open(page, route);
      const shown = await page.locator("[data-status]").evaluateAll((els) =>
        els.map((el) => {
          const own = getComputedStyle(el);
          const parent = getComputedStyle(el.parentElement!);
          const pseudo = (p: string) => getComputedStyle(el, p).content;
          return {
            status: el.getAttribute("data-status"),
            text: el.textContent,
            children: el.childElementCount,
            before: pseudo("::before"),
            after: pseudo("::after"),
            colourOwn: own.color === parent.color,
            background: own.backgroundColor,
          };
        })
      );
      expect(shown.length, route).toBeGreaterThan(0);
      for (const s of shown) {
        const label = STATUSES[s.status as keyof typeof STATUSES]?.label;
        expect(s, route).toEqual({
          status: s.status,
          text: label,
          children: 0,
          before: "none",
          after: "none",
          colourOwn: true,
          background: "rgba(0, 0, 0, 0)",
        });
      }
    }
  });

  test("shared primitives", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    const markup = renderMarkup([
      {
        module: "components/ui/CtaLink.tsx",
        props: { href: "/work" },
        children: "Every project",
      },
      {
        module: "components/ui/CtaLink.tsx",
        props: { href: "/contact", variant: "secondary" },
        children: "Start a project",
      },
      {
        module: "components/layout/PageHeader.tsx",
        props: { title: "Every project", lead: "A lead." },
      },
      {
        module: "components/ui/FilterGroup.tsx",
        props: {
          label: "Filter by status",
          options: [
            { value: "all", label: "All" },
            { value: "live", label: "Live" },
            { value: "in-qa", label: "In QA" },
          ],
          selected: "live",
        },
      },
    ]).join("");
    expect(markup).not.toMatch(/[←-⇿➔-➿⟰-⟿]/u);

    await open(page, "/no-such-page");
    await page.evaluate((html) => {
      document.querySelector("main")!.innerHTML =
        `<div id="fixture">${html}</div>`;
    }, markup);
    const fixture = page.locator("#fixture");
    const ink = await tokenColour(page, "--ink");
    const gallery = await tokenColour(page, "--gallery");

    // CtaLink: both variants, 6px, at least 48px tall.
    for (const [variant, background, border] of [
      ["primary", ink, "0px"],
      ["secondary", "rgba(0, 0, 0, 0)", "1px"],
    ]) {
      const cta = fixture.locator(`[data-cta="${variant}"]`);
      await expect(cta).toHaveCSS("border-top-left-radius", "6px");
      await expect(cta).toHaveCSS("background-color", background);
      await expect(cta).toHaveCSS("border-top-width", border);
      expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await expect(fixture.locator('[data-cta="primary"]')).toHaveCSS(
      "color",
      gallery
    );

    // PageHeader: the title and the lead, no eyebrow above the title.
    expect(
      await fixture
        .locator("[data-page-header]")
        .evaluate((el) => [...el.children].map((c) => c.tagName))
    ).toEqual(["H1", "P"]);

    // FilterGroup: pills that are toggles, only the picked one pressed and inked.
    const group = fixture.getByRole("group", { name: "Filter by status" });
    const pills = group.getByRole("button");
    await expect(pills).toHaveCount(3);
    expect(
      await pills.evaluateAll((bs) =>
        bs.map((b) => b.getAttribute("aria-pressed"))
      )
    ).toEqual(["false", "true", "false"]);
    for (const [i, background] of [
      "rgba(0, 0, 0, 0)",
      ink,
      "rgba(0, 0, 0, 0)",
    ].entries()) {
      const pill = pills.nth(i);
      await expect(pill).toHaveCSS("background-color", background);
      const b = (await pill.boundingBox())!;
      const radius = parseFloat(
        await pill.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
      );
      expect(radius).toBeGreaterThanOrEqual(b.height / 2);
    }

    // The pages that use PageHeader show no eyebrow either.
    for (const route of ["/work", "/blog", "/about", "/contact"]) {
      await open(page, route);
      expect(
        await page
          .locator("main [data-page-header]")
          .first()
          .evaluate((el) => el.firstElementChild?.tagName),
        route
      ).toBe("H1");
    }
  });
});

test.describe("chrome", () => {
  test("one left edge", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    for (const route of ["/", "/work"]) {
      for (const viewport of [DESKTOP, PHONE]) {
        await page.setViewportSize(viewport);
        await open(page, route);
        const edges = await leftEdges(page, viewport === PHONE);
        const at = `${route} at ${viewport.width}`;
        expect(Number.isFinite(edges.header), `${at}: header`).toBe(true);
        expect(
          Math.abs(edges.heading - edges.header),
          `${at}: heading`
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(edges.footer - edges.header),
          `${at}: footer`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("nav and current page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("Mobile"), "desktop nav");
    await page.setViewportSize(DESKTOP);
    await open(page, "/");
    const header = page.locator('[data-board-section="chrome/header"]');
    const home = header.getByRole("link", { name: "StudioSC, home" });
    await expect(home).toHaveAttribute("href", "/");

    const nav = header.getByRole("navigation", { name: "Main" });
    const navLinks = nav.getByRole("link");
    await expect(navLinks).toHaveText(NAV.map(([label]) => label));
    expect(
      await navLinks.evaluateAll((as) => as.map((a) => a.getAttribute("href")))
    ).toEqual(NAV.map(([, href]) => href));

    const start = nav.getByRole("link", { name: "Start a project" });
    const ink = await tokenColour(page, "--ink");
    await expect(start).toHaveCSS("background-color", ink);

    const current = () =>
      nav
        .locator('a[aria-current="page"]')
        .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    await expect.poll(current).toEqual([]);

    // Client navigation: a value set on this document survives every click.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: string }).__sameDocument = "yes";
    });
    for (const [label, href] of NAV) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(landsOn(href));
      await expect.poll(current).toEqual([href]);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __sameDocument?: string }).__sameDocument
        ),
        `${label} navigates on the client`
      ).toBe("yes");
    }

    // Loaded directly, each section and its detail pages mark their link.
    const caseRoute = `/work/${CASE_SLUGS[0]}`;
    const postRoute = BUDGET_ROUTES.find((r) => r.startsWith("/blog/"))!;
    const sections: [string, string | null][] = [
      ["/", null],
      ["/about", null],
      ["/work", "/work"],
      [caseRoute, "/work"],
      ["/blog", "/blog"],
      [postRoute, "/blog"],
      ["/contact", "/contact"],
    ];
    for (const [route, section] of sections) {
      await open(page, route);
      await expect.poll(current, route).toEqual(section ? [section] : []);
      const looks = await nav.getByRole("link").evaluateAll((as) =>
        as.map((a) => {
          const css = getComputedStyle(a);
          return {
            href: a.getAttribute("href"),
            line: css.textDecorationLine,
            thickness: css.textDecorationThickness,
            offset:
              parseFloat(css.textUnderlineOffset) / parseFloat(css.fontSize),
            background: css.backgroundColor,
          };
        })
      );
      for (const link of looks) {
        const at = `${route}: ${link.href}`;
        if (link.href === "/contact") {
          // The call to action keeps its fill, current or not.
          expect(link.background, at).toBe(ink);
          expect(link.line, at).toBe("none");
        } else if (link.href === section) {
          expect(link.line, at).toBe("underline");
          expect(link.thickness, at).toBe("2px");
          expect(link.offset, at).toBeCloseTo(0.45, 2);
        } else {
          expect(link.line, at).toBe("none");
        }
      }
    }
  });

  test.describe("phone", () => {
    test.use({ viewport: PHONE });

    test("phone menu in every project", async ({ page }) => {
      await open(page, "/");
      const header = page.locator('[data-board-section="chrome/header"]');
      const themeButton = toggle(page);
      const wordmark = header.getByRole("link", { name: "StudioSC, home" });
      const menu = header.getByRole("button", { name: "Menu" });
      const panel = page.locator("#phone-menu");
      const [t, w, m] = await Promise.all(
        [themeButton, wordmark, menu].map(async (l) => (await l.boundingBox())!)
      );
      expect(t.x + t.width).toBeLessThanOrEqual(w.x);
      expect(Math.abs(w.x + w.width / 2 - PHONE.width / 2)).toBeLessThanOrEqual(
        1
      );
      expect(m.x).toBeGreaterThanOrEqual(w.x + w.width);

      const isOpen = () => panel.evaluate((el) => el.matches(":popover-open"));

      // Opens by click, holding the same three links in order.
      await menu.click();
      await expect.poll(isOpen).toBe(true);
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(panel.getByRole("link")).toHaveText(NAV.map(([l]) => l));
      expect(
        await panel
          .getByRole("link")
          .evaluateAll((as) => as.map((a) => a.getAttribute("href")))
      ).toEqual(NAV.map(([, href]) => href));

      // A link reaches its page and closes the panel; reopened, it is current.
      await panel.getByRole("link", { name: "Work" }).click();
      await expect(page).toHaveURL("/work");
      await expect.poll(isOpen).toBe(false);
      await menu.click();
      await expect.poll(isOpen).toBe(true);
      await expect(panel.getByRole("link", { name: "Work" })).toHaveAttribute(
        "aria-current",
        "page"
      );

      // Escape closes it and gives focus back to Menu.
      await page.keyboard.press("Escape");
      await expect.poll(isOpen).toBe(false);
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "false");

      // It opens from the keyboard too.
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect.poll(isOpen).toBe(true);
      await page.keyboard.press("Escape");
      await expect.poll(isOpen).toBe(false);
      await expect(menu).toBeFocused();

      // A click outside closes it.
      await menu.click();
      await expect.poll(isOpen).toBe(true);
      await page.mouse.click(PHONE.width / 2, PHONE.height - 40);
      await expect.poll(isOpen).toBe(false);

      // So does navigating.
      await menu.click();
      await expect.poll(isOpen).toBe(true);
      await page.goBack();
      await expect(page).toHaveURL("/");
      await expect.poll(isOpen).toBe(false);
    });
  });

  test("plain chrome", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    // No arrow glyph ends a header, footer or CTA label.
    const routes = [
      "/",
      "/work",
      `/work/${CASE_SLUGS[0]}`,
      "/blog",
      "/about",
      "/contact",
      "/no-such-page",
    ];
    for (const viewport of [DESKTOP, PHONE]) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await open(page, route);
        const labels = await page
          .locator(
            '[data-board-section="chrome/header"] :is(a, button), [data-board-section="chrome/footer"] a, [data-cta]'
          )
          .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
        expect(labels.length, route).toBeGreaterThan(0);
        expect(
          labels.filter((l) => TRAILING_ARROW.test(l)),
          `${route} at ${viewport.width}`
        ).toEqual([]);
      }
    }

    // What the chrome is built from: no framer-motion, and only the theme
    // toggle and the menu's route handler run on the client.
    const chrome = [
      ...localImports("app/layout.tsx"),
      ...localImports("components/ui/CtaLink.tsx"),
      ...localImports("components/layout/PageHeader.tsx"),
      ...localImports("components/ui/StatusText.tsx"),
      ...localImports("components/ui/FilterGroup.tsx"),
    ];
    const files = [...new Set(chrome)].sort();
    expect(files).toContain("components/layout/Header.tsx");
    expect(files).toContain("components/layout/Footer.tsx");
    const source = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
    expect(
      files.filter((f) => /["']framer-motion["']/.test(source(f)))
    ).toEqual([]);
    expect(
      files.filter((f) => /^\s*["']use client["']/.test(source(f)))
    ).toEqual([
      "components/layout/MenuRouteHandler.tsx",
      "components/ui/ThemeToggle.tsx",
    ]);
  });

  test("footer matches the boards", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    const year = String(new Date().getFullYear());
    const boards = {
      1440: boardFooter("pages-work-desktop.dc.html"),
      390: boardFooter("pages-work-phone.dc.html"),
    } as const;
    for (const viewport of [DESKTOP, PHONE]) {
      const board = boards[viewport.width as 1440 | 390];
      for (const choice of ["light", "dark"]) {
        const context = await page.context().browser()!.newContext({
          baseURL: testInfo.project.use.baseURL,
          viewport,
        });
        const p = await context.newPage();
        await storeChoice(p, choice);
        await open(p, "/work");
        const at = `${viewport.width} ${choice}`;
        expect(await theme(p), at).toBe(choice);
        const footer = p.locator('[data-board-section="chrome/footer"]');
        const copy = (
          await footer.evaluate((el) => (el as HTMLElement).innerText)
        )
          .replace(/\s+/g, " ")
          .trim();
        expect(copy, at).toBe(board.copy.replace("© 2026", `© ${year}`));
        const siteLinks = await footer
          .locator("a")
          .evaluateAll((as) =>
            as.map((a) => [
              (a.textContent ?? "").trim(),
              a.getAttribute("href") ?? "",
            ])
          );
        expect(siteLinks, at).toEqual(board.links);

        // Colours from the theme: ink links, muted tagline.
        const ink = await tokenColour(p, "--ink");
        const muted = await tokenColour(p, "--muted");
        await expect(footer.getByRole("link", { name: "Work" })).toHaveCSS(
          "color",
          ink
        );
        await expect(
          footer.getByText("Seth builds. Christine tests.")
        ).toHaveCSS("color", muted);

        // Layout: desktop sets the brand beside the links (3 to 9 columns);
        // a phone stacks them, with the links in two columns.
        const box = async (name: string) =>
          (await footer
            .getByRole("link", { name, exact: true })
            .boundingBox())!;
        const brand = (await footer
          .getByText("StudioSC", { exact: true })
          .boundingBox())!;
        const work = await box("Work");
        const writing = await box("Writing");
        const about = await box("About");
        if (viewport === DESKTOP) {
          expect(Math.abs(work.y - brand.y), at).toBeLessThanOrEqual(1);
          expect(work.x, at).toBeGreaterThan(brand.x + brand.width);
          expect(Math.abs(writing.y - work.y), at).toBeLessThanOrEqual(1);
          const nav = (await footer
            .getByRole("navigation", { name: "Footer" })
            .boundingBox())!;
          expect(nav.width / brand.width, at).toBeCloseTo(876 / 292, 1);
        } else {
          expect(work.y, at).toBeGreaterThan(brand.y + brand.height);
          expect(Math.abs(work.x - brand.x), at).toBeLessThanOrEqual(1);
          expect(Math.abs(writing.y - work.y), at).toBeLessThanOrEqual(1);
          expect(writing.x, at).toBeGreaterThan(work.x + work.width - 1);
          expect(Math.abs(about.x - work.x), at).toBeLessThanOrEqual(1);
          expect(work.height, at).toBeGreaterThanOrEqual(44);
        }
        await context.close();
      }
    }
  });

  test("PRV-4 fidelity rows", async ({ browser, baseURL }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    test.setTimeout(30 * 60_000);
    const dir = path.join(ROOT, "docs/boards");
    const sections = readJson<Sections>(path.join(dir, "sections.json"));
    const rows = ["chrome/header", "chrome/footer"];
    for (const id of rows) {
      const row = sections.rows.find((r) => r.id === id);
      expect(row?.ticket, id).toBe("PRV-4");
      expect(row?.built, id).toBe(true);
    }
    expect(readJson<string[]>(path.join(dir, "merged.json"))).toContain(
      "PRV-4"
    );

    // The desktop header's PRV-4 reference: Seth and Christine wait for PRV-10.
    const d9 = loadBoards(dir).deviations.find(
      (d) =>
        d.section.includes("chrome/header") &&
        d.property === "later" &&
        d.expires === "PRV-10"
    );
    expect(
      d9,
      "a later deviation on chrome/header expiring with PRV-10"
    ).toBeTruthy();
    expect(d9!.board).toBe('a[href="/seth"], a[href="/christine"]');
    expect.soft(isAccepted(d9!), `${d9!.id} accepted by the owner`).toBe(true);

    const result = await checkSite({
      dir,
      baseURL: baseURL!,
      browser,
      only: { rows },
    });
    // Every row, width and theme ran, in every state the row has.
    const expected = [];
    for (const width of ["1440", "390"])
      for (const t of ["light", "dark"]) {
        for (const s of [
          "default",
          "default-rm",
          "theme-reveal",
          "theme-reveal-rm",
        ])
          expected.push(`chrome/header ${s} ${width} ${t}`);
        for (const s of ["default", "default-rm"])
          expected.push(`chrome/footer ${s} ${width} ${t}`);
      }
    expect([...result.checked].sort()).toEqual(expected.sort());
    expect(result.failures.map(describeFailure)).toEqual([]);
  });
});

test.describe("chrome", () => {
  test("no Instagram links", async ({ page }, testInfo) => {
    chromiumOnly(testInfo.project.name);
    expect(Object.keys(links)).not.toContain("INSTAGRAM");

    for (const file of [
      "components/layout/Footer.tsx",
      "components/contact/ContactForm.tsx",
    ]) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(
        /instagram/i
      );
    }
    await open(page, "/");
    await expect(
      page.locator(
        '[data-board-section="chrome/footer"] a[href*="instagram" i]'
      )
    ).toHaveCount(0);

    // Every instagram.com URL in authored source, and where it sits. A script
    // source is not a hyperlink; the one post URL is PRV-16's.
    const url = /https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com[^\s"'`)]*/gi;
    const found: string[] = [];
    for (const dir of ["app", "components", "content", "lib"]) {
      for (const file of filesUnder(dir)) {
        if (!/\.(tsx?|jsx?|mdx?|json)$/.test(file)) continue;
        const text = readFileSync(path.join(ROOT, file), "utf8");
        for (const m of text.matchAll(url)) {
          const before = text.slice(Math.max(0, m.index - 6), m.index);
          if (/src=["']$/.test(before) && /\.js$/.test(m[0])) continue;
          found.push(`${file} ${m[0]}`);
        }
      }
    }
    expect(found).toEqual([
      "content/blog/first-marathon.mdx https://www.instagram.com/p/DUxtiRsARJw/",
    ]);
  });
});

test.describe("chrome", () => {
  test("changes stay within scope", async ({}, testInfo) => {
    chromiumOnly(testInfo.project.name);
    const own = ownPr();
    test.skip("skip" in own, "skip" in own ? own.skip : "");
    if (!("range" in own)) return;
    const { base, head } = own.range;
    const fork = git(["merge-base", base, head]).trim();
    const changed = git(["diff", "--name-only", fork, head])
      .split("\n")
      .filter(Boolean);
    expect(
      changed.filter(
        (f) =>
          !CALLERS.includes(f) &&
          !SCOPE.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
      )
    ).toEqual([]);

    // Each hunk in a caller is about a changed primitive or the removed
    // export, or (in the files allowed it) only moves an outer wrapper.
    for (const file of changed.filter((f) => CALLERS.includes(f))) {
      const stray = hunks(fork, head, file).filter((lines) => {
        if (CALLER_HUNK.test(lines.join("\n"))) return false;
        const wrapper = lines.every((l) => WRAPPER_LINE.test(l));
        return !(wrapper && WRAPPER_FILES.includes(file));
      });
      expect(stray, file).toEqual([]);
    }
  });
});
