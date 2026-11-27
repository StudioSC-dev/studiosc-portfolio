import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";
import loader, { nearestVariant } from "../lib/image-loader";
import { checkSite } from "../scripts/boards/check";
import { describe as describeFailure } from "../scripts/boards/compare";
import type { Sections } from "../scripts/boards/model";
import { rowStates } from "../scripts/boards/plan";
import { checkImage } from "../scripts/image-metadata";
import { writeVariants } from "../scripts/photos/core";
import { detectCards } from "./support/cards";
import { git, prRange, ROOT, type PrRange } from "./support/git";
import { HOME_ROUTE } from "./support/home";
import { stubVercelInsights } from "./support/page";
import { BUDGET_ROUTES, baselineProblems, firstLoadJs } from "./support/perf";

/**
 * PRV-8: the photo pipeline, "The two of us" on the new home and /about, the
 * credit lines' person anchors and the image loader. Boards:
 * range-light-desktop and range-phone (home), pages-about-desktop and
 * pages-about-phone (/about).
 */

const SIZES = {
  1440: { width: 1440, height: 900 },
  390: { width: 390, height: 844 },
} as const;
type Width = keyof typeof SIZES;
const WIDTHS = [1440, 390] as const;

const MANIFEST = "scripts/photos/manifest.json";
const SPEC_FILE = "e2e/people.spec.ts";
const NO_PR = "a CI build without PR_HEAD_SHA (a push) has no PR to judge";

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function chromiumOnly(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium",
    "the people are checked once, in Chromium, at the two board widths"
  );
}

async function open(page: Page, route: string, width: Width) {
  await page.setViewportSize(SIZES[width]);
  await stubVercelInsights(page);
  const response = await page.goto(route);
  return response;
}

interface ManifestEntry {
  source: string;
  variants: { src: string; width: number; height: number }[];
}
const manifest = () =>
  JSON.parse(read(MANIFEST)) as { images: Record<string, ManifestEntry> };

/** The PR this suite was written for, as PRV-1's convention binds it. */
function ownPr(): { range: PrRange } | { skip: string } {
  const range = prRange();
  if (!range) return { skip: NO_PR };
  const has = spawnSync(
    "git",
    ["cat-file", "-e", `${range.base}:${SPEC_FILE}`],
    {
      cwd: ROOT,
    }
  );
  if (has.status === 0)
    return { skip: `${range.base} already holds ${SPEC_FILE}` };
  return { range };
}

// ---------------------------------------------------------------------------
// Builds of a copy of the repo, for the build-time checks.

function linkOrCopyTree(src: string, dest: string): void {
  const linked = spawnSync("cp", ["-al", src, dest], { encoding: "utf8" });
  if (linked.status === 0) return;
  rmSync(dest, { recursive: true, force: true });
  const copied = spawnSync("cp", ["-a", src, dest], { encoding: "utf8" });
  if (copied.status !== 0) throw new Error(`cannot copy ${src}`);
}

/** A copy of the working tree with node_modules linked in, for one build. */
function copyRepo(label: string): string {
  const dest = mkdtempSync(path.join(tmpdir(), `prv8-${label}-`));
  cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      return !/^(node_modules|\.next|\.git|playwright-report|test-results)(\/|$)/.test(
        rel
      );
    },
  });
  linkOrCopyTree(
    path.join(ROOT, "node_modules"),
    path.join(dest, "node_modules")
  );
  return dest;
}

