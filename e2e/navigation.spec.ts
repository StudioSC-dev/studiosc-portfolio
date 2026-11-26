import { test, expect, type Page } from "@playwright/test";

const header = (page: Page) =>
  page.locator('[data-board-section="chrome/header"]');

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
});
