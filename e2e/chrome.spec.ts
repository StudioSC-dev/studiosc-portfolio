import { expect, type Page, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../lib/theme";
import { collectErrors, stubVercelInsights } from "./support/page";

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