/** The normal production build command, `npm run build`, in `dir`. */
function build(dir: string) {
  const result = spawnSync("npm", ["run", "build"], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? "dummy-key-for-build",
    },
    timeout: 540_000,
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

/** A built page's prerendered HTML. */
const builtHtml = (dir: string, route: string) =>
  readFileSync(path.join(dir, ".next/server/app", `${route}.html`), "utf8");

/** One panel's HTML, from its opening article tag to the next close. */
function panelHtml(html: string, id: string): string {
  const start = html.indexOf(`<article id="${id}"`);
  expect(start, `#${id} in the built HTML`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</article>", start));
}

// ---------------------------------------------------------------------------
// The board's panels: copy and destinations, from range-light-desktop.

const BOARD_PANELS = [
  {
    id: "seth",
    name: "Seth Palileo",
    role: "Lead Software Engineer",
    fact: "10+ years shipping production systems",
    pitch:
      "I build the apps on this page, from the database to the screen you tap. Then I hand them to Christine, which is where they get good.",
    work: [
      [
        "Tally & Trace",
        "/work/tallyandtrace",
        "Built it with React, FastAPI and PostgreSQL.",
      ],
      [
        "Central Command",
        "/work/central-command",
        "Built it with Cloudflare Workers, Hono and React.",
      ],
      [
        "This site",
        "/work/portfolio-site",
        "Built it with Next.js and Tailwind.",
      ],
    ],
    email: ["Email Seth", "mailto:seth@studiosc.dev"],
    linkedIn: "https://www.linkedin.com/in/sethcharlespalileo/",
    gitHub: "https://github.com/smpalileo",
  },
  {
    id: "christine",
    name: "Christine Nacar-Palileo",
    role: "Senior QA Engineer",
    fact: "11+ years building test automation",
    pitch:
      "I test what Seth builds, and I write the checks that keep it working. If something on your site can break, I would rather find it than your users.",
    work: [
      [
        "Tally & Trace",
        "/work/tallyandtrace",
        "Testing it now, including the check that amounts keep one right edge on desktop and phone.",
      ],
      [
        "Central Command",
        "/work/central-command",
        "Testing it now, before it goes live.",
      ],
      [
        "This site",
        "/work/portfolio-site",
        "Keeps its Playwright suite green.",
      ],
    ],
    email: ["Email Christine", "mailto:christine@studiosc.dev"],
    linkedIn:
      "https://www.linkedin.com/in/christine-dianne-nacar-palileo-86249a64/",
    gitHub: "https://github.com/cdtncr",
  },
] as const;

const OPEN_TO = "Open to Full-time · Contract · Remote or relocation";
const HIRE = "Or hire us both for your project or idea";
const ROUTES = [HOME_ROUTE, "/about"] as const;

const people = (page: Page) => page.locator("section#people");

// ===========================================================================

test("both panels", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const route of ROUTES)
    for (const width of WIDTHS) {
      await open(page, route, width);
      const at = `${route} at ${width}`;
      const section = people(page);
      await expect(section.getByRole("heading", { level: 2 })).toHaveText(
        "The two of us"
      );
      for (const panel of BOARD_PANELS) {
        const article = section.locator(`article#${panel.id}`);
        await expect(article, at).toBeVisible();
        await expect(article.getByRole("heading", { level: 3 })).toHaveText(
          panel.name
        );
        const lines = (await article.locator("p").allInnerTexts()).map(norm);
        expect(lines.slice(0, 4), at).toEqual([
          panel.role,
          panel.fact,
          panel.pitch,
          OPEN_TO,
        ]);
        await expect(article.getByRole("heading", { level: 4 })).toHaveText(
          "What I did here"
        );
        const items = article.locator("ul > li");
        await expect(items).toHaveCount(3);
        for (let i = 0; i < 3; i++) {
          const [label, href, note] = panel.work[i];
          await expect(items.nth(i)).toHaveText(`${label} ${note}`);
          await expect(items.nth(i).getByRole("link")).toHaveText(label);
          await expect(items.nth(i).getByRole("link")).toHaveAttribute(
            "href",
            href
          );
        }
        const email = article.getByRole("link", {
          name: panel.email[0],
          exact: true,
        });
        await expect(email).toHaveAttribute("href", panel.email[1]);
        const linkedIn = article.getByRole("link", {
          name: "LinkedIn",
          exact: true,
        });
        await expect(linkedIn).toHaveAttribute("href", panel.linkedIn);
        const gitHub = article.getByRole("link", {
          name: "GitHub",
          exact: true,
        });
        await expect(gitHub).toHaveAttribute("href", panel.gitHub);
      }
      const hire = section.getByRole("link", { name: HIRE, exact: true });
      await expect(hire).toHaveAttribute("href", "/contact");
      await expect(hire).toBeVisible();
    }

  // On the new home, the section directly follows the Range.
  for (const width of WIDTHS) {
    await open(page, HOME_ROUTE, width);
    const follows = await page.evaluate(() => {
      const cabinet = document.getElementById("cabinet")!;
      const section = document.getElementById("people")!;
      const after =
        cabinet.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING;
      const between = [...document.querySelectorAll("main section")].filter(
        (s) =>
          cabinet.compareDocumentPosition(s) &
            Node.DOCUMENT_POSITION_FOLLOWING &&
          s.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING
      ).length;
      const below =
        section.getBoundingClientRect().top >=
        cabinet.getBoundingClientRect().bottom - 1;
      return { after: after !== 0, between, below };
    });
    expect(follows).toEqual({ after: true, between: 0, below: true });
  }

  // The separate About contact call, where drawn (pages-about-desktop only).
  await open(page, "/about", 1440);
  const call = page.locator('[data-board-section="about/contact"]');
  const start = call.getByRole("link", {
    name: "Start a project",
    exact: true,
  });
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute("href", "/contact");
  await open(page, "/about", 390);
  await expect(call).toBeHidden();
});

