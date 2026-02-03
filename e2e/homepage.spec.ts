import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("should display hero section with brand header", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("StudioSC")).toBeVisible();
    await expect(
      page.getByText("High-Integrity Engineering & Quality Assurance")
    ).toBeVisible();
    await expect(
      page.getByText(
        "We build and harden digital products. StudioSC combines senior-level"
      )
    ).toBeVisible();
  });

  test("should display two-pillar layout", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Two Pillars, One Mission")).toBeVisible();
    await expect(page.getByText("The Build")).toBeVisible();
    await expect(page.getByText("The Quality")).toBeVisible();
    await expect(page.getByText("View Engineering Portfolio")).toBeVisible();
    await expect(page.getByText("View QA Case Studies")).toBeVisible();
  });

  test("should navigate to about page from two-pillar buttons", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByText("View Engineering Portfolio").click();
    await expect(page).toHaveURL(/.*about#seth/);
  });
});
