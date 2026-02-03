import { test, expect } from "@playwright/test";

test.describe("Contact Form", () => {
  test("should display contact form with all fields", async ({ page }) => {
    await page.goto("/contact");

    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Company")).toBeVisible();
    await expect(page.getByLabel("What can we help with?")).toBeVisible();
    await expect(page.getByLabel("Project Goals")).toBeVisible();
    await expect(page.getByLabel("Estimated Budget")).toBeVisible();
    await expect(page.getByLabel("How did you hear about us?")).toBeVisible();
  });

  test("should validate required fields", async ({ page }) => {
    await page.goto("/contact");

    await page.getByRole("button", { name: "Send Message" }).click();

    // Check for validation errors
    await expect(
      page.getByText(/Name must be at least 2 characters/i)
    ).toBeVisible();
  });

  test("should show recruiter note", async ({ page }) => {
    await page.goto("/contact");

    await expect(page.getByText(/Looking for a full-time hire/i)).toBeVisible();
    await expect(page.getByText("hello@studiosc.dev")).toBeVisible();
  });
});