test("CV hidden until ready", async ({ page, request }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(900_000);
  // As shipped: no CV is ready, so nothing links to /cv/ and no button shows.
  const shipped = read("content/people.ts");
  expect(shipped.match(/ready: false/g)).toHaveLength(2);
  expect(shipped).not.toContain("ready: true");
  for (const route of ROUTES) {
    const html = await (await request.get(route)).text();
    expect(html).not.toContain('href="/cv/');
    expect(html).not.toContain("Download CV");
    for (const width of WIDTHS) {
      await open(page, route, width);
      await expect(page.locator('a[href^="/cv/"]')).toHaveCount(0);
      await expect(page.getByText("Download CV")).toHaveCount(0);
    }
  }

  // Fixtures: Seth's CV marked ready, appended to the shipped content.
  const readySeth = (dir: string) => {
    const file = path.join(dir, "content/people.ts");
    writeFileSync(
      file,
      `${readFileSync(file, "utf8")}\nPEOPLE.find((p) => p.id === "seth")!.cv.ready = true;\n`
    );
  };

  // Ready and its PDF absent: the build stops and names the missing CV.
  const missing = copyRepo("cv-missing");
  try {
    readySeth(missing);
    expect(existsSync(path.join(missing, "public/cv/seth.pdf"))).toBe(false);
    const result = build(missing);
    expect(result.status, result.output.slice(-2000)).not.toBe(0);
    expect(typeof result.status).toBe("number");
    expect(result.output).toContain(
      "Seth Palileo's CV is marked ready, but public/cv/seth.pdf is missing"
    );
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }

  // Ready with its fixture PDF: the build succeeds, Seth's panel links to
  // the configured path, and Christine's (not ready) shows no CV link.
  const present = copyRepo("cv-present");
  try {
    readySeth(present);
    const pdf = "%PDF-1.4\n%fixture\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
    const cvDir = path.join(present, "public/cv");
    mkdirSync(cvDir, { recursive: true });
    writeFileSync(path.join(cvDir, "seth.pdf"), pdf);
    const result = build(present);
    expect(result.status, result.output.slice(-3000)).toBe(0);
    for (const route of ["about", "preview/home"]) {
      const html = builtHtml(present, route);
      const seth = panelHtml(html, "seth");
      const christine = panelHtml(html, "christine");
      expect(seth, route).toContain('href="/cv/seth.pdf"');
      expect(seth, route).toContain("Download CV (PDF)");
      expect(christine, route).not.toContain('href="/cv/');
      expect(christine, route).not.toContain("Download CV");
    }
  } finally {
    rmSync(present, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Images: committed variants and Cloudinary transforms, never /_next/image.

const URLS: string[] = (
  JSON.parse(read("e2e/fixtures/urls.json")) as { urls: string[] }
).urls;

/** Every Cloudinary image the content names, as written. */
function contentCloudinary(): Set<string> {
  const files = git(["ls-files", "content"]).split("\n").filter(Boolean);
  const found = new Set<string>();
  for (const file of files)
    for (const m of read(file).matchAll(
      /https:\/\/res\.cloudinary\.com\/[^\s"')<>]+/g
    ))
      found.add(m[0]);
  return found;
}

const TRANSFORM =
  /^(https:\/\/res\.cloudinary\.com\/dg0t8ipwi\/.*?\/upload\/)f_auto,q_auto,w_(\d+)\/(.+)$/;

/** The source asset a served image URL stands for. */
function assetOf(url: string): string {
  const m = TRANSFORM.exec(url);
  return m ? `${m[1]}${m[3]}` : url;
}

/** The variant a served path is, from the manifest, or undefined. */
function variantOf(pathname: string) {
  for (const entry of Object.values(manifest().images))
    for (const v of entry.variants) if (v.src === pathname) return v;
  return undefined;
}

const SMALLEST = 400;

async function decoded(page: Page, selector: string) {
  const images = page.locator(selector);
  const count = await images.count();
  const out: { src: string; srcset: string; ok: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const img = images.nth(i);
    if (!(await img.isVisible())) continue;
    await img.scrollIntoViewIfNeeded();
    const complete = () => img.evaluate((el: HTMLImageElement) => el.complete);
    await expect.poll(complete, { timeout: 20_000 }).toBe(true);
    const ok = await img.evaluate((el: HTMLImageElement) =>
      el
        .decode()
        .then(() => el.naturalWidth > 0)
        .catch(() => false)
    );
    out.push({
      src: (await img.getAttribute("src")) ?? "",
      srcset: (await img.getAttribute("srcset")) ?? "",
      ok,
    });
  }
  return out;
}

test("sized variants, no optimiser", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(900_000);
  const optimiser: string[] = [];
  const watch = (page: Page) =>
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/_next/image"))
        optimiser.push(`${page.url()} -> ${r.url()}`);
    });

  // The portraits: committed variants with the board's alt text, each
  // request no wider than twice what is drawn, or the smallest variant.
  for (const route of ROUTES)
    for (const width of WIDTHS)
      for (const dpr of [1, 2, 3]) {
        const context = await browser.newContext({
          viewport: SIZES[width],
          deviceScaleFactor: dpr,
        });
        const page = await context.newPage();
        await stubVercelInsights(page);
        watch(page);
        const requested: string[] = [];
        page.on("request", (r) => {
          const p = new URL(r.url()).pathname;
          if (p.startsWith("/img/")) requested.push(p);
        });
        await page.goto(route);
        const at = `${route} at ${width}, DPR ${dpr}`;
        let drawn = Infinity;
        for (const panel of BOARD_PANELS) {
          const img = people(page).locator(`article#${panel.id} img`);
          await expect(img).toHaveCount(1);
          await img.scrollIntoViewIfNeeded();
          const loaded = () =>
            img.evaluate(
              (el: HTMLImageElement) => el.complete && el.naturalWidth > 0
            );
          await expect.poll(loaded).toBe(true);
          await expect(img).toHaveAttribute("alt", panel.name);
          await expect(img).toHaveAttribute("width", /^\d+$/);
          await expect(img).toHaveAttribute("height", /^\d+$/);
          const current = await img.evaluate(
            (el: HTMLImageElement) => new URL(el.currentSrc).pathname
          );
          expect(current, at).toMatch(
            new RegExp(`^/img/${panel.id}-(400|800|1200)\\.webp$`)
          );
          const box = await img.boundingBox();
          drawn = Math.min(drawn, box!.width);
        }
        expect(requested.length, at).toBeGreaterThan(0);
        for (const p of requested) {
          const variant = variantOf(p);
          expect(variant, `${at}: ${p} is a committed variant`).toBeTruthy();
          const fits =
            variant!.width <= 2 * drawn * dpr || variant!.width === SMALLEST;
          expect(fits, `${at}: ${p} for ${drawn}px`).toBe(true);
        }
        await context.close();
      }

  // Every route in urls.json: no optimiser request, and each next/image
  // image in view decodes. Cloudinary images keep their asset.
  const assets = contentCloudinary();
  expect(assets.size).toBeGreaterThan(0);
  let cloudinary = 0;
  for (const route of URLS) {
    const context = await browser.newContext({ viewport: SIZES[1440] });
    const page = await context.newPage();
    await stubVercelInsights(page);
    watch(page);
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await page.waitForLoadState("networkidle");
    for (const image of await decoded(page, "img[data-nimg]")) {
      expect(image.ok, `${route}: ${image.src} decodes`).toBe(true);
      const sources = [
        image.src,
        // Candidates end in a descriptor; Cloudinary URLs hold commas.
        ...[...image.srcset.matchAll(/(\S+)\s+\d+(?:\.\d+)?[wx](?:,|$)/g)].map(
          (m) => m[1]
        ),
      ];
      for (const src of sources) {
        if (src.startsWith("/")) {
          expect(variantOf(src), `${route}: ${src}`).toBeTruthy();
        } else {
          expect(src, route).toMatch(TRANSFORM);
          const kept = assets.has(assetOf(src));
          expect(kept, `${route}: ${src} keeps its asset`).toBe(true);
          cloudinary++;
        }
      }
    }
    await context.close();
  }
  expect(cloudinary).toBeGreaterThan(0);
  expect(optimiser).toEqual([]);
});

test("one frame, a pair", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const route of ROUTES)
    for (const width of WIDTHS) {
      await open(page, route, width);
      const at = `${route} at ${width}`;
      const frame = page.locator("section#people > div:has(> article)");
      await expect(frame, at).toHaveCount(1);
      const shape = await frame.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--ink)";
        document.body.appendChild(probe);
        const ink = getComputedStyle(probe).color;
        probe.remove();
        const cs = getComputedStyle(el);
        const sides = ["Top", "Right", "Bottom", "Left"] as const;
        const kids = [...el.children] as HTMLElement[];
        const box = (e: Element) => {
          const r = e.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            width: r.width,
            height: r.height,
          };
        };
        return {
          border: sides.map((s) =>
            cs.getPropertyValue(`border-${s.toLowerCase()}-width`)
          ),
          colours: sides.map((s) =>
            cs.getPropertyValue(`border-${s.toLowerCase()}-color`)
          ),
          ink,
          radius: cs.borderTopLeftRadius,
          tags: kids.map((k) => k.tagName),
          ruleBackground: getComputedStyle(kids[1]).backgroundColor,
          first: box(kids[0]),
          rule: box(kids[1]),
          second: box(kids[2]),
        };
      });
      expect(shape.border, at).toEqual(["1px", "1px", "1px", "1px"]);
      expect(shape.colours, at).toEqual([
        shape.ink,
        shape.ink,
        shape.ink,
        shape.ink,
      ]);
      expect(shape.radius, at).toBe("14px");
      expect(shape.tags, at).toEqual(["ARTICLE", "DIV", "ARTICLE"]);
      expect(shape.ruleBackground, at).toBe(shape.ink);
      const { first, rule, second } = shape;
      if (width === 1440) {
        // Side by side, split by a 1px ink rule.
        expect(rule.width, at).toBe(1);
        expect(Math.abs(first.top - second.top), at).toBeLessThan(1);
        expect(first.right, at).toBeLessThanOrEqual(rule.left + 0.5);
        expect(rule.right, at).toBeLessThanOrEqual(second.left + 0.5);
      } else {
        // Stacked, with the rule between.
        expect(rule.height, at).toBe(1);
        expect(first.bottom, at).toBeLessThanOrEqual(rule.top + 0.5);
        expect(rule.bottom, at).toBeLessThanOrEqual(second.top + 0.5);
        expect(Math.abs(first.left - second.left), at).toBeLessThan(1);
      }
      // No group photo: the section's only pictures are the two portraits.
      const pictures = people(page).locator("img");
      await expect(pictures).toHaveCount(2);
      const srcs = await pictures.evaluateAll((els) =>
        els.map((e) => (e as HTMLImageElement).currentSrc)
      );
      const group = srcs.filter((s) => s.includes("us-three"));
      expect(group, at).toEqual([]);
      const cards = await detectCards(page, "section#people");
      expect(cards.grids, at).toEqual([]);
    }
});

