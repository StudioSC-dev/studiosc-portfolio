import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../lib/theme";
import { STATUS_KEYS, STATUSES } from "../lib/statuses";
import { TSX } from "./support/config";
import { collectErrors, stubVercelInsights } from "./support/page";
import { ROOT } from "./support/git";

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
