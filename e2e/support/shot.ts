import type { Page, TestInfo } from "@playwright/test";

/** The width each screenshot project captures at. */
export const SHOT_WIDTHS: Record<string, number> = {
  chromium: 1440,
  "Mobile Chrome": 390,
};

export interface Shot {
  path: string;
  width: number;
}

/**
 * A full-page screenshot of the current page: 1440px wide in Chromium, 390px
 * in Mobile Chrome, in CSS pixels. It is written to the test's output dir and
 * attached to the report. In other projects it takes none and returns null.
 */
export async function shot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<Shot | null> {
  const width = SHOT_WIDTHS[testInfo.project.name];
  if (!width) return null;
  const height = page.viewportSize()?.height ?? 900;
  await page.setViewportSize({ width, height });
  await page.evaluate(() => document.fonts.ready);
  const file = testInfo.outputPath(`${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true, scale: "css" });
  await testInfo.attach(`${name}-${width}`, {
    path: file,
    contentType: "image/png",
  });
  return { path: file, width };
}
