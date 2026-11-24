import { test, expect } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

test.describe("content model", () => {
  // Node-only checks need one run, not one per browser project.
  test.beforeEach(async ({}, testInfo) => {
    const nodeOnly = !/status words from the set|portfolio repo link/.test(
      testInfo.title
    );
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
      // Turbopack rejects a symlinked node_modules, so link the files instead.
      const linked = spawnSync(
        "cp",
        ["-al", join(ROOT, "node_modules"), join(dest, "node_modules")],
        { encoding: "utf8" }
      );
      if (linked.status !== 0) {
        execFileSync("cp", [
          "-a",
          join(ROOT, "node_modules"),
          join(dest, "node_modules"),
        ]);
      }
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
          expect(result.status, fixture.name).not.toBe(0);
          for (const diagnostic of fixture.diagnostics) {
            expect(result.output, fixture.name).toContain(diagnostic);
          }
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    });
  });

  test("changes stay within PRV-3 scope", () => {
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
        lines.filter((l) => !/validat/i.test(l)),
        "next.config.ts changes beyond content validation"
      ).toEqual([]);
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
    const navHrefs = [
      ...gitShow(base, "components/layout/Header.tsx").matchAll(
        /href: "([^"]+)"/g
      ),
      ...gitShow(base, "components/layout/Footer.tsx").matchAll(
        /href: "([^"]+)"/g
      ),
    ].map((m) => m[1]);
    expect(navHrefs.length).toBeGreaterThan(0);

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      const hrefs = await page
        .locator("header a, footer a")
        .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
      for (const href of navHrefs) {
        expect(hrefs, `${route} nav ${href}`).toContain(href);
      }
    }
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
          page.getByText(word, { exact: true }).first(),
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
    const cases = {
      "portfolio-site": ["StudioSC Portfolio", "Live"],
      "central-command": ["Central Command", "In QA"],
      tallyandtrace: ["Tally And Trace", "In QA"],
      "fitness-rival": ["Fitness Rival", "In development"],
    };
    for (const [slug, [title, word]] of Object.entries(cases)) {
      await expectWords(`/work/${slug}`, [word]);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });

  test("status words from the set against the PR base", async ({ page }) => {
    test.skip(!BASE, NEEDS_BASE);

    // Home: three featured projects, most finished first.
    await page.goto("/");
    await expect(page.locator("div.group h3").first()).toBeVisible();
    expect(await page.locator("div.group h3").allTextContents()).toEqual([
      "StudioSC Portfolio",
      "Central Command",
      "Tally And Trace",
    ]);

    // Work: headings in order, with the same members as before.
    await page.goto("/work");
    expect(await page.locator("section.mb-16 > h2").allTextContents()).toEqual([
      "Live",
      "In QA",
      "In development",
    ]);
    // Polled, because the dev server can reload the page on first compile.
    await expect
      .poll(async () => {
        const members: string[][] = [];
        for (const group of await page.locator("section.mb-16").all()) {
          members.push(await group.locator("h3").allTextContents());
        }
        return members;
      })
      .toEqual([
        ["StudioSC Portfolio"],
        ["Central Command", "Tally And Trace"],
        ["Fitness Rival"],
      ]);

    // Case pages: related post titles are the blog files' titles.
    for (const slug of PROJECT_SLUGS) {
      await page.goto(`/work/${slug}`);
      const posts = readdirSync(join(ROOT, "content/blog"))
        .map(
          (f) =>
            matter(readFileSync(join(ROOT, "content/blog", f), "utf8")).data
        )
        .filter((d) => d.projectSlug === slug)
        .map((d) => d.title as string);
      const shown = await page
        .locator("section", {
          has: page.getByRole("heading", { name: "Related Posts" }),
        })
        .locator("h3")
        .allTextContents();
      expect(shown.sort()).toEqual(posts.sort());
    }
  });
});
