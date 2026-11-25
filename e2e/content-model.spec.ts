import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import matter from "gray-matter";
import { getProject, getProjects } from "../lib/mdx";
import { projectFrontmatterSchema } from "../lib/projects-schema";
import { STATUSES, STATUS_KEYS } from "../lib/statuses";
import {
  FRAGMENT_IDS,
  RANGE_CATEGORIES,
  validateRange,
} from "../content/range";

const ROOT = resolve(__dirname, "..");
const PROJECT_SLUGS = [
  "tallyandtrace",
  "central-command",
  "portfolio-site",
  "fitness-rival",
];

/**
 * The PR base, from PRV3_BASE. The comparisons against it apply to the PRV-3
 * work audit only; without PRV3_BASE they are skipped.
 */
const BASE = process.env.PRV3_BASE;
const NEEDS_BASE = "base comparisons run only when PRV3_BASE is set";

function baseSha(): string {
  if (!BASE) throw new Error(NEEDS_BASE);
  return BASE;
}

function gitShow(sha: string, path: string): string {
  return execFileSync("git", ["show", `${sha}:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function tempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `prv3-${label}-`));
}

const VALID_PROJECT = `---
title: "Fixture"
description: "A fixture project"
date: "2026-01-01"
tags: ["a"]
status: "live"
summary: "A fixture summary"
builtWith: ["React"]
---

# Fixture

Body.
`;

function projectFile(overrides: Record<string, unknown> = {}) {
  const parsed = matter(VALID_PROJECT);
  const data = { ...parsed.data, ...overrides };
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return matter.stringify(parsed.content, data);
}

const SHA = "a".repeat(40);

const labCategory = {
  id: "mobile",
  tab: "Mobile",
  word: "Phones",
  plate: {
    kind: "lab",
    name: "Pocket habit tracker",
    fragmentId: "habit-tracker",
    description: "A habit list",
    builtWith: ["React"],
    labLine: "A made-up demo",
  },
};

const realPlain = {
  id: "dashboards",
  tab: "Dashboards",
  word: "Dashboards",
  plate: {
    kind: "real",
    slug: "central-command",
    fragmentId: "central-command",
    desktopDescription: "Desktop copy",
    phoneDescription: "Phone copy",
    facts: [{ label: "Status", value: "In QA" }],
    links: [{ label: "Case study", href: "/work/central-command" }],
  },
};

const check = {
  repo: "StudioSC-dev/tally-and-trace",
  path: "frontend/e2e/amounts.spec.ts",
  test: "amount styling preserves transaction layout",
  sha: SHA,
  text: "Amounts keep one right edge.",
};

const realChecked = {
  id: "finance",
  tab: "Finance",
  word: "Money",
  plate: {
    kind: "real",
    slug: "tallyandtrace",
    fragmentId: "tallyandtrace",
    desktopDescription: "Desktop copy",
    phoneDescription: "Phone copy",
    facts: [],
    links: [],
    christineCheck: check,
  },
};

const SLUGS = PROJECT_SLUGS;

function withPlate(
  base: typeof realChecked,
  patch: Record<string, unknown>
): unknown {
  return { ...base, plate: { ...base.plate, ...patch } };
}

function withCheck(patch: Record<string, unknown>): unknown {
  return withPlate(realChecked, { christineCheck: { ...check, ...patch } });
}

/**
 * True when every changed line of a next.config.ts diff (`+`/`-` lines) is an
 * the added import of validateShippedRange from ./lib/mdx or a plain call to it.
 * A removal, a comment or any other setting is out of scope.
 */
export function isValidationOnlyConfigDiff(lines: string[]): boolean {
  const addedImport =
    /^\+\s*import\s*\{\s*validateShippedRange\s*\}\s*from\s*["']\.\/lib\/mdx["'];?\s*$/;
  const addedCall = /^\+\s*(?:await\s+)?validateShippedRange\(\s*\);?\s*$/;
  return lines.every((l) => addedImport.test(l) || addedCall.test(l));
}

/**
 * A failed build is a real nonzero exit code. A signal (such as a timeout kill)
 * or a spawn error has a null status, so it is reported separately and does
 * not count as the build rejecting the content.
 */
export function expectFailedExit(
  result: { status: number | null; signal: string | null; error?: Error },
  label: string
): void {
  expect(result.error, `${label}: spawn error`).toBeUndefined();
  expect(result.signal, `${label}: killed by signal`).toBeNull();
  expect(typeof result.status, `${label}: exit code`).toBe("number");
  expect(result.status, label).not.toBe(0);
}

/** Files PRV-3 may touch, relative to the repo root. */
export function isAllowedPrv3Path(path: string): boolean {
  const exact = new Set([
    "lib/statuses.ts",
    "lib/projects-schema.ts",
    "content/range.ts",
    "lib/mdx.ts",
    "types/index.ts",
    "components/home/ProjectCard.tsx",
    "components/ui/StatusBadge.tsx",
    "app/page.tsx",
    "app/work/page.tsx",
    "app/work/[slug]/page.tsx",
    "next.config.ts",
    "e2e/content-model.spec.ts",
    ...PROJECT_SLUGS.map((slug) => `content/projects/${slug}.mdx`),
  ]);
  return exact.has(path) || path.startsWith("e2e/fixtures/content-model/");
}

/**
 * Copy `src` to `dest`, hard-linking when the filesystem allows and copying
 * when it does not (a temp dir on another filesystem). Turbopack rejects a
 * symlinked node_modules, so a symlink is not an option.
 */
export function linkOrCopyTree(src: string, dest: string): void {
  const linked = spawnSync("cp", ["-al", src, dest], { encoding: "utf8" });
  if (linked.status === 0) return;
  // A failed link can leave a partial tree, and `cp -a` into it would nest.
  rmSync(dest, { recursive: true, force: true });
  execFileSync("cp", ["-a", src, dest]);
}

interface BaseServer {
  url: string;
  stop: () => void;
}

let baseServer: Promise<BaseServer> | undefined;

/** Export the PR base to a temp dir and serve it with `next dev` on a free port. */
function startBaseServer(sha: string): Promise<BaseServer> {
  baseServer ??= (async () => {
    const dir = tempDir("base-server");
    try {
      execFileSync("sh", ["-c", 'git archive "$SHA" | tar -x -C "$DIR"'], {
        cwd: ROOT,
        env: { ...process.env, SHA: sha, DIR: dir },
      });
      linkOrCopyTree(join(ROOT, "node_modules"), join(dir, "node_modules"));
      const port = await new Promise<number>((resolvePort, reject) => {
        const probe = createServer();
        probe.once("error", reject);
        probe.listen(0, () => {
          const { port: free } = probe.address() as { port: number };
          probe.close(() => resolvePort(free));
        });
      });
      const child = spawn("npx", ["next", "dev", "-p", String(port)], {
        cwd: dir,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      });
      const url = `http://localhost:${port}`;
      const stop = () => {
        try {
          if (child.pid) process.kill(-child.pid);
        } catch {
          // already gone
        }
        rmSync(dir, { recursive: true, force: true });
      };
      const deadline = Date.now() + 150_000;
      for (;;) {
        try {
          const response = await fetch(url, { redirect: "manual" });
          if (response.status === 200) break;
        } catch {
          // not up yet
        }
        if (Date.now() > deadline) {
          stop();
          throw new Error("base dev server did not start");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      return { url, stop };
    } catch (error) {
      // Do not leave the exported tree behind when setup fails.
      rmSync(dir, { recursive: true, force: true });
      throw error;
    }
  })();
  return baseServer;
}

/** Text and tag/class skeleton of <main>, retried because dev can reload the page. */
async function snapshotMain(page: Page, url: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url);
      await page.locator("main").waitFor();
      return await page.locator("main").evaluate((root) => {
        const skip = new Set(["SCRIPT", "STYLE", "NEXTJS-PORTAL"]);
        const walk = (el: Element): string =>
          `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}[${[
            ...el.children,
          ]
            .filter((child) => !skip.has(child.tagName))
            .map(walk)
            .join(",")}]`;
        // Project cards in order: title and case destination together.
        const cards = [...root.querySelectorAll('a[aria-label^="View "]')].map(
          (link) =>
            `${link.getAttribute("aria-label")} -> ${link.getAttribute("href")}`
        );
        return {
          cards,
          text: (root as HTMLElement).innerText.replace(/[ \t]+/g, " "),
          skeleton: walk(root),
        };
      });
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }
}

