import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
});
