import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.describe("desktop nav links", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("should navigate to all main pages", async ({ page }) => {
      await page.goto("/");
      const header = page.locator("header");

      // Test header navigation
      await header.getByRole("link", { name: "About", exact: true }).click();
      await expect(page).toHaveURL(/.*about/);
      await expect(
        page.getByRole("heading", { name: "About Us" })
      ).toBeVisible();

      await header.getByRole("link", { name: "Blog", exact: true }).click();
      await expect(page).toHaveURL(/.*blog/);
      await expect(page.getByRole("heading", { name: "Blog" })).toBeVisible();

      await header.getByRole("link", { name: "Contact", exact: true }).click();
      await expect(page).toHaveURL(/.*contact/);
      await expect(page.getByText("Contact Us")).toBeVisible();

      await header.getByRole("link", { name: "Home", exact: true }).click();
      await expect(page).toHaveURL("/");
    });
  });

  test("should have mobile menu on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "Toggle menu" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    await expect(
      page
        .locator("#mobile-menu")
        .getByRole("link", { name: "About", exact: true })
    ).toBeVisible();
  });
});