async function navHrefs(page: Page, url: string) {
  await page.goto(url);
  const hrefs = (selector: string) =>
    page
      .locator(selector)
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  return {
    heading: await page.locator("h1").first().innerText(),
    header: await hrefs("header:not(article *) a"),
    footer: await hrefs("footer:not(article *) a"),
  };
}

/** The visible element reading exactly `word`; a hidden copy is ignored. */
function visibleText(page: Page, word: string) {
  return page
    .getByText(word, { exact: true })
    .filter({ visible: true })
    .first();
}

/** The old status words, and what the new set calls them. */
const STATUS_RENAMES: [RegExp, string][] = [
  [/^QA Verified$/i, "Live"],
  [/^QA In Progress$/i, "In QA"],
  [/^Under Development$/i, "In development"],
];

test.describe("content model", () => {
  // Node-only checks need one run, not one per browser project.
  test.beforeEach(async ({}, testInfo) => {
    const nodeOnly = ![
      "status words from the set",
      "portfolio repo link",
    ].includes(testInfo.title);
    test.skip(
      nodeOnly && testInfo.project.name !== "chromium",
      "node-only check runs once"
    );
  });

  test("content matches the schema", async () => {
    const expected: Record<
      string,
      { status: string; summary: string; builtWith: string[] }
    > = {
      tallyandtrace: {
        status: "in-qa",
        summary: "Money app for a household and a small business",
        builtWith: ["React", "FastAPI", "PostgreSQL"],
      },
      "central-command": {
        status: "in-qa",
        summary: "A dashboard for one person's day, on Cloudflare's free tier",
        builtWith: ["Cloudflare Workers", "Hono", "React"],
      },
      "portfolio-site": {
        status: "live",
        summary: "This site",
        builtWith: ["Next.js", "Tailwind"],
      },
      "fitness-rival": {
        status: "in-development",
        summary: "A workout app where friends compete for points and badges",
        builtWith: ["React", "TypeScript", "Node.js"],
      },
    };

    for (const slug of PROJECT_SLUGS) {
      const path = `content/projects/${slug}.mdx`;
      const now = matter(readFileSync(join(ROOT, path), "utf8"));

      expect(projectFrontmatterSchema.safeParse(now.data).success, slug).toBe(
        true
      );
      for (const old of ["qaVerified", "qaInProgress", "underDevelopment"]) {
        expect(now.data, `${slug} keeps ${old}`).not.toHaveProperty(old);
      }
      expect(now.data.status).toBe(expected[slug].status);
      expect(now.data.summary).toBe(expected[slug].summary);
      expect(now.data.builtWith).toEqual(expected[slug].builtWith);
    }

    // A file that keeps a boolean fails.
    const kept = matter(
      readFileSync(join(ROOT, "content/projects/tallyandtrace.mdx"), "utf8")
    );
    expect(
      projectFrontmatterSchema.safeParse({ ...kept.data, qaVerified: true })
        .success
    ).toBe(false);

    // The loader sees the same four.
    const projects = await getProjects();
    expect(projects.map((p) => p.slug).sort()).toEqual(
      [...PROJECT_SLUGS].sort()
    );
  });

  test("content matches the schema against the PR base", async () => {
    test.skip(!BASE, NEEDS_BASE);
    const base = baseSha();
    const migrated = new Set([
      "status",
      "summary",
      "builtWith",
      "qaVerified",
      "qaInProgress",
      "underDevelopment",
    ]);

    for (const slug of PROJECT_SLUGS) {
      const path = `content/projects/${slug}.mdx`;
      const now = matter(readFileSync(join(ROOT, path), "utf8"));
      const before = matter(gitShow(base, path));
      expect(now.data.tags).toEqual(before.data.tags);
      expect(now.content).toBe(before.content);

      const strip = (data: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(data).filter(([key]) => !migrated.has(key))
        );
      const nowRest = strip(now.data);
      const beforeRest = strip(before.data);
      if (slug === "portfolio-site") {
        expect(nowRest.githubUrl).toBe(
          "https://github.com/StudioSC-dev/studiosc-portfolio"
        );
        delete nowRest.githubUrl;
        delete beforeRest.githubUrl;
      }
      expect(nowRest).toEqual(beforeRest);
    }

    // The shipped Range list is empty.
    const projects = await getProjects();
    expect(RANGE_CATEGORIES).toEqual([]);
    expect(() =>
      validateRange(
        RANGE_CATEGORIES,
        projects.map((p) => p.slug)
      )
    ).not.toThrow();
  });

  test("rejects bad content", () => {
    // Statuses
    expect(STATUS_KEYS).toEqual([
      "live",
      "in-qa",
      "in-development",
      "tested-by-us",
    ]);
    expect(STATUSES["in-qa"].plateLabel).toBe("In QA with Christine");
    const parse = (overrides: Record<string, unknown>) =>
      projectFrontmatterSchema.safeParse({
        ...matter(projectFile()).data,
        ...overrides,
      });
    expect(parse({}).success).toBe(true);
    expect(parse({ status: "shipped" }).success).toBe(false);

    // Summary length
    expect(parse({ summary: "x".repeat(80) }).success).toBe(true);
    expect(parse({ summary: "x".repeat(81) }).success).toBe(false);

    // builtWith count
    expect(parse({ builtWith: ["A"] }).success).toBe(true);
    expect(parse({ builtWith: ["A", "B", "C"] }).success).toBe(true);
    expect(parse({ builtWith: [] }).success).toBe(false);
    expect(parse({ builtWith: ["A", "B", "C", "D"] }).success).toBe(false);

    // Thumbnail optional, and types of existing fields
    expect(parse({ thumbnail: undefined }).success).toBe(true);
    expect(parse({ thumbnail: "https://example.com/a.png" }).success).toBe(
      true
    );
    expect(parse({ title: 5 }).success).toBe(false);
    expect(parse({ tags: "a" }).success).toBe(false);
    expect(parse({ githubUrl: 5 }).success).toBe(false);
    expect(parse({ qaVerified: true }).success).toBe(false);

    // Range: a valid set, including both plate kinds and both real shapes
    expect(() =>
      validateRange([labCategory, realPlain, realChecked], SLUGS)
    ).not.toThrow();
    expect(() => validateRange([], SLUGS)).not.toThrow();

    const rejects = (value: unknown, pattern: RegExp) =>
      expect(() => validateRange(value, SLUGS)).toThrow(pattern);

    rejects([labCategory, { ...labCategory }], /mobile[\s\S]*duplicate/);
    rejects(
      [withPlate(realChecked, { slug: "no-such-project" })],
      /finance[\s\S]*no-such-project/
    );
    rejects(
      [withPlate(realChecked, { fragmentId: "not-registered" })],
      /finance[\s\S]*not-registered/
    );
    rejects([withCheck({ sha: "abc123" })], /finance[\s\S]*sha/);
    rejects([withCheck({ sha: "g".repeat(40) })], /finance[\s\S]*sha/);
    rejects(
      [withCheck({ repo: "someone-else/tally-and-trace" })],
      /finance[\s\S]*repo/
    );
    rejects([withCheck({ repo: "StudioSC-dev/." })], /finance[\s\S]*repo/);
    rejects([withCheck({ repo: "StudioSC-dev/.." })], /finance[\s\S]*repo/);
    // A Status fact must start with the linked project's plate label as a
    // whole word, optionally followed by a qualifier after a space or comma.
    const STATUS_OF = {
      tallyandtrace: "in-qa",
      "central-command": "in-qa",
      "portfolio-site": "live",
    } as const;
    const withStatus = (value: string, slug = "tallyandtrace") =>
      withPlate(realChecked, { slug, facts: [{ label: "Status", value }] });
    for (const [value, slug] of [
      ["In QA with Christine", "tallyandtrace"],
      ["In QA with Christine", "central-command"],
      ["In QA with Christine, tested", "tallyandtrace"],
      ["Live", "portfolio-site"],
      ["Live, tested", "portfolio-site"],
      ["Live (tested)", "portfolio-site"],
    ] as const) {
      expect(
        () => validateRange([withStatus(value, slug)], STATUS_OF),
        `${value} / ${slug}`
      ).not.toThrow();
    }
    for (const [value, slug] of [
      ["QA Verified", "tallyandtrace"],
      ["Live", "tallyandtrace"],
      ["In QA", "tallyandtrace"],
      ["In QAX", "tallyandtrace"],
      ["In QA with Christines", "tallyandtrace"],
      ["Livestock", "portfolio-site"],
      ["LiveX, tested", "portfolio-site"],
    ] as const) {
      expect(
        () => validateRange([withStatus(value, slug)], STATUS_OF),
        `${value} / ${slug}`
      ).toThrow(/finance[\s\S]*Status fact/);
    }

    // A container that is not an array still names the file.
    rejects({}, /content\/range\.ts[\s\S]*array/);
    rejects(null, /content\/range\.ts[\s\S]*array/);
    // A hole in the list is validated, and the error names the file and index.
    rejects(Array(1), /content\/range\.ts[\s\S]*category #0/);
    rejects(
      [labCategory, , realChecked],
      /content\/range\.ts[\s\S]*category #1/
    );
    rejects(
      [withCheck({ test: undefined, text: undefined })],
      /finance[\s\S]*christineCheck/
    );
    rejects(
      [{ ...labCategory, plate: { ...labCategory.plate, fragmentId: "x" } }],
      /mobile[\s\S]*FRAGMENT_IDS/
    );
  });

  test("loader throws", async () => {
    const dir = tempDir("loader");
    try {
      writeFileSync(join(dir, "good.mdx"), projectFile());
      writeFileSync(join(dir, "bad.mdx"), projectFile({ status: "nope" }));

      await expect(getProjects(dir)).rejects.toThrow(/bad\.mdx/);
      await expect(getProject("bad", dir)).rejects.toThrow(/bad\.mdx/);

      // Unclosed frontmatter and YAML syntax errors also name the file.
      for (const [name, text] of [
        [
          "unclosed",
          VALID_PROJECT.replace("\n---\n\n# Fixture", "\n# Fixture"),
        ],
        ["noopen", VALID_PROJECT.replace(/^---\n/, "")],
        // `---typo` must not close the block, even with a real fence later.
        [
          "typo",
          VALID_PROJECT.replace(
            "\n---\n\n# Fixture",
            "\n---typo\n\n# Fixture\n\n---\n"
          ),
        ],
        ["yaml", VALID_PROJECT.replace('title: "Fixture"', 'title: "Fixture')],
      ] as const) {
        const broken = tempDir(`loader-${name}`);
        try {
          writeFileSync(join(broken, `${name}.mdx`), text);
          await expect(getProjects(broken), name).rejects.toThrow(
            new RegExp(`${name}\\.mdx`)
          );
          await expect(getProject(name, broken), name).rejects.toThrow(
            new RegExp(`${name}\\.mdx`)
          );
        } finally {
          rmSync(broken, { recursive: true, force: true });
        }
      }

      const good = await getProject("good", dir);
      expect(good?.slug).toBe("good");
      expect(good?.status).toBe("live");
      expect(await getProject("absent", dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("portfolio repo link", async ({ page }) => {
    const portfolio = await getProject("portfolio-site");
    expect(portfolio?.githubUrl).toBe(
      "https://github.com/StudioSC-dev/studiosc-portfolio"
    );
    const oldLink = /github\.com\/studiosc(?![\w-])/i;
    for (const file of readdirSync(join(ROOT, "content/projects"))) {
      expect(
        readFileSync(join(ROOT, "content/projects", file), "utf8"),
        file
      ).not.toMatch(oldLink);
    }

    // A fixture still carrying the old link is rejected by the loader, by name.
    const dir = tempDir("old-link");
    try {
      writeFileSync(
        join(dir, "old-link.mdx"),
        projectFile({ githubUrl: "https://github.com/studiosc" })
      );
      await expect(getProjects(dir)).rejects.toThrow(/old-link\.mdx/);
      await expect(getProject("old-link", dir)).rejects.toThrow(
        /old-link\.mdx/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // Every equivalent form of the old account is rejected; other hosts are not.
    const parse = (githubUrl: string) =>
      projectFrontmatterSchema.safeParse({
        ...matter(projectFile()).data,
        githubUrl,
      }).success;
    for (const old of [
      "https://github.com/studiosc",
      "https://GitHub.com/StudioSC",
      "https://www.github.com/studiosc/",
      "https://github.com/studiosc.git",
      "https://github.com:443/studiosc/some-repo",
      "http://github.com/STUDIOSC/some-repo.git",
    ]) {
      expect(parse(old), old).toBe(false);
    }
    for (const fine of [
      "https://github.com/StudioSC-dev/studiosc-portfolio",
      "https://github.com/studiosc-dev",
      "https://notgithub.com/studiosc",
      "https://gitlab.com/studiosc/repo",
    ]) {
      expect(parse(fine), fine).toBe(true);
    }

    // The same account in liveUrl or in a body link is rejected, by file name.
    const stale = tempDir("old-link-more");
    try {
      writeFileSync(
        join(stale, "live-url.mdx"),
        projectFile({ liveUrl: "https://GitHub.com/StudioSC/app" })
      );
      writeFileSync(
        join(stale, "body-link.mdx"),
        `${VALID_PROJECT}\nSee [the repo](https://github.com/studiosc/old).\n`
      );
      for (const name of ["live-url", "body-link"]) {
        await expect(getProject(name, stale), name).rejects.toThrow(
          new RegExp(`${name}\\.mdx`)
        );
      }
      await expect(getProjects(stale)).rejects.toThrow(/\.mdx/);
      // Our own account in a body link is fine.
      writeFileSync(
        join(stale, "body-link.mdx"),
        `${VALID_PROJECT}\nSee [the repo](https://github.com/StudioSC-dev/x).\n`
      );
      await expect(getProject("body-link", stale)).resolves.not.toBeNull();
    } finally {
      rmSync(stale, { recursive: true, force: true });
    }

    // The rendered case page links to the right repository.
    await page.goto("/work/portfolio-site");
    await expect(
      page.getByRole("link", { name: /GitHub/ }).first()
    ).toHaveAttribute(
      "href",
      "https://github.com/StudioSC-dev/studiosc-portfolio"
    );
  });

  test("fragment registry entries", () => {
    expect([...FRAGMENT_IDS]).toEqual([
      "central-command",
      "tallyandtrace",
      "habit-tracker",
      "form-helper",
      "turntable",
      "portfolio-site",
      "route-checks",
    ]);
    expect(() =>
      validateRange(
        [
          {
            ...labCategory,
            plate: { ...labCategory.plate, fragmentId: "eighth" },
          },
        ],
        SLUGS
      )
    ).toThrow(/eighth/);
  });

  test.describe("builds", () => {
    test.describe.configure({ timeout: 600_000 });

    function copyRepo(label: string): string {
      const dest = tempDir(label);
      cpSync(ROOT, dest, {
        recursive: true,
        filter: (src) => {
          const rel = src.slice(ROOT.length + 1);
          return !/^(node_modules|\.next|\.git|playwright-report|test-results)(\/|$)/.test(
            rel
          );
        },
      });
      linkOrCopyTree(join(ROOT, "node_modules"), join(dest, "node_modules"));
      return dest;
    }

    function build(dir: string) {
      const result = spawnSync("npm", ["run", "build"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
        timeout: 540_000,
      });
      return {
        status: result.status,
        signal: result.signal,
        error: result.error,
        output: `${result.stdout}\n${result.stderr}`,
      };
    }

    test("build rejects invalid content", async () => {
      // Fixtures are injected as new content, never by editing shipped text,
      // so they stay valid as the shipped Range and projects grow.
      const fixtures: {
        name: string;
        inject: (dir: string) => void;
        diagnostics: string[];
      }[] = [
        {
          name: "bad-status",
          inject: (dir) =>
            writeFileSync(
              join(dir, "content/projects/zz-build-bad-status.mdx"),
              projectFile({ status: "bogus" })
            ),
          diagnostics: [
            "Invalid project frontmatter in zz-build-bad-status.mdx",
          ],
        },
        {
          name: "old-body-link",
          inject: (dir) =>
            writeFileSync(
              join(dir, "content/projects/zz-build-old-link.mdx"),
              `${VALID_PROJECT}\n[repo](https://github.com/studiosc)\n`
            ),
          diagnostics: ["Invalid project content in zz-build-old-link.mdx"],
        },
        {
          name: "unclosed",
          inject: (dir) =>
            writeFileSync(
              join(dir, "content/projects/zz-build-unclosed.mdx"),
              VALID_PROJECT.replace("\n---\n\n# Fixture", "\n# Fixture")
            ),
          diagnostics: ["Invalid project frontmatter in zz-build-unclosed.mdx"],
        },
        {
          name: "bad-range",
          inject: (dir) => {
            const rangePath = join(dir, "content/range.ts");
            const before = readFileSync(rangePath, "utf8");
            const after = `${before}
RANGE_CATEGORIES.push({
  id: "broken-category",
  tab: "X",
  word: "X",
  plate: {
    kind: "lab",
    name: "X",
    fragmentId: "not-registered",
    description: "X",
    builtWith: ["X"],
    labLine: "X",
  },
});
`;
            writeFileSync(rangePath, after);
            expect(readFileSync(rangePath, "utf8")).toContain(
              "broken-category"
            );
          },
          diagnostics: ["Invalid range in content/range.ts", "broken-category"],
        },
      ];

      const shipped = copyRepo("build-ok");
      try {
        const ok = build(shipped);
        expect(ok.status, ok.output.slice(-3000)).toBe(0);
      } finally {
        rmSync(shipped, { recursive: true, force: true });
      }

      for (const fixture of fixtures) {
        const dir = copyRepo(`build-${fixture.name}`);
        try {
          fixture.inject(dir);
          const result = build(dir);
          expectFailedExit(result, fixture.name);
          for (const diagnostic of fixture.diagnostics) {
            expect(result.output, fixture.name).toContain(diagnostic);
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    });
  });

  test("copy fallback works across filesystems", () => {
    // /dev/shm is a separate filesystem from the worktree, so hard links fail.
    test.skip(!existsSync("/dev/shm"), "no /dev/shm on this machine");
    const src = mkdtempSync(join(ROOT, ".prv3-copy-src-"));
    const dest = mkdtempSync("/dev/shm/prv3-copy-");
    try {
      mkdirSync(join(src, "pkg"));
      writeFileSync(join(src, "pkg", "index.js"), "ok");
      const target = join(dest, "node_modules");
      linkOrCopyTree(src, target);
      expect(readFileSync(join(target, "pkg", "index.js"), "utf8")).toBe("ok");
      // A copy, not a nested directory.
      expect(existsSync(join(target, basename(src)))).toBe(false);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  test("build failure needs a numeric nonzero exit", () => {
    expect(() =>
      expectFailedExit({ status: 1, signal: null }, "exit 1")
    ).not.toThrow();
    for (const bad of [
      { status: 0, signal: null },
      { status: null, signal: "SIGTERM" as const },
      { status: null, signal: null },
      { status: 1, signal: null, error: new Error("spawn failed") },
    ]) {
      expect(() => expectFailedExit(bad, "bad")).toThrow();
    }
  });

  test("changes stay within PRV-3 scope", () => {
    // The next.config.ts rule, on fixtures.
    expect(
      isValidationOnlyConfigDiff([
        '+import { validateShippedRange } from "./lib/mdx";',
        "+await validateShippedRange();",
      ])
    ).toBe(true);
    expect(isValidationOnlyConfigDiff(["+validateShippedRange();"])).toBe(true);
    for (const bad of [
      "+  reactStrictMode: false, // validate later",
      "-  allowedDevOrigins: [],",
      "+// validateShippedRange();",
      "+validateShippedRange(nextConfig.poweredByHeader = false);",
      "+validateShippedRange(), (nextConfig.poweredByHeader = false);",
      '+import { somethingElse } from "./lib/validate-other";',
      "+  poweredByHeader: false,",
    ]) {
      expect(isValidationOnlyConfigDiff([bad]), bad).toBe(false);
    }

    // The allowlist itself, on allowed and disallowed paths.
    for (const allowed of [
      "lib/statuses.ts",
      "content/projects/fitness-rival.mdx",
      "e2e/content-model.spec.ts",
      "e2e/fixtures/content-model/bad.mdx",
      "next.config.ts",
    ]) {
      expect(isAllowedPrv3Path(allowed), allowed).toBe(true);
    }
    for (const disallowed of [
      "app/layout.tsx",
      "content/projects/new-project.mdx",
      "content/blog/welcome.mdx",
      "components/layout/Header.tsx",
      "package.json",
    ]) {
      expect(isAllowedPrv3Path(disallowed), disallowed).toBe(false);
    }
  });

  test("changes stay within PRV-3 scope against the PR base", async ({
    page,
  }) => {
    test.skip(!BASE, NEEDS_BASE);
    test.setTimeout(240_000);

    // The committed diff, base to head. No renames, so a move into the
    // allowed directory still lists its out-of-scope source; NUL-separated, so
    // any file name is safe. Nothing is excluded: tracked report files count.
    const base = baseSha();
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"],
      { cwd: ROOT, encoding: "utf8" }
    )
      .split("\0")
      .filter(Boolean);
    expect(changed.filter((f) => !isAllowedPrv3Path(f))).toEqual([]);

    // next.config.ts may only change to invoke content validation.
    if (changed.includes("next.config.ts")) {
      const lines = execFileSync(
        "git",
        ["diff", "-U0", base, "HEAD", "--", "next.config.ts"],
        { cwd: ROOT, encoding: "utf8" }
      )
        .split("\n")
        .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
      expect(
        isValidationOnlyConfigDiff(lines),
        `next.config.ts changes beyond content validation:\n${lines.join("\n")}`
      ).toBe(true);
    }

    // Routes from the base: every one still returns 200 with the same shared
    // navigation destinations.
    const listed = (dir: string) =>
      execFileSync("git", ["ls-tree", "--name-only", base, `${dir}/`], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => f.replace(/^.*\//, "").replace(/\.mdx$/, ""));
    const routes = [
      "/",
      "/work",
      ...listed("content/projects").map((s) => `/work/${s}`),
      "/blog",
      ...listed("content/blog").map((s) => `/blog/${s}`),
      "/about",
      "/contact",
      "/privacy/hermes-personal-assistant",
    ];

    const { url: baseUrl } = await startBaseServer(base);
    const headUrl = String(test.info().project.use.baseURL).replace(/\/$/, "");
    for (const route of routes) {
      // A direct 200 on both: a redirect that lands on a 200 does not count.
      for (const origin of [baseUrl, headUrl]) {
        const response = await page.request.get(`${origin}${route}`, {
          maxRedirects: 0,
        });
        expect(response.status(), `${origin}${route}`).toBe(200);
      }
      // The same page, and the same header and footer destinations, each
      // compared on its own.
      const before = await navHrefs(page, `${baseUrl}${route}`);
      const after = await navHrefs(page, `${headUrl}${route}`);
      expect(after.heading, `${route} heading`).toBe(before.heading);
      expect(after.header, `${route} header links`).toEqual(before.header);
      expect(after.footer, `${route} footer links`).toEqual(before.footer);
    }
  });

  test("status label lookup ignores hidden copies", async ({ page }) => {
    await page.setContent(
      '<span hidden>Live</span><span style="display:none">Live</span><p>Live</p>'
    );
    await expect(visibleText(page, "Live")).toHaveText("Live");
    await expect(visibleText(page, "Live")).toBeVisible();
  });

  test("status words from the set", async ({ page }) => {
    // Literal words, so a change to the set itself is caught here.
    expect(STATUSES).toEqual({
      live: { label: "Live", plateLabel: "Live" },
      "in-qa": { label: "In QA", plateLabel: "In QA with Christine" },
      "in-development": {
        label: "In development",
        plateLabel: "In development",
      },
      "tested-by-us": { label: "Tested by us", plateLabel: "Tested by us" },
    });
    const obsolete = ["QA Verified", "QA In Progress", "Under Development"];
    const expectWords = async (path: string, present: string[]) => {
      await page.goto(path);
      for (const word of present) {
        await expect(
          visibleText(page, word),
          `${path} shows ${word}`
        ).toBeVisible();
      }
      for (const word of obsolete) {
        await expect(
          page.getByText(word, { exact: true }),
          `${path} drops ${word}`
        ).toHaveCount(0);
      }
    };

    // Words only, no markup: these survive a page redesign.
    await expectWords("/", ["Live", "In QA"]);
    await expectWords("/work", ["Live", "In QA", "In development"]);
    // Only each case's assigned status: copy such as the title belongs to
    // later tickets, so no routine assertion pins it.
    const cases = {
      "portfolio-site": "Live",
      "central-command": "In QA",
      tallyandtrace: "In QA",
      "fitness-rival": "In development",
    };
    for (const [slug, word] of Object.entries(cases)) {
      await expectWords(`/work/${slug}`, [word]);
    }
  });

  test("status words from the set against the PR base", async ({ page }) => {
    test.skip(!BASE, NEEDS_BASE);
    test.setTimeout(240_000);
    const { url: baseUrl } = await startBaseServer(baseSha());
    const headUrl = String(test.info().project.use.baseURL).replace(/\/$/, "");

    // Rendered base against rendered head: the same text (post titles, project
    // membership and order included) except the renamed status words, and the
    // same tag and class structure.
    for (const route of [
      "/",
      "/work",
      ...PROJECT_SLUGS.map((s) => `/work/${s}`),
    ]) {
      const before = await snapshotMain(page, `${baseUrl}${route}`);
      const after = await snapshotMain(page, `${headUrl}${route}`);
      // Only a line that is exactly an old status word is renamed, so post
      // titles that contain the words are compared as they are. innerText
      // follows CSS text-transform, so an upper-case line stays upper-case.
      const renamed = before.text
        .split("\n")
        .map((line) => {
          for (const [from, to] of STATUS_RENAMES) {
            if (from.test(line.trim())) {
              return line.trim() === line.trim().toUpperCase()
                ? to.toUpperCase()
                : to;
            }
          }
          return line;
        })
        .join("\n");
      expect(after.text, `${route} text`).toBe(renamed);
      expect(after.skeleton, `${route} structure`).toBe(before.skeleton);
      expect(after.cards, `${route} card destinations`).toEqual(before.cards);
      if (route === "/" || route === "/work") {
        expect(after.cards.length, `${route} has cards`).toBeGreaterThan(0);
      }
      expect(
        after.text
          .split("\n")
          .filter((line) =>
            /^(QA Verified|QA In Progress|Under Development)$/i.test(
              line.trim()
            )
          ),
        `${route} drops old words`
      ).toEqual([]);
    }

    // Each case page keeps its title as the one h1 (audit-only: copy changes later).
    const titles = {
      "portfolio-site": "StudioSC Portfolio",
      "central-command": "Central Command",
      tallyandtrace: "Tally And Trace",
      "fitness-rival": "Fitness Rival",
    };
    for (const [slug, title] of Object.entries(titles)) {
      await page.goto(`${headUrl}/work/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }

    // The migration's expected statuses, from the head's rendered pages.
    await page.goto(`${headUrl}/work`);
    await expect
      .poll(() => page.locator("h2").allTextContents())
      .toEqual(expect.arrayContaining(["Live", "In QA", "In development"]));
  });

  test.afterAll(async () => {
    if (baseServer) (await baseServer).stop();
  });
});