test("about reuses the pair", async ({ page, request }, testInfo) => {
  chromiumOnly(testInfo);
  const response = await request.get("/about");
  expect(response.status()).toBe(200);
  const DRAWN = {
    1440: ["about/title", "about/people", "about/believe", "about/contact"],
    390: ["about/title", "about/people", "about/believe"],
  };
  for (const width of WIDTHS) {
    await open(page, "/about", width);
    await expect(page).toHaveTitle("About | StudioSC");
    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main [data-board-section]")]
        .filter(
          (el) =>
            el.getClientRects().length > 0 &&
            getComputedStyle(el).visibility !== "hidden"
        )
        .sort(
          (a, b) =>
            a.getBoundingClientRect().top - b.getBoundingClientRect().top
        )
        .map((el) => el.dataset.boardSection)
    );
    expect(order, `/about at ${width}`).toEqual(DRAWN[width]);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("Seth builds. Christine tests.");
    const intro = page.locator('[data-board-section="about/title"] p');
    await expect(intro).toHaveText(
      "At StudioSC, we combine senior-level development with expert QA to deliver software that scales and survives the real world."
    );
    const believe = page.locator('[data-board-section="about/believe"]');
    await expect(believe.getByRole("heading", { level: 2 })).toHaveText(
      "What we believe"
    );
    const beliefs = believe.getByRole("heading", { level: 3 });
    await expect(beliefs).toHaveText([
      "High-Integrity Engineering",
      "Quality Assurance",
      "Continuous Learning",
    ]);
  }

  // The same shared section as the home's.
  for (const width of WIDTHS) {
    await open(page, "/about", width);
    const about = norm(await people(page).innerText());
    await open(page, HOME_ROUTE, width);
    const home = norm(await people(page).innerText());
    expect(about, `the pair at ${width}`).toBe(home);
  }
  const shared = read("components/people/TwoOfUs.tsx");
  expect(shared).toContain('"home/people" | "about/people"');
  expect(read("app/about/page.tsx")).toContain(
    '<TwoOfUs boardSection="about/people" />'
  );
  expect(read("components/home/RangeHome.tsx")).toContain(
    '<TwoOfUs boardSection="home/people" />'
  );

  // PersonSection and SharedInterests are gone, and nothing names them.
  for (const file of [
    "components/about/PersonSection.tsx",
    "components/about/SharedInterests.tsx",
  ])
    expect(existsSync(path.join(ROOT, file)), file).toBe(false);
  const sources = git(["ls-files", "app", "components", "lib", "content"])
    .split("\n")
    .filter(Boolean);
  const naming = sources.filter((f) =>
    /PersonSection|SharedInterests/.test(read(f))
  );
  expect(naming).toEqual([]);
});

