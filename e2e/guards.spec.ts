import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, treeFiles, type TreeFile } from "./support/git";
import { loadConfig } from "./support/config";
import {
  DENYLIST,
  SELF_EXCLUDED,
  isBinary,
  rulesFor,
  scanLine,
  scanText,
  type DenyHit,
} from "./support/denylist";
import {
  DENYLIST_FIXTURES,
  ENV_RULE_EXEMPT,
} from "./support/denylist.fixtures";

// Checks that only read files or run git need one browser project, not five.
function nodeOnly() {
  test.skip(
    test.info().project.name !== "chromium",
    "file-level check; runs once, in the chromium project"
  );
}

let headTree: TreeFile[] | undefined;
/** The committed tree under test, read once per worker. */
function committedTree(): TreeFile[] {
  headTree ??= treeFiles("HEAD");
  return headTree;
}

/** Denylist hits across committed text files that `select` keeps. */
function denylistHits(select: (file: string) => boolean): DenyHit[] {
  return committedTree()
    .filter((f) => select(f.path) && !isBinary(f.content))
    .flatMap((f) => scanText(f.path, f.content.toString("utf8")));
}

/** A hit as text that names the file, line and rule, never the match. */
const describeHit = (h: DenyHit) => `${h.file}:${h.line} ${h.rule}`;

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

  test("denylist fixtures", () => {
    nodeOnly();
    expect(Object.keys(DENYLIST_FIXTURES).sort()).toEqual(
      DENYLIST.map((r) => r.name).sort()
    );
    for (const rule of DENYLIST) {
      const fixtures = DENYLIST_FIXTURES[rule.name];
      expect(rulesFor(fixtures.file)).toContain(rule);
      for (const sample of fixtures.matches) {
        expect(
          rule.pattern.test(sample),
          `${rule.name} misses a true fixture`
        ).toBe(true);
        expect(scanLine(fixtures.file, sample, 1).map((h) => h.rule)).toContain(
          rule.name
        );
      }
      for (const sample of fixtures.passes) {
        expect(rule.pattern.test(sample), `${rule.name} hits "${sample}"`).toBe(
          false
        );
      }
    }
    // The env-file rule is scoped to the site's own source and content.
    const envRule = DENYLIST.find((r) => r.name === "env file");
    for (const file of ENV_RULE_EXEMPT) {
      expect(rulesFor(file)).not.toContain(envRule);
    }
    // The files that define the patterns are the only ones excluded.
    for (const file of SELF_EXCLUDED) expect(rulesFor(file)).toEqual([]);
  });

  test("committed docs carry nothing private", () => {
    nodeOnly();
    const tracked = new Map(committedTree().map((f) => [f.path, f]));
    const epic = tracked.get("docs/tickets/PRV.md");
    expect(epic, "docs/tickets/PRV.md is not tracked").toBeDefined();
    const tickets = [
      ...new Set(epic!.content.toString("utf8").match(/\bPRV-\d+\b/g) ?? []),
    ];
    expect(tickets.length).toBeGreaterThan(0);
    for (const ticket of tickets) {
      expect(
        tracked.has(`docs/tickets/${ticket}.md`),
        `docs/tickets/${ticket}.md is not tracked`
      ).toBe(true);
    }

    const inScope = (file: string) =>
      file.startsWith("docs/") || file.startsWith(".claude/");
    for (const file of [...tracked.keys()].filter(inScope)) {
      const names = rulesFor(file).map((r) => r.name);
      expect(names).toEqual(expect.arrayContaining(["path", "lab domain"]));
    }
    expect(denylistHits(inScope).map(describeHit)).toEqual([]);
  });
});
