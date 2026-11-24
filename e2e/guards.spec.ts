import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ROOT,
  baseSha,
  existsAt,
  git,
  gitBuffer,
  gitOk,
  headSha,
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
  webpWithChunk,
  withFrameOffset,
  xmpSegment,
} from "./support/dirty-images";
import { checkIco } from "../scripts/image-metadata";
import { throwawayRepo } from "./support/throwaway";
import { collectErrors, stubVercelInsights } from "./support/page";
import marathonCard from "./fixtures/marathon-card.json";
import urlsFixture from "./fixtures/urls.json";
import { SHOT_WIDTHS, shot } from "./support/shot";
import { detectCards } from "./support/cards";
import { BUDGET_ROUTES, firstLoadJs, layoutShift } from "./support/perf";
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

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|heic|tiff?|ico|svg)$/i;

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
/** The content pages: every project and every blog post. */
const CONTENT_URLS = URLS.filter((u) => /^\/(work|blog)\/[^/]+$/.test(u));

/** Only one browser project needs to check server responses and markup. */
function chromiumOnly() {
  test.skip(
    test.info().project.name !== "chromium",
    "server-side check; runs once, in the chromium project"
  );
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
    const base = baseSha();
    if (existsAt(base, "e2e/guards.spec.ts")) return;
    const head = headSha();
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
    const withoutDevOrigins = (source: string) => {
      const lines = source.split("\n");
      let start = lines.findIndex((l) => /^ {2}allowedDevOrigins:/.test(l));
      const end = lines.findIndex((l) => /^ {2}pageExtensions:/.test(l));
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      while (start > 0 && /^ {2}\/\//.test(lines[start - 1])) start--;
      return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
    };
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
    const images = committedTree()
      .map((f) => f.path)
      .filter((f) => IMAGE_EXTENSIONS.test(f));
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

    for (const [width, expected] of Object.entries(marathonCard.widths)) {
      await page.setViewportSize(expected.viewport);
      await page.goto(marathonCard.url);
      const loadedAt = Date.now();
      await expect(cards.first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);

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
      const check = async (when: string) => {
        const found = await measure();
        expect(found, `${width}px ${when}: link cards`).toHaveLength(1);
        expect(found[0].text).toBe(expected.text);
        expect(found[0].href).toBe(expected.href);
        // The box was measured in Chromium, so only Chromium compares it.
        if (testInfo.project.name === "chromium") {
          for (const key of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(found[0].box[key] - expected.box[key]),
              `${width}px ${when}: box ${key}`
            ).toBeLessThanOrEqual(2);
          }
        }
        await expect(facebook, `${width}px ${when}: Facebook`).toHaveCount(0);
      };

      await check("at load");
      expect(errors, `${width}px: console errors`).toEqual([]);
      // Past the old 3 s fallback timeout, the card is still the only one.
      await page.waitForTimeout(Math.max(0, loadedAt + 5000 - Date.now()));
      await check("5 s after load");
    }
    expect(socialRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("every URL resolves", async ({ request }) => {
    chromiumOnly();
    // urls.json is exactly the page URLs of the pre-change tree.
    const at = urlsFixture.sha;
    const files = git(["ls-tree", "-r", "--name-only", at]).split("\n");
    const staticPages = files
      .filter((f) => /^app\/(.*\/)?page\.tsx$/.test(f) && !f.includes("["))
      .map((f) => "/" + f.replace(/^app\/?/, "").replace(/\/?page\.tsx$/, ""));
    const slugs = (dir: string) =>
      files
        .filter((f) => f.startsWith(`content/${dir}/`) && f.endsWith(".mdx"))
        .map((f) => path.basename(f, ".mdx"));
    const expected = [
      ...staticPages,
      ...slugs("projects").map((s) => `/work/${s}`),
      ...slugs("blog").map((s) => `/blog/${s}`),
    ];
    expect(staticPages).toHaveLength(6);
    expect(slugs("projects")).toHaveLength(4);
    expect(slugs("blog")).toHaveLength(22);
    expect(new Set(URLS).size).toBe(URLS.length);
    expect([...URLS].sort()).toEqual(expected.sort());

    // Each answers 200, or a 308 that leads to a 200. The first status is
    // read before any redirect is followed.
    const failures: string[] = [];
    for (const url of URLS) {
      let target = url;
      const statuses: number[] = [];
      for (let hop = 0; hop < 5; hop++) {
        const res = await request.get(target, { maxRedirects: 0 });
        statuses.push(res.status());
        if (res.status() !== 308) break;
        target = new URL(res.headers()["location"], new URL(target, "http://x"))
          .pathname;
      }
      const last = statuses[statuses.length - 1];
      const ok = last === 200 && statuses.slice(0, -1).every((s) => s === 308);
      if (!ok) failures.push(`${url}: ${statuses.join(" -> ")}`);
    }
    expect(failures).toEqual([]);
  });

  test("every content page has one h1", async ({ page }) => {
    chromiumOnly();
    expect(CONTENT_URLS).toHaveLength(26);
    await stubVercelInsights(page);
    const counts: string[] = [];
    for (const url of CONTENT_URLS) {
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

      // A value split by line wrapping, within one commit or across two,
      // and a wrapped value added then removed within one push.
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
          "content/[private].mdx private list entry on line 2 in the file name",
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
      // A list inside the repository is refused: directly (even when git
      // ignores it), through a symlink, or inside the git directory.
      const inRepo = path.join(repo.dir, "private-list.txt");
      writeFileSync(inRepo, `${literals[0]}\n`);
      repo.write(".git/info/exclude", "private-list.txt\n");
      const linked = path.join(root, "linked-list.txt");
      symlinkSync(inRepo, linked);
      const inGitDir = path.join(repo.dir, ".git", "private-list.txt");
      writeFileSync(inGitDir, `${literals[0]}\n`);
      for (const inside of [inRepo, linked, inGitDir]) {
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
        for (const value of [...literals, deny]) {
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
    expect(Object.keys(original).sort()).toEqual(routes);
    expect(Object.keys(current).sort()).toEqual(routes);

    // A PR that changes the baseline must have measured it at an ancestor of
    // its head, with no app change since, and may only lower `current`.
    const base = baseSha();
    const changed = !gitOk(["diff", "--quiet", base, headSha(), "--", FILE]);
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
    for (const route of BUDGET_ROUTES) {
      const bytes = await firstLoadJs(browser, baseURL!, route);
      testInfo.annotations.push({
        type: "first-load JS",
        description: `${route}: ${bytes} bytes`,
      });
      if (bytes > 1.03 * current[route]) {
        over.push(`${route}: ${bytes} bytes > 1.03 x ${current[route]}`);
      }
    }
    expect(over).toEqual([]);
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
