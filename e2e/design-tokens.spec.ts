import fs from "node:fs";
import path from "node:path";

import { expect, test, type TestInfo } from "@playwright/test";

import {
  docGaps,
  withoutRow,
  withoutSection,
} from "./fixtures/design-tokens/checks";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const DOC = "docs/design-system.md";

/** Tests that read files or git run once, in the desktop Chromium project. */
function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "Reads files, git or a second server: runs once, in the chromium project."
  );
}

// ===========================================================================

test.describe("Range design system", () => {
  test("design system documentation covers the scoped inventory", async () => {
    const testInfo = test.info();
    chromiumOnly(testInfo);
    const markdown = read(DOC);
    expect(docGaps(markdown)).toEqual([]);

    // An entry removed from the doc fails.
    expect(docGaps(withoutRow(markdown, "--frag-cc-news"))).toContain(
      "Product palettes: --frag-cc-news"
    );
    expect(docGaps(withoutRow(markdown, "--paper"))).toContain(
      "Legacy aliases: --paper -> --gallery"
    );
    expect(docGaps(withoutSection(markdown, "Lab tag"))).toContain(
      "Components: Lab tag"
    );
    expect(
      docGaps(withoutSection(markdown, "Font fallback")).length
    ).toBeGreaterThan(0);

    // Nothing private: the doc cites boards by name, never by location.
    expect(markdown).not.toMatch(
      /\/(home|srv|tmp|Users)\/|\.dc\.html|LAB_[D]OMAIN|localhost/
    );
  });
});
