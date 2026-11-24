import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./support/git";
import { loadConfig } from "./support/config";

/** The steps of one job in a GitHub Actions workflow, as raw text blocks. */
function workflowSteps(workflow: string, job: string): string[] {
  const lines = workflow.split("\n");
  const start = lines.findIndex((l) => l === `  ${job}:`);
  expect(start, `job ${job} not found`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  const body = lines.slice(start + 1, end === -1 ? undefined : end);
  const steps: string[] = [];
  for (const line of body) {
    if (/^ {6}- /.test(line)) steps.push(line);
    else if (steps.length && /^ {7,}\S/.test(line)) {
      steps[steps.length - 1] += "\n" + line;
    }
  }
  return steps;
}

test.describe("guards", () => {
  test("serves on E2E_PORT", async ({ request, baseURL }, testInfo) => {
    const port = Number(process.env.E2E_PORT || 3000);
    expect(new URL(baseURL ?? "").port).toBe(String(port));
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    // Only `next start` serves a page as prerendered; `next dev` renders it.
    expect(res.headers()["x-nextjs-prerender"]).toMatch(/^1(?:, 1)*$/);

    if (testInfo.project.name !== "chromium") return;

    // With E2E_PORT unset, the config falls back to port 3000 and still
    // builds and starts a production server, in all five projects.
    const config = loadConfig("playwright.config.ts", { E2E_PORT: undefined });
    const use = config.use as { baseURL: string };
    const server = config.webServer as { url: string; command: string };
    expect(use.baseURL).toBe("http://localhost:3000");
    expect(server.url).toBe("http://localhost:3000");
    expect(server.command).toBe("npm run build && npm run start -- -p 3000");
    expect((config.projects as { name: string }[]).map((p) => p.name)).toEqual([
      "chromium",
      "firefox",
      "webkit",
      "Mobile Chrome",
      "Mobile Safari",
    ]);

    // CI's test job fetches full history and passes the PR head SHA.
    const ci = readFileSync(
      path.join(ROOT, ".github/workflows/ci.yml"),
      "utf8"
    );
    const steps = workflowSteps(ci, "test");
    const checkout = steps.find((s) => s.includes("uses: actions/checkout@"));
    expect(checkout, "test job has no checkout step").toBeDefined();
    expect(checkout).toMatch(/\n\s+with:\n(?:\s+\S.*\n)*?\s+fetch-depth: 0\b/);
    const run = steps.find((s) => /run: npm run test:e2e\b/.test(s));
    expect(run, "test job does not run test:e2e").toBeDefined();
    expect(run).toMatch(
      /\n\s+env:\n(?:\s+\S.*\n)*?\s+PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/
    );
  });
});
