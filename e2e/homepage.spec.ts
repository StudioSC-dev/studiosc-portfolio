import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should display hero section with brand header", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "We build resilient software."
    );
    await expect(
      page.getByText(
        "A specialized engineering duo bridging the gap between high-velocity"
      )
    ).toBeVisible();
  });

  test("should display the build and break sections", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "The Build" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "The Break" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View the Studio Showcase" })
    ).toBeVisible();
  });

  test("should navigate to the work page from the hero", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "View the Studio Showcase" }).click();
    await expect(page).toHaveURL(/.*work/);
  });
});
