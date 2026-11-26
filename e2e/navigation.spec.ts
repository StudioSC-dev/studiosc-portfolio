import { test, expect, type Page } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../lib/theme";

const header = (page: Page) =>
  page.locator('[data-board-section="chrome/header"]');
const footer = (page: Page) =>
  page.locator('[data-board-section="chrome/footer"]');

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

      await nav.getByRole("link", { name: "Writing", exact: true }).click();
      await expect(page).toHaveURL(/\/blog$/);
      await expect(page.getByRole("heading", { name: "Blog" })).toBeVisible();

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
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" })
    ).toBeVisible();
    await expect(header(page)).toBeVisible();
    await expect(footer(page)).toBeVisible();

    // In the active theme: a stored dark choice paints the page dark.
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      colorScheme: "light",
    });
    const dark = await context.newPage();
    await dark.addInitScript(
      (key) => localStorage.setItem(key, "dark"),
      THEME_STORAGE_KEY
    );
    await dark.goto("/no-such-page");
    await expect(dark.locator("html")).toHaveAttribute("data-theme", "dark");
    const [background, gallery] = await dark.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--gallery)";
      document.body.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      const page = getComputedStyle(document.documentElement).backgroundColor;
      return [page, colour];
    });
    expect(background).toBe(gallery);
    await context.close();

    // The shared home link leads back to /.
    await header(page).getByRole("link", { name: "StudioSC, home" }).click();
    await expect(page).toHaveURL("/");
  });
});
