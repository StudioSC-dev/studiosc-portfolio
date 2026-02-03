import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("should navigate to all main pages", async ({ page }) => {
    await page.goto("/");

    // Test header navigation
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/.*about/);
    await expect(page.getByText("About Us")).toBeVisible();

    await page.getByRole("link", { name: "Blog" }).click();
    await expect(page).toHaveURL(/.*blog/);
    await expect(page.getByText("Blog")).toBeVisible();

    await page.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/.*contact/);
    await expect(page.getByText("Contact Us")).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL("/");
  });

  test("should have mobile menu on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "Toggle menu" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    await expect(page.getByRole("link", { name: "About" })).toBeVisible();
  });
});
