import { test, expect } from "@playwright/test";

test.describe("Tally & Trace rework post", () => {
  test("renders the title and all Mermaid diagrams as SVG", async ({
    page,
  }) => {
    await page.goto("/blog/tallyandtrace-rework");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "From Entities to Owners: Reworking Tally & Trace",
      })
    ).toBeVisible();

    const diagrams = page.locator(
      "article svg[id^='mermaid'], article svg[aria-roledescription]"
    );
    await expect(diagrams).toHaveCount(4, { timeout: 30_000 });
    await expect(page.getByText("Mermaid render error")).toHaveCount(0);
  });
});
