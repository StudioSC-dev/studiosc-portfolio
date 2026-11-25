import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { checkSite, type Only } from "../scripts/boards/check";
import { describe as describeFailure } from "../scripts/boards/compare";
import { readJson, type Sections } from "../scripts/boards/model";

/**
 * PRV-22: every built row in docs/boards/sections.json against the committed
 * board references, at both widths and in both themes. It needs no canvas
 * runtime and no network: only spec.json, ref/ and the site.
 *
 * FIDELITY_BOARDS points it at another boards directory (the harness's
 * fixture canvas). With UI_VERIFY=1 it also writes each board/site pair under
 * test-results/fidelity/ for the verifier, and FIDELITY_VERIFIER_REPORT names
 * the verifier's report: any row in it that reports a visible mismatch fails
 * the run, whatever the numbers say. FIDELITY_ONLY (JSON) narrows the run;
 * only the harness sets it.
 */
const DIR = path.resolve(process.env.FIDELITY_BOARDS || "docs/boards");

/** A verifier report row: `{ "pair": "<name>", "visible": "match" | "mismatch", "note"?: "..." }`. */
interface VerifierRow {
  pair: string;
  visible: string;
  note?: string;
}

test.describe("fidelity", () => {
  test("built rows match the boards", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "pinned rendering is Chromium only"
    );
    test.setTimeout(60 * 60_000);
    const sections = readJson<Sections>(path.join(DIR, "sections.json"));
    const built = sections.rows.filter((r) => r.built).map((r) => r.id);
    const pairsDir =
      process.env.UI_VERIFY === "1"
        ? path.join(testInfo.project.outputDir, "fidelity")
        : undefined;
    // The harness narrows its nested runs; CI never sets this.
    const only = process.env.FIDELITY_ONLY
      ? (JSON.parse(process.env.FIDELITY_ONLY) as Only)
      : undefined;

    const result = await checkSite({
      dir: DIR,
      baseURL: baseURL!,
      browser,
      pairsDir,
      only,
    });

    testInfo.annotations.push({
      type: "fidelity",
      description: built.length
        ? `${built.length} built rows, ${result.checked.length} comparisons`
        : "no row is built yet; nothing to compare",
    });
    for (const u of result.undrawn)
      testInfo.annotations.push({ type: "undrawn (QA)", description: u });

    const report = process.env.FIDELITY_VERIFIER_REPORT;
    const visible: string[] = [];
    if (report) {
      expect(existsSync(report), `verifier report ${report}`).toBe(true);
      const rows = JSON.parse(readFileSync(report, "utf8")) as VerifierRow[];
      for (const row of rows)
        if (row.visible !== "match")
          visible.push(
            `verifier: ${row.pair} shows a visible mismatch${row.note ? `: ${row.note}` : ""}`
          );
    }

    expect([...result.failures.map(describeFailure), ...visible]).toEqual([]);
  });
});