test("variants upright and clean", async ({}, testInfo) => {
  chromiumOnly(testInfo);
  // Only variants are committed under public/img/, and PRV-1's checker
  // (AC11) passes on every one.
  const committed = git(["ls-files", "public/img"]).split("\n").filter(Boolean);
  expect(committed.length).toBeGreaterThan(0);
  const strays = committed.filter(
    (f) =>
      !/^public\/img\/[a-z0-9]+(?:-[a-z0-9]+)*-(400|800|1200)\.webp$/.test(f)
  );
  expect(strays).toEqual([]);
  for (const file of committed) {
    const problems = checkImage(file, readFileSync(path.join(ROOT, file)));
    expect(problems, file).toEqual([]);
  }
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const checked = spawnSync(tsx, ["scripts/image-metadata.ts", ...committed], {
    cwd: ROOT,
    encoding: "utf8",
  });
  expect(checked.stderr).toBe("");
  expect(checked.status).toBe(0);

  // The manifest names committed 400, 800 and 1200 WebP variants of both
  // portraits and the group photo, each file its declared size.
  const images = manifest().images;
  expect(Object.keys(images).sort()).toEqual([
    "/img/christine",
    "/img/seth",
    "/img/us-three",
  ]);
  for (const [src, entry] of Object.entries(images)) {
    expect(["original", "stand-in"]).toContain(entry.source);
    expect(entry.variants.map((v) => v.width)).toEqual([400, 800, 1200]);
    for (const v of entry.variants) {
      const file = `public${v.src}`;
      expect(v.src.startsWith(`${src}-`), v.src).toBe(true);
      expect(committed, src).toContain(file);
      const meta = await sharp(path.join(ROOT, file)).metadata();
      expect(meta.format, file).toBe("webp");
      expect([meta.width, meta.height], file).toEqual([v.width, v.height]);
    }
  }

  // A clean fixture, given a rotation tag at test time, comes out upright
  // with no metadata at all.
  const dir = mkdtempSync(path.join(tmpdir(), "prv8-orient-"));
  try {
    const clean = readFileSync(
      path.join(ROOT, "e2e/fixtures/images/clean.jpg")
    );
    const plain = await sharp(clean).metadata();
    expect([plain.width, plain.height]).toEqual([48, 32]);
    expect(plain.orientation).toBeUndefined();
    const tagged = await sharp(clean)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const taggedMeta = await sharp(tagged).metadata();
    expect(taggedMeta.orientation).toBe(6);
    const [variant] = await writeVariants(tagged, "fixture", dir, "/x", [96]);
    expect(variant).toEqual({
      src: "/x/fixture-96.webp",
      width: 96,
      height: 144,
    });
    const out = readFileSync(path.join(dir, "fixture-96.webp"));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([96, 144]);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(checkImage("fixture-96.webp", out)).toEqual([]);
    // Upright: the pixels match the fixture turned a quarter clockwise.
    const raw = (b: Buffer) =>
      sharp(b).resize(24, 36, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const turned = await sharp(clean).rotate(90).toBuffer();
    const [got, want, wrong] = await Promise.all([
      raw(out),
      raw(turned),
      raw(await sharp(clean).rotate(-90).toBuffer()),
    ]);
    const diff = (a: Buffer, b: Buffer) =>
      a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    expect(diff(got, want)).toBeLessThan(12);
    expect(diff(got, wrong)).toBeGreaterThan(diff(got, want));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("credit lines link the people", async ({ page }, testInfo) => {
  chromiumOnly(testInfo);
  for (const width of WIDTHS)
    for (const [name, id, full] of [
      ["Seth", "seth", "Seth Palileo"],
      ["Christine", "christine", "Christine Nacar-Palileo"],
    ] as const) {
      await open(page, HOME_ROUTE, width);
      const credit = page
        .locator('[aria-roledescription="slide"]:visible')
        .locator("p:visible", {
          hasText: "Built by Seth · Tested by Christine",
        });
      await expect(credit).toHaveCount(1);
      await expect(credit).toHaveText("Built by Seth · Tested by Christine");
      const links = credit.getByRole("link");
      await expect(links).toHaveText(["Seth", "Christine"]);
      await expect(links.nth(0)).toHaveAttribute("href", "#seth");
      await expect(links.nth(1)).toHaveAttribute("href", "#christine");
      await expect(page.locator("#seth")).toHaveCount(1);
      await expect(page.locator("#christine")).toHaveCount(1);
      // Following a name lands on that person's visible panel.
      await credit.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      const panel = page.locator(`#${id}`);
      await expect(panel).toBeVisible();
      await expect(panel).toBeInViewport();
      await expect(panel.getByRole("heading", { level: 3 })).toHaveText(full);
    }
});

test("loader selects variants and rejects unsupported sources", async ({}, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(1_200_000);
  // Local: the narrowest committed variant at least as wide as asked, or the
  // widest, straight from the generated manifest.
  for (const [src, entry] of Object.entries(manifest().images)) {
    const [v400, v800, v1200] = entry.variants;
    const cases: [number, string][] = [
      [16, v400.src],
      [400, v400.src],
      [401, v800.src],
      [800, v800.src],
      [801, v1200.src],
      [1200, v1200.src],
      [3840, v1200.src],
    ];
    for (const [width, want] of cases) {
      expect(loader({ src, width }), `${src} at ${width}`).toBe(want);
      expect(nearestVariant(src, width).src).toBe(want);
    }
  }
  expect(() => loader({ src: "/img/nobody", width: 400 })).toThrow(
    /Unsupported image source \/img\/nobody/
  );

  // Cloudinary on the studio's account: the transform right after /upload/.
  const asset =
    "https://res.cloudinary.com/dg0t8ipwi/image/upload/v1771934861/Portfolio_-_Home_2x1_syyo3l.png";
  const sized = loader({ src: asset, width: 640 });
  expect(sized).toBe(
    "https://res.cloudinary.com/dg0t8ipwi/image/upload/f_auto,q_auto,w_640/v1771934861/Portfolio_-_Home_2x1_syyo3l.png"
  );
  expect(assetOf(sized)).toBe(asset);
  for (const bad of [
    "https://images.example.com/dg0t8ipwi/image/upload/v1/a.png",
    "https://res.cloudinary.com/someoneelse/image/upload/v1/a.png",
    "http://res.cloudinary.com/dg0t8ipwi/image/upload/v1/a.png",
    "https://res.cloudinary.com/dg0t8ipwi/image/fetch/v1/a.png",
    "data:image/png;base64,AAAA",
  ])
    expect(() => loader({ src: bad, width: 640 }), bad).toThrow(
      /Unsupported image source/
    );

  // The Next image configuration: the custom loader, and remote images
  // narrowed to the studio's Cloudinary account.
  const config = read("next.config.ts");
  expect(config).toContain('loader: "custom"');
  expect(config).toContain('loaderFile: "./lib/image-loader.ts"');
  const patterns =
    /remotePatterns: \[\s*\{\s*protocol: "https",\s*hostname: "res\.cloudinary\.com",\s*pathname: "\/dg0t8ipwi\/\*\*",\s*\},\s*\]/;
  expect(config).toMatch(patterns);

  // Build fixtures: a content image on another host, or on another
  // Cloudinary account, fails the normal production build.
  const fixtures = [
    ["another host", "https://images.example.com/dg0t8ipwi/"],
    ["another account", "https://res.cloudinary.com/someoneelse/"],
  ] as const;
  for (const [name, replacement] of fixtures) {
    const dir = copyRepo(name.replace(" ", "-"));
    try {
      const file = path.join(dir, "content/projects/central-command.mdx");
      const before = readFileSync(file, "utf8");
      const after = before
        .split("https://res.cloudinary.com/dg0t8ipwi/")
        .join(replacement);
      expect(after, name).not.toBe(before);
      writeFileSync(file, after);
      const result = build(dir);
      expect(typeof result.status, name).toBe("number");
      expect(result.status, `${name}: ${result.output.slice(-2000)}`).not.toBe(
        0
      );
      expect(result.output, name).toContain(
        `Unsupported image source ${replacement}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// The JS baseline, the fidelity rows and the scope.

const BASELINE = "e2e/fixtures/perf-baseline.json";
const SECTIONS = "docs/boards/sections.json";
const MERGED = "docs/boards/merged.json";
const TICKET = "docs/tickets/PRV-8.md";
/** SHA-256 of the audited ticket as committed, without its id line. */
const TICKET_SHA256 =
  "3ac178a75f78c7fff2ea19be169338b242b9a8e9963d8e7cf42d1ed656015ed6";
const PRV8_ROWS = [
  "home/people",
  "about/title",
  "about/people",
  "about/believe",
  "about/contact",
];

interface Baseline {
  measured_sha: string;
  original: Record<string, number>;
  current: Record<string, number>;
}

const showJson = <T>(sha: string, file: string): T =>
  JSON.parse(git(["show", `${sha}:${file}`])) as T;

test("JS baseline records measured bytes", async ({
  browser,
  baseURL,
}, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(300_000);
  const baseline = JSON.parse(read(BASELINE)) as Baseline;
  expect(baselineProblems(baseline)).toEqual([]);
  const measured = baseline.measured_sha;
  const head = git([
    "rev-parse",
    process.env.PR_HEAD_SHA?.trim() || "HEAD",
  ]).trim();
  // Measured at an ancestor of the head, with no application change since.
  const ancestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", measured, head],
    { cwd: ROOT }
  );
  expect(ancestor.status, `${measured} is an ancestor of ${head}`).toBe(0);
  const since = git([
    "diff",
    "--name-only",
    measured,
    head,
    "--",
    "app",
    "components",
    "content",
    "lib",
    "public",
    "next.config.ts",
    "package.json",
    "package-lock.json",
  ]).trim();
  expect(since).toBe("");

  // On PRV-8's own PR: the measurement is the PR's, `original` is the base's
  // and no budget went up.
  const own = ownPr();
  if ("range" in own) {
    const { base } = own.range;
    const inBase = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", measured, base],
      { cwd: ROOT }
    );
    expect(inBase.status, "measured_sha is a commit of this PR").not.toBe(0);
    const before = showJson<Baseline>(base, BASELINE);
    expect(baseline.original).toEqual(before.original);
    for (const route of BUDGET_ROUTES)
      expect(baseline.current[route], route).toBeLessThanOrEqual(
        before.current[route]
      );
  }

  // Each route's `current` is exactly the first-load JS this build measures.
  const measuredNow: Record<string, number> = {};
  for (const route of BUDGET_ROUTES) {
    const { status, bytes } = await firstLoadJs(browser, baseURL!, route);
    expect(status, route).toBe(200);
    measuredNow[route] = bytes;
  }
  testInfo.annotations.push({
    type: "first-load JS",
    description: JSON.stringify(measuredNow),
  });
  expect(measuredNow).toEqual(baseline.current);
});

test("PRV-8 fidelity rows", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(600_000);
  const sections = JSON.parse(read(SECTIONS)) as Sections;
  const mine = sections.rows.filter((r) => r.ticket === "PRV-8");
  expect(mine.map((r) => r.id)).toEqual(PRV8_ROWS);
  for (const row of mine) expect(row.built, row.id).toBe(true);
  expect(JSON.parse(read(MERGED))).toContain("PRV-8");
  // Each row in its first drawn state, at both widths and in both themes;
  // about/contact is drawn only at 1440.
  const wanted: string[] = [];
  for (const row of mine)
    for (const width of ["1440", "390"] as const) {
      if (!row.sources[width]) continue;
      const states = rowStates(sections, row, width);
      expect(states.length, `${row.id} at ${width}`).toBeGreaterThan(0);
      for (const theme of ["light", "dark"])
        wanted.push(`${row.id} ${states[0]} ${width} ${theme}`);
    }
  expect(wanted).toHaveLength(18);
  const states = [...new Set(wanted.map((w) => w.split(" ")[1]))];
  const result = await checkSite({
    dir: path.join(ROOT, "docs/boards"),
    baseURL: String(testInfo.project.use.baseURL),
    browser,
    only: { rows: PRV8_ROWS, states, rm: false },
  });
  for (const comparison of wanted) expect(result.checked).toContain(comparison);
  expect(result.failures.map(describeFailure)).toEqual([]);
});

const SCOPE = [
  "scripts/photos/",
  "scripts/image-variants.ts",
  "lib/image-loader.ts",
  "content/people.ts",
  "components/people/",
  "components/about/PersonSection.tsx",
  "components/about/SharedInterests.tsx",
  "components/range/Plate.tsx",
  "components/home/RangeHome.tsx",
  "app/about/",
  "next.config.ts",
  "scripts/check-cv.ts",
  "package.json",
  "package-lock.json",
  "public/img/",
  BASELINE,
  SECTIONS,
  MERGED,
  SPEC_FILE,
  "e2e/navigation.spec.ts",
  // The ticket itself, without its id line (orchestrator), pinned below.
  TICKET,
];

const outsideScope = (files: string[]) =>
  files.filter(
    (f) => !SCOPE.some((s) => (s.endsWith("/") ? f.startsWith(s) : f === s))
  );

/** next.config.ts without its `images` block. */
const withoutImages = (source: string) =>
  source.replace(/\n {2}images: \{[\s\S]*?\n {2}\},\n/, "\n");

/** Exports `sha` to a temp dir, builds it and serves it on a free port. */
async function serveCommit(
  sha: string
): Promise<{ url: string; stop: () => void }> {
  const dir = mkdtempSync(path.join(tmpdir(), "prv8-base-"));
  const archive = spawnSync(
    "sh",
    ["-c", 'git archive "$SHA" | tar -x -C "$DIR"'],
    {
      cwd: ROOT,
      env: { ...process.env, SHA: sha, DIR: dir },
    }
  );
  if (archive.status !== 0) throw new Error(`cannot export ${sha}`);
  linkOrCopyTree(
    path.join(ROOT, "node_modules"),
    path.join(dir, "node_modules")
  );
  const built = build(dir);
  if (built.status !== 0)
    throw new Error(`base build failed:\n${built.output.slice(-3000)}`);
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port: free } = probe.address() as { port: number };
      probe.close(() => resolve(free));
    });
  });
  const server = spawn(
    path.join(dir, "node_modules/.bin/next"),
    ["start", "-p", String(port)],
    {
      cwd: dir,
      env: {
        ...process.env,
        RESEND_API_KEY: process.env.RESEND_API_KEY ?? "dummy-key-for-build",
      },
      stdio: "ignore",
    }
  );
  const url = `http://localhost:${port}`;
  const until = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(url)).status < 500) break;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error("base server did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url,
    stop: () => {
      server.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

interface View {
  status: number;
  text: string;
  links: string[];
  images: string[];
}

/**
 * What a visitor gets on `route`: the status, the visible text (settled, with
 * drawings left out), every link's destination and every image's asset.
 * `drop` removes the scoped parts first; `only` keeps just those parts.
 */
async function view(
  browser: Browser,
  origin: string,
  route: string,
  width: Width,
  opts: { drop?: string; only?: string; skipLinks?: RegExp } = {}
): Promise<View> {
  const context = await browser.newContext({
    viewport: SIZES[width],
    baseURL: origin,
  });
  const page = await context.newPage();
  await stubVercelInsights(page);
  const response = await page.goto(route);
  await page.waitForLoadState("networkidle");
  const snap = () =>
    page.evaluate(
      ({ drop, only }) => {
        const roots = only
          ? [...document.querySelectorAll<HTMLElement>(only)]
          : [document.body];
        const hidden: HTMLElement[] = drop
          ? [...document.querySelectorAll<HTMLElement>(drop)]
          : [];
        for (const el of hidden) el.dataset.prv8Display = el.style.display;
        for (const el of hidden) el.style.display = "none";
        const svgs = [...document.querySelectorAll<SVGElement>("svg")];
        for (const el of svgs) el.style.display = "none";
        const text = roots.map((r) => r.innerText).join("\n");
        for (const el of svgs) el.style.display = "";
        for (const el of hidden)
          el.style.display = el.dataset.prv8Display ?? "";
        const within = (el: Element) =>
          roots.some((r) => r.contains(el)) &&
          !hidden.some((h) => h.contains(el));
        const links = [
          ...document.querySelectorAll<HTMLAnchorElement>("a[href]"),
        ]
          .filter(within)
          .map((a) => a.href);
        const images = [...document.querySelectorAll<HTMLImageElement>("img")]
          .filter(within)
          .map((i) => i.getAttribute("src") ?? "");
        return { text: text.replace(/\s+/g, " ").trim(), links, images };
      },
      { drop: opts.drop, only: opts.only }
    );
  // Settled: the same text three reads in a row.
  let last = await snap();
  for (let same = 0, i = 0; same < 2 && i < 40; i++) {
    await page.waitForTimeout(250);
    const next = await snap();
    same = next.text === last.text ? same + 1 : 0;
    last = next;
  }
  await context.close();
  const local = (u: string) => {
    const url = new URL(u);
    return url.origin === new URL(origin).origin
      ? `${url.pathname}${url.search}${url.hash}`
      : u;
  };
  // An image is its asset: Next's optimiser URL or the Cloudinary transform
  // both stand for the source they name.
  const asset = (src: string) => {
    const url = new URL(src, origin);
    if (url.pathname === "/_next/image")
      return url.searchParams.get("url") ?? src;
    return assetOf(src);
  };
  return {
    status: response?.status() ?? 0,
    text: last.text,
    links: last.links.map(local).filter((l) => !opts.skipLinks?.test(l)),
    images: last.images.map(asset),
  };
}

test("changes stay within scope", async ({ browser }, testInfo) => {
  chromiumOnly(testInfo);
  test.setTimeout(1_200_000);
  const own = ownPr();
  test.skip(
    "skip" in own,
    `${"skip" in own ? own.skip : ""}: PRV-8's scope is checked on its own PR.`
  );
  const { base, head } = (own as { range: PrRange }).range;
  const files = git(["diff", "--name-only", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean);
  expect(outsideScope(files)).toEqual([]);
  // Control: a file outside the boundary is caught, and so is another ticket.
  const control = outsideScope([
    "components/range/Range.tsx",
    "docs/tickets/PRV-9.md",
    "public/img/x-400.webp",
    TICKET,
  ]);
  expect(control).toEqual([
    "components/range/Range.tsx",
    "docs/tickets/PRV-9.md",
  ]);

  // The ticket: the only change is dropping its "PRV-8" id line.
  const ticketBefore = git(["show", `${base}:${TICKET}`]);
  expect(ticketBefore.startsWith("PRV-8\n")).toBe(true);
  const ticketAfter = git(["show", `${head}:${TICKET}`]);
  expect(ticketAfter).toBe(ticketBefore.slice("PRV-8\n".length));
  const ticketSha = createHash("sha256").update(ticketAfter).digest("hex");
  expect(ticketSha).toBe(TICKET_SHA256);

  // sections.json changes only the PRV-8 rows' built flags, and merged.json
  // gains only PRV-8.
  const before = showJson<Sections>(base, SECTIONS);
  const after = showJson<Sections>(head, SECTIONS);
  const strip = (s: Sections) => ({
    ...s,
    rows: s.rows.map((r) =>
      PRV8_ROWS.includes(r.id) ? { ...r, built: false } : r
    ),
  });
  expect(strip(after)).toEqual(strip(before));
  for (const id of PRV8_ROWS)
    expect(before.rows.find((r) => r.id === id)?.built, id).toBe(false);
  const mergedBefore = showJson<string[]>(base, MERGED);
  expect(showJson<string[]>(head, MERGED)).toEqual([...mergedBefore, "PRV-8"]);

  // package.json: the CV check in the build and sharp as a devDependency.
  const pkgBefore = showJson<Record<string, Record<string, string>>>(
    base,
    "package.json"
  );
  const pkgAfter = showJson<Record<string, Record<string, string>>>(
    head,
    "package.json"
  );
  const { sharp: added, ...devRest } = pkgAfter.devDependencies;
  expect(added).toMatch(/^\^?\d+\.\d+\.\d+$/);
  expect(devRest).toEqual(pkgBefore.devDependencies);
  expect(pkgAfter.dependencies).toEqual(pkgBefore.dependencies);
  expect(pkgAfter.scripts).toEqual({
    ...pkgBefore.scripts,
    build: "tsx scripts/check-cv.ts && next build",
  });
  // next.config.ts: only the image configuration.
  const configBefore = withoutImages(git(["show", `${base}:next.config.ts`]));
  const configAfter = withoutImages(git(["show", `${head}:next.config.ts`]));
  expect(configAfter).toBe(configBefore);
  expect(configAfter).not.toContain("images:");

  // Every existing route, its redirects, navigation and content match the
  // PR base outside the scoped changes; / keeps its content until PRV-11.
  const served = await serveCommit(base);
  try {
    const headURL = String(testInfo.project.use.baseURL);
    const views: [string, Width, Parameters<typeof view>[4]][] = [];
    for (const route of URLS) {
      if (route === "/about") {
        // Rebuilt from the boards: only the chrome is the base's.
        views.push([route, 1440, { only: "header, footer" }]);
        views.push([route, 390, { only: "header, footer" }]);
      } else if (route === HOME_ROUTE) {
        // Gains "The two of us" and the credit lines' person links.
        const opts = {
          drop: "section#people",
          skipLinks: /#(seth|christine)$/,
        };
        views.push([route, 1440, opts]);
        views.push([route, 390, opts]);
      } else {
        views.push([route, 1440, {}]);
      }
    }
    views.push(["/", 390, {}]);
    for (const [route, width, opts] of views) {
      const label = `${route} at ${width}`;
      const [was, now] = [
        await view(browser, served.url, route, width, opts),
        await view(browser, headURL, route, width, opts),
      ];
      expect(now.status, label).toBe(was.status);
      expect(now.text, label).toBe(was.text);
      expect(now.links, label).toEqual(was.links);
      expect(now.images, label).toEqual(was.images);
    }
    // Redirects: each route answers as the base does, without following.
    for (const route of URLS) {
      const [was, now] = await Promise.all([
        fetch(`${served.url}${route}`, { redirect: "manual" }),
        fetch(`${headURL}${route}`, { redirect: "manual" }),
      ]);
      expect(now.status, route).toBe(was.status);
      const location = (r: Response) =>
        (r.headers.get("location") ?? "").replace(
          /^https?:\/\/localhost:\d+/,
          ""
        );
      expect(location(now), route).toBe(location(was));
    }
  } finally {
    served.stop();
  }
});
