import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The fidelity spec against the fixture site and the fixture canvas's
 * committed references, as the harness runs it in a fresh copy of the repo.
 * FIXTURE_PORT picks the port; FIXTURE_DRIFT names a drift from drifts.ts;
 * FIXTURE_OUTPUT is where Playwright writes (the verifier's pairs land in
 * its fidelity/ folder).
 */
const port = Number(process.env.FIXTURE_PORT || 0);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error(
    `FIXTURE_PORT must be a free port, got "${process.env.FIXTURE_PORT}"`
  );
}
const baseURL = `http://127.0.0.1:${port}`;
process.env.FIDELITY_BOARDS = path.join(__dirname, "canvas");

export default defineConfig({
  testDir: path.join(__dirname, "..", ".."),
  testMatch: "fidelity.spec.ts",
  outputDir:
    process.env.FIXTURE_OUTPUT ||
    path.join(__dirname, "..", "..", "..", "test-results", "fixture"),
  workers: 1,
  retries: 0,
  reporter: "line",
  // No git info: under GitHub Actions the PR diff capture fetches the base
  // with --depth=1, which would make the repo shallow.
  captureGitInfo: { commit: false, diff: false },
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx ${path.join(__dirname, "server.ts")} --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
