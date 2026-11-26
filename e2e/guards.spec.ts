import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addsFile,
  changedByPr,
  ROOT,
  existsAt,
  git,
  gitBuffer,
  gitOk,
  prRange,
  treeFiles,
  type TreeFile,
} from "./support/git";
import {
  icoFrameHashes,
  readIcoDirectory,
  type FrameHash,
} from "./support/ico";
import {
  CLEAN_WEBP,
  XMP_PACKET,
  buildIco,
  exifGpsSegment,
  icoFrames,
  isPng,
  jpegSegment,
  jpegWithSegment,
  pngChunk,
  pngWithChunk,
  riffChunk,
  webpWithChunk,
  webpWithRaw,
  withFrameOffset,
  xmpSegment,
} from "./support/dirty-images";
import {
  checkIco,
  checkPng,
  checkSvg,
  isImageCandidate,
} from "../scripts/image-metadata";
import { addedLineNumbers, findPrivate } from "../scripts/privacy-scan";
import playwrightConfig from "../playwright.config";
import { throwawayRepo } from "./support/throwaway";
import { collectErrors, nextHop, stubVercelInsights } from "./support/page";
import marathonCard from "./fixtures/marathon-card.json";
import urlsFixture from "./fixtures/urls.json";
import { SHOT_WIDTHS, shot } from "./support/shot";
import { detectCards } from "./support/cards";
import {
  BUDGET_ROUTES,
  baselineProblems,
  MAX_BUDGET_BYTES,
  firstLoadJs,
  layoutShift,
} from "./support/perf";
import perfBaseline from "./fixtures/perf-baseline.json";
import faviconPixels from "./fixtures/favicon-pixels.json";
import { TSX, loadConfig } from "./support/config";
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

/** Runs the image checker CLI on some files. */
function checkImages(files: string[]) {
  const run = spawnSync(
    TSX,
    [path.join(ROOT, "scripts/image-metadata.ts"), ...files],
    { cwd: ROOT, encoding: "utf8" }
  );
  return { status: run.status, stderr: run.stderr };
}

const URLS: string[] = urlsFixture.urls;
/** A content page: a project or a blog post. */
const CONTENT_URL = /^\/(work|blog)\/[^/]+$/;

/** Every project and post route the checkout under test has, from content/. */
function contentRoutes(root = ROOT): string[] {
  return [
    ["blog", "blog"],
    ["projects", "work"],
  ].flatMap(([dir, route]) =>
    readdirSync(path.join(root, "content", dir))
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => `/${route}/${file.replace(/\.mdx$/, "")}`)
  );
}

/**
 * The pages the one-h1 check visits: every content route in the checkout,
 * whether or not urls.json lists it, every content URL urls.json lists, and
 * every route added to urls.json after it was locked.
 */
function headingPages(
  urls: string[],
  original: Set<string>,
  content: string[]
): string[] {
  const listed = urls.filter((u) => CONTENT_URL.test(u) || !original.has(u));
  return [...new Set([...listed, ...content])].sort();
}

/**
 * Why urls.json is wrong. On the PR that introduces it, it must hold exactly
 * the original URLs; later PRs may add routes but never drop an original one.
 * No URL may repeat, and each must be a path on the site itself, so no
 * request ever goes to another server.
 */
function urlListProblems(
  urls: string[],
  original: string[],
  introducing: boolean
): string[] {
  const problems: string[] = [];
  if (new Set(urls).size !== urls.length) problems.push("a URL repeats");
  const site = "http://site.invalid";
  for (const url of urls) {
    const onSite =
      typeof url === "string" &&
      url.startsWith("/") &&
      new URL(url, site).origin === site;
    if (!onSite) problems.push(`${url} is not a path on the site`);
  }
  for (const url of original) {
    if (!urls.includes(url)) problems.push(`${url} was dropped`);
  }
  if (introducing) {
    for (const url of urls) {
      if (!original.includes(url)) problems.push(`${url} is not original`);
    }
  }
  return problems;
}

/**
 * The page URLs of the tree urls.json was locked from: the six static pages,
 * the four projects and the 22 posts.
 */
function originalUrls(): string[] {
  const files = git(["ls-tree", "-r", "--name-only", urlsFixture.sha]).split(
    "\n"
  );
  const staticPages = files
    .filter((f) => /^app\/(.*\/)?page\.tsx$/.test(f) && !f.includes("["))
    .map((f) => "/" + f.replace(/^app\/?/, "").replace(/\/?page\.tsx$/, ""));
  const slugs = (dir: string) =>
    files
      .filter((f) => f.startsWith(`content/${dir}/`) && f.endsWith(".mdx"))
      .map((f) => path.basename(f, ".mdx"));
  expect(staticPages).toHaveLength(6);
  expect(slugs("projects")).toHaveLength(4);
  expect(slugs("blog")).toHaveLength(22);
  return [
    ...staticPages,
    ...slugs("projects").map((s) => `/work/${s}`),
    ...slugs("blog").map((s) => `/blog/${s}`),
  ];
}

/** Only one browser project needs to check server responses and markup. */
function chromiumOnly() {
  test.skip(
    test.info().project.name !== "chromium",
    "server-side check; runs once, in the chromium project"
  );
}

/** A hit as text that names the file, line and rule, never the match. */
const describeHit = (h: DenyHit) => `${h.file}:${h.line} ${h.rule}`;

/**
 * next.config.ts source without its allowedDevOrigins property: the property
 * itself, up to its closing comma, and the comment lines right above it.
 */
