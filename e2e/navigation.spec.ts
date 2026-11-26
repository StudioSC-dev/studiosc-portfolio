import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { THEME_STORAGE_KEY, type Theme } from "../lib/theme";
import { readJson } from "../scripts/boards/model";
import { ROOT } from "./support/git";

const header = (page: Page) =>
  page.locator('[data-board-section="chrome/header"]');
const footer = (page: Page) =>
  page.locator('[data-board-section="chrome/footer"]');

/**
 * Writing keeps href="/blog"; once PRV-14 merges, /blog redirects to the work
 * stream, whose heading is "How we build".
 */
const writingMoved = readJson<string[]>(
  path.join(ROOT, "docs/boards/merged.json")
).includes("PRV-14");
const WRITING = writingMoved
  ? { url: /\/blog\/work$/, heading: "How we build" }
  : { url: /\/blog$/, heading: "Blog" };

/**
 * Opens the 404 with `theme` chosen explicitly (stored), under the opposite
 * system setting, and reads what is painted: the heading in main, the surface
 * behind it, and the chrome.
 */
async function notFoundIn(browser: Browser, baseURL: string, theme: Theme) {
  const context = await browser.newContext({
    baseURL,
    colorScheme: theme === "dark" ? "light" : "dark",
  });
  const page = await context.newPage();
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    THEME_STORAGE_KEY,
    theme,
  ] as const);
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const heading = page
    .getByRole("main")
    .getByRole("heading", { level: 1, name: "Page not found" });
  await expect(heading).toBeVisible();
  await expect(header(page)).toBeVisible();
  await expect(footer(page)).toBeVisible();
  const painted = await page.evaluate(() => {
    const token = (name: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    };
    // The colour actually behind an element: its first painted ancestor.
    const surface = (el: Element | null) => {
      for (let at = el; at; at = at.parentElement) {
        const bg = getComputedStyle(at).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      }
      return "none";
    };
    const h1 = document.querySelector("main h1")!;
    const box = h1.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );
    const chrome = ["chrome/header", "chrome/footer"].map((id) => {
      const el = document.querySelector(`[data-board-section="${id}"]`)!;
      const text = el.querySelector("a, p")!;
      return {
        id,
        surface: surface(el),
        colour: getComputedStyle(text).color,
      };
    });
    return {
      gallery: token("--gallery"),
      ink: token("--ink"),
      headingOnTop: hit !== null && (hit === h1 || h1.contains(hit)),
      headingSurface: surface(h1),
      headingColour: getComputedStyle(h1).color,
      chrome,
    };
  });
  await context.close();
  return painted;
}

test.describe("Navigation", () => {
  test.describe("desktop nav links", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("should navigate to all main pages", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name.startsWith("Mobile"), "desktop nav");
      await page.goto("/");
      const nav = header(page).getByRole("navigation", { name: "Main" });

      await nav.getByRole("link", { name: "Work", exact: true }).click();
      await expect(page).toHaveURL(/\/work$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const writing = nav.getByRole("link", { name: "Writing", exact: true });
      await expect(writing).toHaveAttribute("href", "/blog");
      await writing.click();
      await expect(page).toHaveURL(WRITING.url);
      await expect(
        page.getByRole("heading", { level: 1, name: WRITING.heading })
      ).toBeVisible();

      await nav.getByRole("link", { name: "Start a project" }).click();
      await expect(page).toHaveURL(/\/contact$/);

      await header(page).getByRole("link", { name: "StudioSC, home" }).click();
      await expect(page).toHaveURL("/");
    });
  });

  test("should have mobile menu on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuButton = header(page).getByRole("button", { name: "Menu" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    await expect(
      page
        .locator("#phone-menu")
        .getByRole("link", { name: "Work", exact: true })
    ).toBeVisible();
  });

  test("themed generic 404", async ({ page, browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL!;
    const galleries: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      const painted = await notFoundIn(browser, baseURL, theme);
      galleries.push(painted.gallery);
      // Nothing covers the message, and it sits on the theme's own surface.
      expect(painted.headingOnTop, theme).toBe(true);
      expect(painted.headingSurface, theme).toBe(painted.gallery);
      expect(painted.headingColour, theme).toBe(painted.ink);
      for (const part of painted.chrome) {
        expect(part.surface, `${theme} ${part.id}`).toBe(painted.gallery);
        expect(part.colour, `${theme} ${part.id}`).toBe(painted.ink);
      }
    }
    // The two themes really differ.
    expect(galleries[0]).not.toBe(galleries[1]);

    // The shared home link leads back to /.
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await header(page).getByRole("link", { name: "StudioSC, home" }).click();
    await expect(page).toHaveURL("/");
  });
});