function withoutDevOrigins(source: string): string {
  const key = /^ {2}allowedDevOrigins:/m.exec(source);
  expect(key, "allowedDevOrigins not found").not.toBeNull();
  // The property ends at its first comma outside brackets and strings; the
  // rest of its line stays, so a sibling on the same line is compared.
  let end = key!.index + key![0].length;
  let depth = 0;
  let quote = "";
  for (; end < source.length; end++) {
    const c = source[end];
    if (quote) {
      if (c === "\\") end++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if ("([{".includes(c)) {
      depth++;
    } else if (")]}".includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) {
      end++;
      break;
    }
  }
  // Comment lines directly above the property go with it.
  let start = key!.index;
  while (start > 0) {
    const prev = source.lastIndexOf("\n", start - 2) + 1;
    if (!/^ {2}\/\//.test(source.slice(prev, start - 1))) break;
    start = prev;
  }
  return source.slice(0, start) + source.slice(end).replace(/^[ \t]*\n/, "");
}

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
    // A server already on the port is never reused, locally or in CI, so a
    // stale build cannot stand in for the tree under test.
    for (const CI of [undefined, "true"]) {
      const withCi = loadConfig("playwright.config.ts", { CI });
      expect(
        (withCi.webServer as { reuseExistingServer: boolean })
          .reuseExistingServer,
        `CI=${CI}`
      ).toBe(false);
    }
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
    for (const [name, field] of [
      ["PR_HEAD_SHA", "head"],
      ["PR_BASE_SHA", "base"],
    ]) {
      expect(run).toMatch(
        new RegExp(
          `\\n\\s+env:\\n(?:\\s+\\S.*\\n)*?\\s+${name}: \\$\\{\\{ github\\.event\\.pull_request\\.${field}\\.sha \\}\\}`
        )
      );
    }
    // A push build (no PR head) judges no PR; a PR build uses its own base.
    const head = git(["rev-parse", "HEAD"]).trim();
    expect(prRange({ CI: "true", PR_HEAD_SHA: "" })).toBeNull();
    expect(
      prRange({ CI: "true", GITHUB_EVENT_NAME: "push", PR_HEAD_SHA: "" })
    ).toBeNull();
    // A pull request run missing either SHA fails loudly instead.
    for (const missing of [
      { PR_HEAD_SHA: "", PR_BASE_SHA: head },
      { PR_HEAD_SHA: head, PR_BASE_SHA: " " },
    ]) {
      expect(() =>
        prRange({ CI: "true", GITHUB_EVENT_NAME: "pull_request", ...missing })
      ).toThrow("a pull request build must set");
    }
    expect(
      prRange({ CI: "true", PR_HEAD_SHA: head, PR_BASE_SHA: head })
    ).toEqual({ base: head, head });

    // Checks pinned to PRV-1 apply on its PR and on the push build of its
    // merge (the merge's first parent lacks the guards), not on later merges.
    const merges = mkdtempSync(path.join(os.tmpdir(), "adds-file-"));
    try {
      const g = (args: string[]) => git(args, { cwd: merges }).trim();
      const commitFile = (file: string) => {
        mkdirSync(path.dirname(path.join(merges, file)), { recursive: true });
        writeFileSync(path.join(merges, file), `${file}\n`);
        g(["add", "--", file]);
        g(["commit", "-q", "-m", file]);
      };
      const merge = (branch: string) =>
        g(["merge", "-q", "--no-ff", "--no-edit", branch]);
      g(["init", "-q", "-b", "main"]);
      g(["config", "user.name", "Throwaway"]);
      g(["config", "user.email", "throwaway@example.com"]);
      g(["config", "commit.gpgsign", "false"]);
      commitFile("page.txt");
      const GUARDS = "e2e/guards.spec.ts";
      const push = { CI: "true", PR_HEAD_SHA: "" };
      const at = { cwd: merges };
      expect(addsFile(GUARDS, push, at), "a root commit").toBe(false);
      const before = g(["rev-parse", "HEAD"]);
      g(["checkout", "-q", "-b", "prv-1"]);
      commitFile(GUARDS);
      commitFile("more.txt");
      const prv1 = g(["rev-parse", "HEAD"]);
      const pr = { CI: "true", PR_HEAD_SHA: prv1, PR_BASE_SHA: before };
      expect(addsFile(GUARDS, pr, at), "PRV-1's PR").toBe(true);
      g(["checkout", "-q", "main"]);
      merge("prv-1");
      expect(addsFile(GUARDS, push, at), "PRV-1's merge").toBe(true);
      g(["checkout", "-q", "-b", "later"]);
      commitFile("later.txt");
      g(["checkout", "-q", "main"]);
      merge("later");
      expect(addsFile(GUARDS, push, at), "a later merge").toBe(false);
    } finally {
      rmSync(merges, { recursive: true, force: true });
    }
  });

  test("repo stays a full clone in PR runs", () => {
    nodeOnly();
    // Throws on a pull request run missing either SHA; null on a push build.
    const range = prRange();
    test.skip(range === null, "push build: no pull request range");
    // Playwright's PR diff capture fetches the base with --depth=1, which
    // cuts its history, so a base newer than the fork point has no merge base.
    expect(git(["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    expect(
      gitOk(["merge-base", range!.base, range!.head]),
      `merge-base ${range!.base} ${range!.head}`
    ).toBe(true);
    expect(playwrightConfig.captureGitInfo).toStrictEqual({
      commit: true,
      diff: false,
    });
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

  test("nothing private", () => {
    nodeOnly();
    // Every tracked text file, except the three that define the patterns.
    expect(denylistHits(() => true).map(describeHit)).toEqual([]);
  });

  test("only intended application changes", () => {
    nodeOnly();
    // The favicon keeps every frame, its dimensions and its decoded pixels.
    const favicon = readFileSync(path.join(ROOT, faviconPixels.file));
    const expected = faviconPixels.frames as FrameHash[];
    expect(icoFrameHashes(favicon)).toEqual(expected);
    if (gitOk(["cat-file", "-e", `${faviconPixels.sha}^{commit}`])) {
      const before = gitBuffer([
        "show",
        `${faviconPixels.sha}:${faviconPixels.file}`,
      ]);
      expect(icoFrameHashes(before)).toEqual(expected);
    }

    // The next.config.ts comparison drops only allowedDevOrigins: another
    // property added next to it still shows up.
    const before = [
      "const nextConfig = {",
      '  allowedDevOrigins: ["198.51.100.7"],',
      '  pageExtensions: ["ts"],',
      "};",
    ].join("\n");
    const after = [
      "const nextConfig = {",
      "  // From DEV_ORIGINS.",
      '  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "")',
      '    .split(",")',
      "    .filter(Boolean),",
      '  pageExtensions: ["ts"],',
      "};",
    ].join("\n");
    const sneaked = after.replace(
      "  pageExtensions",
      '  output: "export",\n  pageExtensions'
    );
    expect(withoutDevOrigins(after)).toBe(withoutDevOrigins(before));
    expect(withoutDevOrigins(sneaked)).not.toBe(withoutDevOrigins(before));
    // A property on the same line as allowedDevOrigins shows up too.
    const sameLine = after.replace(
      "    .filter(Boolean),",
      '    .filter(Boolean), output: "export",'
    );
    expect(withoutDevOrigins(sameLine)).not.toBe(withoutDevOrigins(before));

    // allowedDevOrigins comes from DEV_ORIGINS and is empty without it.
    const unset = loadConfig("next.config.ts", { DEV_ORIGINS: undefined });
    expect(unset.allowedDevOrigins).toEqual([]);
    const two = loadConfig("next.config.ts", {
      DEV_ORIGINS: "https://one.example,https://two.example",
    });
    expect(two.allowedDevOrigins).toEqual([
      "https://one.example",
      "https://two.example",
    ]);

    // The scope check is PRV-1's own: it applies while the base branch does
    // not carry these guards yet, and compares the PR head with that base.
    const range = prRange();
    if (!range || existsAt(range.base, "e2e/guards.spec.ts")) return;
    const { base, head } = range;
    const isApplication = (file: string) =>
      /^(app|components|content|lib|public|types)\//.test(file) ||
      /^(next\.config\.ts|middleware\.ts|proxy\.ts|instrumentation\.ts|postcss\.config\.mjs)$/.test(
        file
      );
    const changed = git(["diff", "--name-only", "--no-renames", base, head])
      .split("\n")
      .filter(Boolean)
      .filter(isApplication);
    const allowed = [
      "app/favicon.ico",
      "components/blog/SocialPost.tsx",
      "content/blog/first-marathon.mdx",
      "next.config.ts",
    ];
    for (const file of changed) {
      expect(allowed, `out of scope: ${file}`).toContain(file);
    }

    // In next.config.ts only the allowedDevOrigins property changes.
    expect(withoutDevOrigins(git(["show", `${head}:next.config.ts`]))).toBe(
      withoutDevOrigins(git(["show", `${base}:next.config.ts`]))
    );

    // No runtime dependency is added, removed or changed.
    const deps = (sha: string) =>
      JSON.parse(git(["show", `${sha}:package.json`])).dependencies;
    expect(deps(head)).toEqual(deps(base));
  });

  test("images carry no metadata", () => {
    nodeOnly();
    // Images are picked by content as well as by name, in any case.
    const images = committedTree()
      .filter((f) => isImageCandidate(f.path, f.content))
      .map((f) => f.path);
    expect(images).toEqual(
      expect.arrayContaining([
        "app/favicon.ico",
        "e2e/fixtures/images/clean.jpg",
        "e2e/fixtures/images/clean.png",
      ])
    );
    const tracked = checkImages(images);
    expect(tracked.stderr).toBe("");
    expect(tracked.status).toBe(0);

    // Selection: a renamed or oddly cased image is a candidate; text, an
    // MP4 and a font are not.
    const dirtyJpeg = jpegWithSegment(
      readFileSync(path.join(ROOT, "e2e/fixtures/images/clean.jpg")),
      exifGpsSegment()
    );
    const utf16Svg = Buffer.from(
      '\uFEFF<svg xmlns="http://www.w3.org/2000/svg"/>',
      "utf16le"
    );
    for (const [file, bytes] of [
      ["public/photo.data", dirtyJpeg],
      ["public/a/b/Photo.JpEg", Buffer.from("anything")],
      ["public/icon.txt", utf16Svg],
      ["public/drawing", Buffer.from('<?xml version="1.0"?>\n<svg/>')],
      // A prolog of any length, and a doctype with an internal subset.
      [
        "public/drawing.dat",
        Buffer.from(
          `<?xml version="1.0"?>\n<!-- ${"x".repeat(5000)} -->\n<svg/>`
        ),
      ],
      [
        "public/subset.dat",
        Buffer.from('<!DOCTYPE svg [ <!ENTITY a "b"> ]>\n<svg/>'),
      ],
    ] as const) {
      expect(isImageCandidate(file, bytes), file).toBe(true);
    }
    const mp4 = Buffer.from("\0\0\0\x18ftypisom\0\0\x02\0", "latin1");
    for (const [file, bytes] of [
      ["content/blog/post.mdx", Buffer.from("# A post\n")],
      ["public/clip.mp4", mp4],
      ["public/font.woff2", Buffer.from("wOF2\0\x01\0\0", "latin1")],
    ] as const) {
      expect(isImageCandidate(file, bytes), file).toBe(false);
    }

    // Correctly sized chunks and closed roots pass.
    const cleanPng = readFileSync(
      path.join(ROOT, "e2e/fixtures/images/clean.png")
    );
    expect(
      checkPng(
        pngWithChunk(cleanPng, pngChunk("sBIT", Buffer.from([8, 8, 8, 8])))
      )
    ).toEqual([]);
    expect(
      checkPng(pngWithChunk(cleanPng, pngChunk("bKGD", Buffer.alloc(6))))
    ).toEqual([]);
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>\n<!-- end -->\n',
    ]) {
      expect(checkSvg(Buffer.from(svg)), svg).toEqual([]);
    }

    // The cleaned favicon keeps all four frames.
    const favicon = readFileSync(path.join(ROOT, "app/favicon.ico"));
    expect(readIcoDirectory(favicon).entries).toHaveLength(4);
    expect(checkIco(favicon)).toEqual([]);

    const jpeg = readFileSync(path.join(ROOT, "e2e/fixtures/images/clean.jpg"));
    const png = readFileSync(path.join(ROOT, "e2e/fixtures/images/clean.png"));
    const frames = icoFrames(favicon);
    const pngFrame = frames.findIndex((f) => isPng(f.data));
    const bmpFrame = frames.findIndex((f) => !isPng(f.data));
    expect(pngFrame).toBeGreaterThan(-1);
    expect(bmpFrame).toBeGreaterThan(-1);
    const replaceFrame = (index: number, data: Buffer) =>
      buildIco(frames.map((f, i) => (i === index ? { ...f, data } : f)));
    const wrongHeader = Buffer.from(frames[bmpFrame].data);
    wrongHeader.writeUInt32LE(124, 0);
    const wrongSize = Buffer.from(frames[bmpFrame].data);
    wrongSize.writeInt32LE(wrongSize.readInt32LE(4) + 1, 4);
    const ico = buildIco(frames);

    const PAYLOAD = "Zq9 made-up owner payload";
    const dir = mkdtempSync(path.join(os.tmpdir(), "image-metadata-"));
    try {
      const dirty: [string, Buffer, RegExp[]][] = [
        [
          "gps.jpg",
          jpegWithSegment(jpeg, exifGpsSegment()),
          [/APP1 segment \(Exif\)/],
        ],
        [
          "xmp.jpg",
          jpegWithSegment(jpeg, xmpSegment()),
          [/APP1 segment \(XMP\)/],
        ],
        [
          "unknown-app.jpg",
          jpegWithSegment(
            jpeg,
            jpegSegment(0xe3, Buffer.from(`${PAYLOAD}\0more`, "latin1"))
          ),
          [/APP3 segment \(unidentified payload\)/],
        ],
        [
          "unknown-app0.jpg",
          Buffer.concat([
            jpeg.subarray(0, 2),
            jpegSegment(0xe0, Buffer.from(PAYLOAD, "latin1")),
            jpeg.subarray(2),
          ]),
          [/APP0 segment \(unidentified payload\), not JFIF/],
        ],
        [
          "trailing.jpg",
          Buffer.concat([jpeg, Buffer.from("made-up")]),
          [/7 bytes after EOI/],
        ],
        [
          "ztxt.png",
          pngWithChunk(
            png,
            pngChunk(
              "zTXt",
              Buffer.from("Comment\0\0x\x9c\x03\0\0\0\0\x01", "latin1")
            )
          ),
          [/chunk zTXt/],
        ],
        [
          "trailing.png",
          Buffer.concat([png, Buffer.from("made-up")]),
          [/7 bytes after IEND/],
        ],
        [
          "exif.ico",
          replaceFrame(
            pngFrame,
            pngWithChunk(
              frames[pngFrame].data,
              pngChunk("eXIf", exifGpsSegment().subarray(10))
            )
          ),
          [new RegExp(`frame ${pngFrame}: PNG chunk eXIf`)],
        ],
        [
          "bitmap-trailing.ico",
          replaceFrame(
            bmpFrame,
            Buffer.concat([frames[bmpFrame].data, Buffer.alloc(16)])
          ),
          [
            new RegExp(
              `frame ${bmpFrame}: bitmap payload is \\d+ bytes, its header implies \\d+`
            ),
          ],
        ],
        [
          "bitmap-header.ico",
          replaceFrame(bmpFrame, wrongHeader),
          [
            new RegExp(
              `frame ${bmpFrame}: bitmap header is 124 bytes, not a 40-byte BITMAPINFOHEADER`
            ),
          ],
        ],
        [
          "bitmap-size.ico",
          replaceFrame(bmpFrame, wrongSize),
          [
            new RegExp(
              `frame ${bmpFrame}: bitmap header says \\d+x\\d+, the directory says`
            ),
          ],
        ],
        [
          "bounds-end.ico",
          withFrameOffset(ico, 1, ico.length - 4),
          [/frame 1: invalid bounds/],
        ],
        [
          "bounds-directory.ico",
          withFrameOffset(ico, 0, 6),
          [/frame 0: invalid bounds/],
        ],
        [
          "metadata.svg",
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg"><metadata>${XMP_PACKET}</metadata></svg>`
          ),
          [/<metadata> element/],
        ],
        [
          "utf16.svg",
          Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg"><metadata>${XMP_PACKET}</metadata></svg>`,
              "utf16le"
            ),
          ]),
          [/SVG is not UTF-8/],
        ],
        [
          "latin1.svg",
          Buffer.from(
            '<?xml version="1.0" encoding="ISO-8859-1"?><svg xmlns="http://www.w3.org/2000/svg"/>'
          ),
          [/SVG declares an encoding other than UTF-8/],
        ],
        [
          "not-really.svg",
          Buffer.from("Just some text that is not an SVG.\n"),
          [/not an SVG document/],
        ],
        [
          "exif.webp",
          webpWithChunk(CLEAN_WEBP, "EXIF", exifGpsSegment().subarray(10)),
          [/chunk EXIF/],
        ],
        [
          "xmp.webp",
          webpWithChunk(CLEAN_WEBP, "XMP ", Buffer.from(XMP_PACKET)),
          [/chunk XMP/],
        ],
        [
          "riff.webp",
          Buffer.concat([CLEAN_WEBP, Buffer.from("made-up")]),
          [/7 bytes beyond the RIFF size/],
        ],
        // Bytes hidden inside allowed structures, not after them.
        [
          "jfif-extra.jpg",
          Buffer.concat([
            jpeg.subarray(0, 2),
            jpegSegment(
              0xe0,
              Buffer.concat([jpeg.subarray(6, 20), Buffer.from(PAYLOAD)])
            ),
            jpeg.subarray(20),
          ]),
          [/APP0 JFIF segment is \d+ bytes, not 14/],
        ],
        [
          "adobe-extra.jpg",
          jpegWithSegment(
            jpeg,
            jpegSegment(
              0xee,
              Buffer.concat([
                Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1"),
                Buffer.from(PAYLOAD),
              ])
            )
          ),
          [/APP14 Adobe segment is \d+ bytes, not 12/],
        ],
        [
          "iend-data.png",
          Buffer.concat([
            png.subarray(0, png.length - 12),
            pngChunk("IEND", Buffer.from(PAYLOAD)),
          ]),
          [/chunk IEND is \d+ bytes, not 0/],
        ],
        // Ancillary PNG chunks sized wrongly for the colour type (RGBA).
        [
          "sbit.png",
          pngWithChunk(
            png,
            pngChunk(
              "sBIT",
              Buffer.concat([Buffer.from([8, 8, 8, 8]), Buffer.from(PAYLOAD)])
            )
          ),
          [/chunk sBIT is \d+ bytes, not valid for colour type 6/],
        ],
        [
          "bkgd.png",
          pngWithChunk(
            png,
            pngChunk(
              "bKGD",
              Buffer.concat([Buffer.alloc(6), Buffer.from(PAYLOAD)])
            )
          ),
          [/chunk bKGD is \d+ bytes, not valid for colour type 6/],
        ],
        [
          "trns.png",
          pngWithChunk(png, pngChunk("tRNS", Buffer.from(PAYLOAD))),
          [/chunk tRNS is \d+ bytes, not valid for colour type 6/],
        ],
        // A cut-short SVG: its root is never closed.
        [
          "cut.svg",
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/>'
          ),
          [/SVG root element is not closed/],
        ],
        [
          "cut-open.svg",
          Buffer.from('<?xml version="1.0"?>\n<svg '),
          [/SVG root element is not closed/],
        ],
        [
          "anmf.webp",
          webpWithRaw(
            CLEAN_WEBP,
            riffChunk(
              "ANMF",
              Buffer.concat([
                Buffer.alloc(16),
                riffChunk("EXIF", Buffer.from(PAYLOAD)),
              ])
            )
          ),
          [/ANMF frame chunk EXIF/],
        ],
        [
          "padding.webp",
          webpWithRaw(
            CLEAN_WEBP,
            riffChunk("ALPH", Buffer.from("x"), "Z".charCodeAt(0))
          ),
          [/chunk ALPH has a nonzero padding byte/],
        ],
        [
          "animation.gif",
          Buffer.from("GIF89a\x01\0\x01\0\0\0\0;", "latin1"),
          [/GIF format is not allowed/],
        ],
      ];
      for (const [name, bytes, reasons] of dirty) {
        const file = path.join(dir, name);
        writeFileSync(file, bytes);
        const result = checkImages([file]);
        expect(result.status, `${name} passed the checker`).toBe(1);
        // A diagnostic never echoes a payload.
        expect(result.stderr).not.toContain(PAYLOAD);
        const lines = result.stderr.split("\n").filter(Boolean);
        for (const reason of reasons) {
          expect(
            lines.some((l) => l.startsWith(`${file}: `) && reason.test(l)),
            `${name}: expected ${reason} in\n${result.stderr}`
          ).toBe(true);
        }
      }

      // A clean WebP and the clean originals pass.
      const webp = path.join(dir, "clean.webp");
      writeFileSync(webp, CLEAN_WEBP);
      const clean = checkImages([
        webp,
        path.join(ROOT, "e2e/fixtures/images/clean.jpg"),
        path.join(ROOT, "e2e/fixtures/images/clean.png"),
      ]);
      expect(clean.stderr).toBe("");
      expect(clean.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("pre-commit blocks metadata", () => {
    nodeOnly();
    const repo = throwawayRepo(
      [
        ".husky/pre-commit",
        ".lintstagedrc.json",
        "scripts/image-metadata.ts",
        "e2e/support/ico.ts",
      ],
      "pre-commit-"
    );
    try {
      expect(repo.git(["remote"]).trim()).toBe("");
      const jpeg = readFileSync(
        path.join(ROOT, "e2e/fixtures/images/clean.jpg")
      );
      const commits = () => repo.git(["rev-list", "--count", "HEAD"]).trim();

      // A staged dirty JPEG blocks the commit, naming the file and the fix.
      repo.write("photos/dirty.jpg", jpegWithSegment(jpeg, exifGpsSegment()));
      repo.git(["add", "photos/dirty.jpg"]);
      const blocked = repo.run("git", ["commit", "-m", "add a dirty photo"]);
      expect(blocked.status).not.toBe(0);
      expect(blocked.output).toContain("photos/dirty.jpg");
      expect(blocked.output).toContain("APP1 segment (Exif)");
      expect(blocked.output).toContain("npm run photos");
      expect(commits()).toBe("1");

      // Nested, oddly cased and renamed dirty images are blocked too.
      const dirty = jpegWithSegment(jpeg, exifGpsSegment());
      const sneaky = ["photos/deep/er/Photo.JpEg", "photos/renamed.data"];
      for (const file of sneaky) repo.write(file, dirty);
      repo.git(["add", "--", ...sneaky]);
      const sneakyBlocked = repo.run("git", ["commit", "-m", "sneak photos"]);
      expect(sneakyBlocked.status).not.toBe(0);
      for (const file of sneaky) {
        expect(sneakyBlocked.output).toContain(`${file}: APP1 segment (Exif)`);
      }
      expect(commits()).toBe("1");
      repo.git(["reset", "-q", "--", ...sneaky]);

      // Left unstaged, the dirty JPEG does not block a clean one.
      repo.git(["reset", "-q", "--", "photos/dirty.jpg"]);
      repo.write("photos/clean.jpg", jpeg);
      repo.git(["add", "photos/clean.jpg"]);
      const passed = repo.run("git", ["commit", "-m", "add a clean photo"]);
      expect(passed.status, passed.output).toBe(0);
      expect(commits()).toBe("2");
      expect(
        repo.git(["show", "--name-only", "--format=", "HEAD"]).trim()
      ).toBe("photos/clean.jpg");
      expect(repo.git(["status", "--porcelain"])).toContain(
        "?? photos/dirty.jpg"
      );
    } finally {
      repo.remove();
    }
  });

  test("marathon post embeds as links", async ({ page }, testInfo) => {
    // Two widths, each settling and then waiting 5 s past load.
    test.setTimeout(2 * 60_000);
    const social = /(^|\.)(instagram\.com|facebook\.net)$/;
    const socialRequests: string[] = [];
    page.on("request", (request) => {
      if (social.test(new URL(request.url()).hostname)) {
        socialRequests.push(request.url());
      }
    });
    const errors = collectErrors(page);
    await stubVercelInsights(page);
    const cards = page
      .locator("article a")
      .filter({ hasText: /View on (Instagram|Facebook)/ });
    const facebook = page.locator(".fb-post, #fb-root");

    // The fixture box was measured on the pre-change page, so it pins PRV-1
    // only; later layout work (PRV-14) moves the card. Its identity, the lack
    // of a Facebook container, the requests and the console stay checked.
    // That holds on its PR and on the push build of its merge.
    const pinBox =
      testInfo.project.name === "chromium" && addsFile("e2e/guards.spec.ts");

    for (const [width, expected] of Object.entries(marathonCard.widths)) {
      await page.setViewportSize(expected.viewport);
      await page.goto(marathonCard.url);
      const loadedAt = Date.now();
      // At load, before waiting for anything: no Facebook container, even a
      // passing one.
      expect(await facebook.count(), `${width}px at load: Facebook`).toBe(0);
      await expect(cards.first()).toBeVisible();

      const measure = () =>
        cards.evaluateAll((links) =>
          links.map((a) => {
            const r = a.getBoundingClientRect();
            return {
              text: (a.textContent ?? "").trim(),
              href: a.getAttribute("href"),
              box: {
                x: r.x + window.scrollX,
                y: r.y + window.scrollY,
                width: r.width,
                height: r.height,
              },
            };
          })
        );
      const check = async (when: string, box: boolean) => {
        const found = await measure();
        expect(found, `${width}px ${when}: link cards`).toHaveLength(1);
        expect(found[0].text).toBe(expected.text);
        expect(found[0].href).toBe(expected.href);
        // The box was measured in Chromium, so only Chromium compares it.
        if (box && pinBox) {
          for (const key of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(found[0].box[key] - expected.box[key]),
              `${width}px ${when}: box ${key}`
            ).toBeLessThanOrEqual(2);
          }
        }
        expect(await facebook.count(), `${width}px ${when}: Facebook`).toBe(0);
      };

      // The card as it first appears, then once the page has settled.
      await check("at load", false);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await check("settled", true);
      expect(errors, `${width}px: console errors`).toEqual([]);
      // Past the old 3 s fallback timeout, the card is still the only one.
      await page.waitForTimeout(Math.max(0, loadedAt + 5000 - Date.now()));
      await check("5 s after load", true);
    }
    expect(socialRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("every URL resolves", async ({ request, baseURL }) => {
    chromiumOnly();
    // urls.json starts as exactly the page URLs of the pre-change tree. Later
    // PRs may add routes to it but never drop one of these.
    const expected = originalUrls();
    const range = prRange();
    const introducing =
      range !== null && !existsAt(range.base, "e2e/fixtures/urls.json");
    expect(urlListProblems(URLS, expected, introducing)).toEqual([]);
    // The rule itself: exact on the introducing PR, additive afterwards.
    const added = [...expected, "/preview/home"];
    expect(urlListProblems(added, expected, true)).not.toEqual([]);
    expect(urlListProblems(added, expected, false)).toEqual([]);
    expect(urlListProblems(expected.slice(1), expected, false)).not.toEqual([]);
    expect(urlListProblems([...expected, "/"], expected, false)).not.toEqual(
      []
    );
    // Entries are checked as site paths before any request is made.
    for (const away of [
      "https://elsewhere.example/blog",
      "//elsewhere.example/blog",
      "/\\elsewhere.example/blog",
      "blog",
    ]) {
      expect(
        urlListProblems([...expected, away], expected, false),
        away
      ).toContain(`${away} is not a path on the site`);
    }

    // Redirects follow the full Location from the URL that answered, and
    // never leave the site.
    const origin = new URL(baseURL!).origin;
    expect(nextHop(`${origin}/a/b`, "c?x=1", origin).href).toBe(
      `${origin}/a/c?x=1`
    );
    for (const away of [
      "https://elsewhere.example/blog",
      "//elsewhere.example/",
    ]) {
      expect(() => nextHop(`${origin}/blog`, away, origin)).toThrow(
        "a redirect off the site"
      );
    }

    // Each answers 200, or a 308 that leads to a 200. The first status is
    // read before any redirect is followed.
    const failures: string[] = [];
    for (const url of URLS) {
      let target = new URL(url, origin).href;
      const statuses: number[] = [];
      try {
        for (let hop = 0; hop < 5; hop++) {
          const res = await request.get(target, { maxRedirects: 0 });
          statuses.push(res.status());
          if (res.status() !== 308) break;
          target = nextHop(target, res.headers()["location"], origin).href;
        }
      } catch (error) {
        failures.push(`${url}: ${(error as Error).message}`);
        continue;
      }
      const last = statuses[statuses.length - 1];
      const ok = last === 200 && statuses.slice(0, -1).every((s) => s === 308);
      if (!ok) failures.push(`${url}: ${statuses.join(" -> ")}`);
    }
    expect(failures).toEqual([]);
  });

  test("every content page has one h1", async ({ page }) => {
    chromiumOnly();
    // Every project and post in the tree, and every route added after
    // urls.json was locked; the original static pages are covered elsewhere.
    const original = new Set(originalUrls());
    const content = contentRoutes();
    const pages = headingPages(URLS, original, content);
    expect(pages.filter((u) => original.has(u))).toHaveLength(26);
    // A post in the tree but missing from urls.json is still visited.
    expect(content).toEqual(expect.arrayContaining(["/blog/first-marathon"]));
    expect(
      headingPages(URLS, original, [...content, "/blog/a-new-post"])
    ).toContain("/blog/a-new-post");
    await stubVercelInsights(page);
    const counts: string[] = [];
    for (const url of pages) {
      await page.goto(url);
      const h1 = await page.locator("h1").count();
      if (h1 !== 1) counts.push(`${url}: ${h1} h1`);
    }
    expect(counts).toEqual([]);
  });

  test("every route renders without a console error", async ({ context }) => {
    test.setTimeout(10 * 60_000);
    const failures: string[] = [];
    for (const width of [1440, 390]) {
      for (const url of URLS) {
        // A fresh page per URL: leaving a page cancels its prefetches, and
        // WebKit reports those as errors against the page being left.
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await stubVercelInsights(page);
        const errors = collectErrors(page);
        const res = await page.goto(url);
        expect(res?.status(), url).toBe(200);
        await page.waitForLoadState("networkidle");
        for (const error of [...errors]) {
          failures.push(`${width}px ${url}: ${error}`);
        }
        await page.close();
      }
    }
    expect(failures).toEqual([]);
  });

  test("captures desktop and phone", async ({ page }, testInfo) => {
    const width = SHOT_WIDTHS[testInfo.project.name];
    test.skip(!width, "screenshots are taken in Chromium and Mobile Chrome");
    await stubVercelInsights(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const taken = await shot(page, testInfo, "home");
    expect(taken?.width).toBe(width);
    const png = readFileSync(taken!.path);
    expect(png.toString("latin1", 12, 16)).toBe("IHDR");
    const [pngWidth, pngHeight] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(pngWidth).toBe(width);
    // Full page: taller than the viewport, as tall as the document.
    const { inner, scroll } = await page.evaluate(() => ({
      inner: window.innerHeight,
      scroll: document.documentElement.scrollHeight,
    }));
    expect(pngHeight).toBeGreaterThan(inner);
    expect(Math.abs(pngHeight - scroll)).toBeLessThanOrEqual(1);
  });

  test("card detector controls", async ({ page }) => {
    const row = (children: string, attrs = "") =>
      `<div ${attrs} style="display:flex;gap:12px;background:#fff">${children}</div>`;
    const repeat = (n: number, html: string) => Array(n).fill(html).join("");
    const box = "width:120px;height:80px;";
    const bordered = `<div style="${box}border:1px solid #999;border-radius:8px">x</div>`;
    const shaded = `<div style="${box}background:#eee;border-radius:8px">x</div>`;
    const link = `<a href="#" style="display:block;${box}border:1px solid #999;border-radius:6px">x</a>`;
    const ruled = `<div style="${box}border-top:1px solid #999;border-bottom:1px solid #999;border-radius:4px">x</div>`;
    const button = `<button style="${box}border:1px solid #999;border-radius:8px">x</button>`;
    const square = `<div style="${box}border:1px solid #999;border-radius:0">x</div>`;
    const wide = `<div style="width:160px;height:80px;border:1px solid #999;border-radius:8px">x</div>`;
    const tall = `<div style="width:120px;height:96px;border:1px solid #999;border-radius:8px">x</div>`;
    const nearWide = `<div style="width:120.25px;height:80px;border:1px solid #999;border-radius:8px">x</div>`;
    const nearTall = `<div style="width:120px;height:80.25px;border:1px solid #999;border-radius:8px">x</div>`;

    const cases: [string, string, { cards: number; grids: number }][] = [
      [
        "three bordered rounded siblings",
        row(repeat(3, bordered)),
        { cards: 3, grids: 1 },
      ],
      [
        "three rounded background-only siblings",
        row(repeat(3, shaded)),
        { cards: 3, grids: 1 },
      ],
      ["three rounded a blocks", row(repeat(3, link)), { cards: 3, grids: 1 }],
      [
        "ruled rows",
        `<div style="background:#fff">${repeat(3, ruled)}</div>`,
        { cards: 0, grids: 0 },
      ],
      ["three rounded buttons", row(repeat(3, button)), { cards: 0, grids: 0 }],
      [
        "three rounded siblings in a fragment",
        row(repeat(3, bordered), "data-fragment"),
        { cards: 0, grids: 0 },
      ],
      [
        "two qualifying siblings",
        row(repeat(2, bordered)),
        { cards: 2, grids: 0 },
      ],
      [
        "one of three a different width",
        row(repeat(2, bordered) + wide),
        { cards: 3, grids: 0 },
      ],
      [
        "one of three a different height",
        row(repeat(2, bordered) + tall),
        { cards: 3, grids: 0 },
      ],
      [
        "one of three a quarter pixel wider",
        row(repeat(2, bordered) + nearWide),
        { cards: 3, grids: 0 },
      ],
      [
        "one of three a quarter pixel taller",
        row(repeat(2, bordered) + nearTall),
        { cards: 3, grids: 0 },
      ],
      [
        "three square bordered siblings",
        row(repeat(3, square)),
        { cards: 0, grids: 0 },
      ],
    ];
    for (const [name, html, expected] of cases) {
      await page.setContent(
        `<body style="margin:0;background:#fff">${html}</body>`
      );
      const report = await detectCards(page);
      expect(report.cards.length, `${name}: cards`).toBe(expected.cards);
      expect(report.grids.length, `${name}: grids`).toBe(expected.grids);
      if (expected.grids) expect(report.grids[0].count, name).toBe(3);
    }
  });

  test("pre-push privacy", () => {
    nodeOnly();
    test.setTimeout(5 * 60_000);
    const repo = throwawayRepo(
      [".husky/pre-push", "scripts/privacy-scan.ts", "e2e/support/denylist.ts"],
      "pre-push-"
    );
    const root = path.dirname(repo.dir);
    // A fixture private list of made-up values.
    const literals = ["quokka-harbour-17", "Zephyrine Analytics"];
    const list = path.join(root, "private-list.txt");
    writeFileSync(list, `# fixture private list\n${literals.join("\n")}\n`);
    writeFileSync(path.join(root, "empty-list.txt"), "# nothing yet\n\n");
    const deny = DENYLIST_FIXTURES["private IP"].matches[0];
    // The first literal in fullwidth letters: NFKC makes it the same value.
    const FULLWIDTH = [...literals[0].toUpperCase()]
      .map((c) =>
        /[A-Z0-9]/.test(c) ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c
      )
      .join("");
    const withList = { PREFLIGHT_PRIVATE_LIST: list };
    const outputs: string[] = [];
    const run = (cmd: string, args: string[], env = {}, input?: string) => {
      const result = repo.run(cmd, args, {
        env: { ...withList, ...env },
        input,
      });
      outputs.push(result.output);
      return result;
    };
    const push = (...args: string[]) => run("git", ["push", ...args]);
    const bare = (name: string) => {
      const dir = path.join(root, `${name}.git`);
      repo.git(["init", "-q", "--bare", dir]);
      return dir;
    };
    const commit = (
      file: string,
      content: string,
      message = `edit ${file}`
    ) => {
      repo.write(file, content);
      repo.git(["add", "--", file]);
      repo.git(["commit", "-q", "-m", message]);
      return repo.git(["rev-parse", "HEAD"]).trim();
    };
    const refusedFor = (
      result: { status: number | null; output: string },
      ...needles: string[]
    ) => {
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain("privacy-scan: push refused");
      for (const needle of needles) expect(result.output).toContain(needle);
    };
    const hasRef = (remote: string, ref: string) =>
      repo.git(["ls-remote", remote, ref]).trim() !== "";
    const zero = "0".repeat(40);

    try {
      const remote = bare("remote");
      repo.git(["remote", "add", "origin", remote]);

      // A clean push goes through.
      const first = push("origin", "main");
      expect(first.status, first.output).toBe(0);
      expect(first.output).toContain("scanned 1 commit(s)");
      expect(hasRef(remote, "refs/heads/main")).toBe(true);

      // A private literal or a denylist hit under each scanned folder.
      for (const folder of [
        "docs/boards",
        "docs/provenance",
        "docs/tickets",
        "content",
      ]) {
        for (const [kind, text, rule] of [
          [
            "literal",
            `Met the ${literals[1]} team.`,
            "private list entry on line 3",
          ],
          ["denylist", `The box sits at ${deny}.`, "private IP"],
        ]) {
          const branch = `${kind}-${folder.replace(/\//g, "-")}`;
          repo.git(["checkout", "-q", "-b", branch, "main"]);
          commit(`${folder}/note.md`, `# Note\n\n${text}\n`);
          refusedFor(push("origin", branch), `${folder}/note.md:3 ${rule}`);
          expect(hasRef(remote, `refs/heads/${branch}`)).toBe(false);
          repo.git(["checkout", "-q", "main"]);
        }
      }

      // Added then removed within one push: refused, naming the first commit.
      repo.git(["checkout", "-q", "-b", "add-remove", "main"]);
      const added = commit("content/post.mdx", `Hello ${literals[0]}\n`);
      const removed = commit("content/post.mdx", "Hello\n");
      const addRemove = push("origin", "add-remove");
      refusedFor(addRemove, `${added.slice(0, 12)} content/post.mdx:1`);
      expect(addRemove.output).not.toContain(removed.slice(0, 12));

      // A value split by line wrapping, within one commit or completed by a
      // later one, and a wrapped value added then removed within one push.
      const [head1, tail1] = literals[1].split(" ");
      repo.git(["checkout", "-q", "-b", "wrapped", "main"]);
      commit("content/wrapped.mdx", `We met the ${head1}\n  ${tail1} team.\n`);
      refusedFor(
        push("origin", "wrapped"),
        "content/wrapped.mdx:1 private list entry on line 3"
      );
      repo.git(["checkout", "-q", "-b", "split-commits", "main"]);
      commit("content/split.mdx", `Thanks to ${head1}\n`);
      const completes = commit(
        "content/split.mdx",
        `Thanks to ${head1}\n${tail1} for the data.\n`
      );
      refusedFor(
        push("origin", "split-commits"),
        `${completes.slice(0, 12)} content/split.mdx:1 private list entry`
      );
      // Or joined by deleting the line between its halves.
      repo.git(["checkout", "-q", "-b", "split-joined", "main"]);
      commit("content/joined.mdx", `Thanks to ${head1}\n---\n${tail1}.\n`);
      const joins = commit(
        "content/joined.mdx",
        `Thanks to ${head1}\n${tail1}.\n`
      );
      refusedFor(
        push("origin", "split-joined"),
        `${joins.slice(0, 12)} content/joined.mdx:1 private list entry`
      );
      repo.git(["checkout", "-q", "-b", "wrap-remove", "main"]);
      const wrappedIn = commit("content/gone.mdx", `${head1}\n${tail1}\n`);
      commit("content/gone.mdx", "Gone.\n");
      refusedFor(
        push("origin", "wrap-remove"),
        `${wrappedIn.slice(0, 12)} content/gone.mdx:1`
      );

      // Added text the patch format could hide: a line that starts with
      // "++ ", a text file git attributes mark binary, and binary content.
      for (const [branch, file, content, needle] of [
        [
          "plus",
          "content/plus.mdx",
          `++ ${literals[0]}\n`,
          "content/plus.mdx:1",
        ],
        [
          "attr",
          "content/attr.mdx",
          `Hello ${literals[0]}\n`,
          "content/attr.mdx:1",
        ],
        [
          "binary",
          "public/data.bin",
          `\0\0${literals[0]}\0`,
          "public/data.bin private list entry on line 2 (binary file)",
        ],
      ]) {
        repo.git(["checkout", "-q", "-b", branch, "main"]);
        if (branch === "attr") commit(".gitattributes", "*.mdx binary\n");
        commit(file, content);
        refusedFor(push("origin", branch), needle);
        expect(hasRef(remote, `refs/heads/${branch}`)).toBe(false);
      }

      // A file name can publish a value too; the refusal masks it.
      for (const [branch, file, needle] of [
        [
          "named-literal",
          `content/${literals[0]}.mdx`,
          "content/[redacted] private list entry on line 2 in the file name",
        ],
        [
          "named-fullwidth",
          `content/${FULLWIDTH}-notes.mdx`,
          "content/[redacted] private list entry on line 2 in the file name",
        ],
        [
          "named-deny",
          `content/at-${deny}.mdx`,
          "content/at-[redacted].mdx private IP in the file name",
        ],
      ]) {
        repo.git(["checkout", "-q", "-b", branch, "main"]);
        commit(file, "Nothing private inside.\n");
        refusedFor(push("origin", branch), needle);
        expect(hasRef(remote, `refs/heads/${branch}`)).toBe(false);
      }

      // Without a readable private list every push is refused.
      repo.git(["checkout", "-q", "-b", "clean", "main"]);
      commit("content/clean.mdx", "Nothing private here.\n");
      refusedFor(
        run("git", ["push", "origin", "clean"], {
          PREFLIGHT_PRIVATE_LIST: undefined,
        }),
        "PREFLIGHT_PRIVATE_LIST is not set"
      );
      refusedFor(
        run("git", ["push", "origin", "clean"], {
          PREFLIGHT_PRIVATE_LIST: path.join(root, "missing.txt"),
        }),
        "cannot be read"
      );
      refusedFor(
        run("git", ["push", "origin", "clean"], {
          PREFLIGHT_PRIVATE_LIST: path.join(root, "empty-list.txt"),
        }),
        "the private list has no entries"
      );
      // A list in another encoding would match nothing: it is refused.
      const plain = `${literals.join("\n")}\n`;
      for (const [name, bytes, needle] of [
        [
          "utf16-bom.txt",
          Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from(plain, "utf16le"),
          ]),
          "plain UTF-8 text",
        ],
        ["utf16.txt", Buffer.from(plain, "utf16le"), "plain UTF-8 text"],
        [
          "utf8-bom.txt",
          Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(plain)]),
          "plain UTF-8 text",
        ],
        [
          "latin1.txt",
          Buffer.from(`Caf\xe9 ${literals[0]}\n`, "latin1"),
          "the private list is not valid UTF-8 text",
        ],
      ] as const) {
        const listFile = path.join(root, name);
        writeFileSync(listFile, bytes);
        refusedFor(
          run("git", ["push", "origin", "clean"], {
            PREFLIGHT_PRIVATE_LIST: listFile,
          }),
          needle
        );
      }
      // A list inside the repository is refused: directly (even when git
      // ignores it), through a symlink, or inside the git directory.
      const inRepo = path.join(repo.dir, "private-list.txt");
      writeFileSync(inRepo, `${literals[0]}\n`);
      repo.write(".git/info/exclude", "private-list.txt\n..private/\n");
      const linked = path.join(root, "linked-list.txt");
      symlinkSync(inRepo, linked);
      const inGitDir = path.join(repo.dir, ".git", "private-list.txt");
      writeFileSync(inGitDir, `${literals[0]}\n`);
      const dotted = path.join(repo.dir, "..private", "list.txt");
      repo.write("..private/list.txt", `${literals[0]}\n`);
      for (const inside of [inRepo, linked, inGitDir, dotted]) {
        refusedFor(
          run("git", ["push", "origin", "clean"], {
            PREFLIGHT_PRIVATE_LIST: inside,
          }),
          "the private list must be kept outside the repository"
        );
      }
      rmSync(inRepo);
      expect(hasRef(remote, "refs/heads/clean")).toBe(false);
      expect(push("origin", "clean").status).toBe(0);

      // A stale local remote-tracking ref that already holds the dirty
      // commit does not exempt it: new branch, then an existing one.
      repo.git(["checkout", "-q", "-b", "stale-new", "main"]);
      const staleNew = commit("content/stale.mdx", `${literals[0]}\n`);
      repo.git(["update-ref", "refs/remotes/origin/stale-new", staleNew]);
      refusedFor(push("origin", "stale-new"), "content/stale.mdx:1");
      repo.git(["checkout", "-q", "clean"]);
      const staleOld = commit("content/stale.mdx", `${literals[0]}\n`);
      repo.git(["update-ref", "refs/remotes/origin/clean", staleOld]);
      refusedFor(push("origin", "clean"), "content/stale.mdx:1");
      repo.git(["reset", "-q", "--hard", "HEAD~1"]);

      // A first push scans only commits new to every destination ref. A
      // branch other than main already holds a dirty commit, and its tip is
      // not even present locally.
      repo.git(["checkout", "-q", "-b", "archive", "main"]);
      const published = commit("content/archive.mdx", `${literals[0]}\n`);
      expect(
        run("git", ["push", "--no-verify", "origin", "archive"]).status
      ).toBe(0);
      const other = path.join(root, "other");
      repo.git(["clone", "-q", "--branch", "archive", remote, other]);
      repo.write("../other/content/more.mdx", "More.\n");
      repo.git(["add", "content/more.mdx"], { cwd: other });
      repo.git(
        [
          "-c",
          "user.name=O",
          "-c",
          "user.email=o@example.com",
          "commit",
          "-q",
          "-m",
          "more",
        ],
        { cwd: other }
      );
      repo.git(["push", "-q", "--no-verify", "origin", "archive"], {
        cwd: other,
      });
      const remoteTip = repo.git(["rev-parse", "HEAD"], { cwd: other }).trim();
      expect(repo.run("git", ["cat-file", "-e", remoteTip]).status).not.toBe(0);
      repo.git(["checkout", "-q", "-b", "topic", published]);
      commit("content/topic.mdx", "A clean follow-up.\n");
      const reached = push("origin", "topic");
      expect(reached.status, reached.output).toBe(0);
      expect(reached.output).toContain("scanned 1 commit(s)");

      // Only added text counts. Editing a file the destination already holds
      // a private value in passes, even on the value's own line; adding a
      // value to it, or another copy of the same one, is refused.
      repo.git(["checkout", "-q", "-b", "tainted", published]);
      commit("content/archive.mdx", `${literals[0]}\nA clean new line.\n`);
      commit(
        "content/archive.mdx",
        `${literals[0]} (edited)\nA clean new line.\n`
      );
      const tainted = push("origin", "tainted");
      expect(tainted.status, tainted.output).toBe(0);
      expect(tainted.output).toContain("scanned 2 commit(s)");
      for (const [branch, extra, needle] of [
        [
          "tainted-new",
          `Met ${literals[1]}.`,
          "content/archive.mdx:3 private list entry on line 3",
        ],
        [
          "tainted-copy",
          `Again ${literals[0]}.`,
          "content/archive.mdx:3 private list entry on line 2",
        ],
      ]) {
        repo.git(["checkout", "-q", "-b", branch, "tainted"]);
        commit(
          "content/archive.mdx",
          `${literals[0]} (edited)\nA clean new line.\n${extra}\n`
        );
        refusedFor(push("origin", branch), needle);
      }

      // Denylist matches follow the same rule: editing the prose around a
      // published one passes; a newly added one is refused.
      repo.git(["checkout", "-q", "-b", "deny-published", "main"]);
      const denyPublished = commit(
        "content/box.mdx",
        `The box sits at ${deny}.\n`
      );
      expect(
        run("git", ["push", "--no-verify", "origin", "deny-published"]).status
      ).toBe(0);
      repo.git(["checkout", "-q", "-b", "deny-edit", denyPublished]);
      commit("content/box.mdx", `The box still sits at ${deny}, unchanged.\n`);
      const denyEdit = push("origin", "deny-edit");
      expect(denyEdit.status, denyEdit.output).toBe(0);
      repo.git(["checkout", "-q", "-b", "deny-new", denyPublished]);
      commit(
        "content/box.mdx",
        `The box sits at ${deny}.\nIts twin sits at ${deny} too.\n`
      );
      refusedFor(push("origin", "deny-new"), "content/box.mdx:2 private IP");

      // Case-insensitive matching survives Unicode case changes: whole-string
      // folding, so ß matches SS, İ and ı match i, Greek sigmas match
      // whatever their position, and fullwidth letters match.
      const unicodeList = [
        { line: 1, value: "Straße Zephyr" },
        { line: 2, value: "İzmir Kuyu" },
        { line: 3, value: "οδυσσευς" },
        { line: 4, value: "quokka" },
        { line: 5, value: "ΚΟΣΜΟΣ" },
      ];
      for (const [text, line] of [
        ["At STRASSE ZEPHYR today", 1],
        ["izmir kuyu", 2],
        ["IZMIR KUYU", 2],
        ["ızmir kuyu", 2],
        ["ΟΔΥΣΣΕΥΣ", 3],
        ["ＱＵＯＫＫＡ", 4],
        ["κοσμος", 5],
      ] as const) {
        expect(
          findPrivate("a.md", text, unicodeList).map((h) => h.rule),
          text
        ).toContain(`private list entry on line ${line}`);
      }

      // The line diff marks inserted lines only.
      expect(
        addedLineNumbers(["a", "b", "c"], ["a", "x", "b", "c", "y"])
      ).toEqual([2, 5]);
      expect(addedLineNumbers(["a", "b"], ["b", "a"])).toEqual([2]);

      // One remote, separate fetch and push URLs: a commit the fetch side
      // already has is still new to the push side.
      const fetchSide = bare("fetch-side");
      const pushSide = bare("push-side");
      repo.git(["checkout", "-q", "main"]);
      for (const side of [fetchSide, pushSide]) {
        expect(push(side, "main").status).toBe(0);
      }
      repo.git(["remote", "add", "split", fetchSide]);
      repo.git(["remote", "set-url", "--push", "split", pushSide]);
      repo.git(["checkout", "-q", "-b", "shared", "main"]);
      commit("content/shared.mdx", `${literals[1]}\n`);
      expect(
        run("git", ["push", "--no-verify", fetchSide, "shared"]).status
      ).toBe(0);
      repo.git(["fetch", "-q", "split"]);
      repo.git(["checkout", "-q", "-b", "split-topic", "shared"]);
      commit("content/split.mdx", "Clean.\n");
      refusedFor(push("split", "split-topic"), "content/shared.mdx:1");
      expect(hasRef(pushSide, "refs/heads/split-topic")).toBe(false);

      // A root commit is scanned against the empty tree.
      const blob = repo
        .run("git", ["hash-object", "-w", "--stdin"], {
          input: `${literals[0]}\n`,
        })
        .output.trim();
      const inner = repo
        .run("git", ["mktree"], { input: `100644 blob ${blob}\troot.mdx\n` })
        .output.trim();
      const tree = repo
        .run("git", ["mktree"], { input: `040000 tree ${inner}\tcontent\n` })
        .output.trim();
      const rootCommit = repo.git(["commit-tree", tree, "-m", "root"]).trim();
      refusedFor(
        push("origin", `${rootCommit}:refs/heads/rooted`),
        `${rootCommit.slice(0, 12)} content/root.mdx:1`
      );

      // A clean ref deletion succeeds.
      expect(hasRef(remote, "refs/heads/clean")).toBe(true);
      const deletion = push("origin", "--delete", "clean");
      expect(deletion.status, deletion.output).toBe(0);
      expect(hasRef(remote, "refs/heads/clean")).toBe(false);

      // Fail closed: an unreachable destination, a local commit that cannot
      // be resolved, and a commit whose diff cannot be read.
      const hook = (url: string, line: string) =>
        run("sh", [".husky/pre-push", "origin", url], {}, `${line}\n`);
      const head = repo.git(["rev-parse", "main"]).trim();
      refusedFor(
        hook(
          path.join(root, "nowhere.git"),
          `refs/heads/main ${head} refs/heads/main ${zero}`
        ),
        "cannot list the destination's refs"
      );
      // Git's own error would name this destination, which holds a value.
      refusedFor(
        hook(
          path.join(root, `${literals[0]}.git`),
          `refs/heads/main ${head} refs/heads/main ${zero}`
        ),
        "cannot list the destination's refs"
      );
      const unknown = "1234567".repeat(5) + "89abc";
      refusedFor(
        hook(remote, `refs/heads/x ${unknown} refs/heads/x ${zero}`),
        "cannot work out which commits the push adds"
      );
      const broken = repo
        .run(
          "git",
          ["hash-object", "-t", "commit", "-w", "--literally", "--stdin"],
          {
            input:
              `tree ${"ab".repeat(20)}\n` +
              "author A <a@example.com> 1700000000 +0000\n" +
              "committer A <a@example.com> 1700000000 +0000\n\nbroken\n",
          }
        )
        .output.trim();
      refusedFor(
        hook(remote, `refs/heads/x ${broken} refs/heads/x ${zero}`),
        `cannot diff commit ${broken.slice(0, 12)}`
      );

      // No output ever echoes a private value or the denylist match.
      for (const output of outputs) {
        for (const value of [...literals, deny, FULLWIDTH]) {
          expect(output).not.toContain(value);
        }
      }
    } finally {
      repo.remove();
    }
  });

  test("JS within baseline", async ({ browser, baseURL }, testInfo) => {
    chromiumOnly();
    test.setTimeout(3 * 60_000);
    type Routes = Record<string, number>;
    const FILE = "e2e/fixtures/perf-baseline.json";
    const original = perfBaseline.original as Routes;
    const current = perfBaseline.current as Routes;
    const routes = [...BUDGET_ROUTES].sort();
    // The baseline is well formed: exactly the six routes, each value a
    // positive whole number of bytes (a string or NaN would void the check),
    // and no larger than the cap (a huge value makes the threshold infinite).
    expect(baselineProblems(perfBaseline)).toEqual([]);
    const valid = {
      measured_sha: "a".repeat(40),
      original: Object.fromEntries(routes.map((r) => [r, 1000])),
      current: Object.fromEntries(routes.map((r) => [r, 1000])),
    };
    expect(baselineProblems(valid)).toEqual([]);
    for (const bad of [
      "1000",
      Number.NaN,
      0,
      -5,
      10.5,
      null,
      Number.MAX_VALUE,
      1e308,
      2 ** 53,
      MAX_BUDGET_BYTES + 1,
    ]) {
      const broken = {
        ...valid,
        current: { ...valid.current, "/": bad },
        original: { ...valid.original, "/": bad },
      };
      expect(baselineProblems(broken), String(bad)).not.toEqual([]);
    }
    expect(
      baselineProblems({
        ...valid,
        current: { ...valid.current, "/": MAX_BUDGET_BYTES },
      })
    ).toEqual([]);
    expect(
      baselineProblems({ ...valid, current: { ...valid.current, "/x": 1 } })
    ).not.toEqual([]);

    const forked = mkdtempSync(path.join(os.tmpdir(), "baseline-change-"));
    try {
      const g = (args: string[]) => git(args, { cwd: forked });
      const commitFile = (file: string, text: string) => {
        writeFileSync(path.join(forked, file), text);
        g(["add", "--", file]);
        g(["-c", "commit.gpgsign=false", "commit", "-q", "-m", file]);
      };
      g(["init", "-q", "-b", "main"]);
      g(["config", "user.name", "Throwaway"]);
      g(["config", "user.email", "throwaway@example.com"]);
      commitFile("baseline.json", "1000\n");
      g(["checkout", "-q", "-b", "pr"]);
      commitFile("page.txt", "a PR change\n");
      g(["checkout", "-q", "main"]);
      commitFile("baseline.json", "900\n");
      const pr = {
        base: g(["rev-parse", "main"]).trim(),
        head: g(["rev-parse", "pr"]).trim(),
      };
      // The tips differ in the file, but only the base changed it.
      expect(
        gitOk(["diff", "--quiet", pr.base, pr.head, "--", "baseline.json"], {
          cwd: forked,
        })
      ).toBe(false);
      expect(changedByPr(pr, "baseline.json", { cwd: forked })).toBe(false);
      g(["checkout", "-q", "pr"]);
      commitFile("baseline.json", "950\n");
      const edited = { ...pr, head: g(["rev-parse", "pr"]).trim() };
      expect(changedByPr(edited, "baseline.json", { cwd: forked })).toBe(true);
    } finally {
      rmSync(forked, { recursive: true, force: true });
    }

    // A PR that changes the baseline must have measured it at an ancestor of
    // its head, with no app change since, and may only lower `current`.
    // Push builds in CI have no PR, so only the thresholds apply there.
    // Whether the PR changed the file is judged from where it branched off
    // the base, so a budget lowered only on the base is not blamed on it; the
    // budgets it may not raise are the base's own.
    const range = prRange();
    const base = range?.base ?? "";
    const changed = range !== null && changedByPr(range, FILE);

    // AC13 of PRV-4: the PR that adds PRV-4 to docs/boards/merged.json drops
    // Framer Motion from the header, so it must remeasure. It changes the
    // fixture, and each route's `current` is exactly the bytes measured here.
    const MERGED = "docs/boards/merged.json";
    const mergedAt = (ref: string): string[] =>
      existsAt(ref, MERGED)
        ? (JSON.parse(git(["show", `${ref}:${MERGED}`])) as string[])
        : [];
    const remeasures =
      range !== null &&
      !mergedAt(range.base).includes("PRV-4") &&
      mergedAt(range.head).includes("PRV-4");
    if (remeasures) {
      expect(changed, `the PR adding PRV-4 must remeasure ${FILE}`).toBe(true);
    }
    if (changed) {
      const prHead = process.env.PR_HEAD_SHA?.trim();
      expect(
        prHead,
        `this PR changes ${FILE}; PR_HEAD_SHA must be set`
      ).toBeTruthy();
      const measured = perfBaseline.measured_sha;
      expect(
        gitOk(["merge-base", "--is-ancestor", measured, prHead!]),
        `measured_sha ${measured} is not an ancestor of ${prHead}`
      ).toBe(true);
      const appChanges = git([
        "diff",
        "--name-only",
        measured,
        prHead!,
        "--",
        "app",
        "components",
        "content",
        "lib",
        "public",
      ]).trim();
      expect(appChanges, "app files changed after measured_sha").toBe("");
      if (!existsAt(base, FILE)) {
        // The PR that introduces the baseline starts both from one measurement.
        expect(current).toEqual(original);
      } else {
        const before = JSON.parse(git(["show", `${base}:${FILE}`])) as {
          original: Routes;
          current: Routes;
        };
        expect(original).toEqual(before.original);
        for (const route of routes) {
          expect(
            current[route],
            `current ${route} went up`
          ).toBeLessThanOrEqual(before.current[route]);
        }
      }
    }

    // On every run: each route's first-load JS is within 3% of `current`.
    const over: string[] = [];
    const inexact: string[] = [];
    for (const route of BUDGET_ROUTES) {
      const { status, scripts, bytes } = await firstLoadJs(
        browser,
        baseURL!,
        route
      );
      testInfo.annotations.push({
        type: "first-load JS",
        description: `${route}: ${bytes} bytes in ${scripts} scripts`,
      });
      // A failed navigation or no scripts would measure nothing.
      expect(status, `${route}: status`).toBe(200);
      expect(scripts, `${route}: script responses`).toBeGreaterThan(0);
      expect(bytes, `${route}: bytes`).toBeGreaterThan(0);
      if (bytes > 1.03 * current[route]) {
        over.push(`${route}: ${bytes} bytes > 1.03 x ${current[route]}`);
      }
      if (remeasures && bytes !== current[route]) {
        inexact.push(`${route}: measured ${bytes}, recorded ${current[route]}`);
      }
    }
    expect(over).toEqual([]);
    expect(inexact, "PRV-4 records the exact bytes").toEqual([]);
  });

  test("no layout shift", async ({ browser, baseURL }, testInfo) => {
    chromiumOnly();
    test.setTimeout(3 * 60_000);
    const shifted: string[] = [];
    for (const route of BUDGET_ROUTES) {
      const score = await layoutShift(browser, baseURL!, route);
      testInfo.annotations.push({
        type: "layout shift",
        description: `${route}: ${score}`,
      });
      if (score > 0.01) shifted.push(`${route}: ${score}`);
    }
    expect(shifted).toEqual([]);
  });
});
