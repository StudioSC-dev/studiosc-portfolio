/**
 * Pinned rendering for boards and the site alike: Chromium, DPR 1, the
 * sections' viewports, the fixed clock and time zone, pinned fonts, local
 * requests only. A capture loads a page, reaches a state through its
 * accessible controls, records the motion that runs, settles every
 * animation, measures the rows and, for references, shoots each row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import {
  captureKey,
  sha256,
  type Capture,
  type Manifest,
  type Motion,
  type Row,
  type Sections,
  type StateDef,
  type Step,
  type Target,
  type Theme,
  type Width,
} from "./model";

export const INPAGE = path.join(__dirname, "inpage.js");
export const BOARD_ORIGIN = "http://boards.local";

/** What a row needs in the page: its selector and its child rows'. */
export interface RowQuery {
  id: string;
  selector: string;
  exclude: string[];
  named: [string, string][];
}

export function rowQueries(
  rows: Row[],
  all: Row[],
  side: "board" | "site"
): RowQuery[] {
  return rows.map((row) => ({
    id: row.id,
    selector: side === "board" ? row.board : row.site,
    exclude: all
      .filter((r) => r.parent === row.id)
      .map((r) => (side === "board" ? r.board : r.site)),
    named: Object.entries(row.keys ?? {}).map(([name, k]) => [
      name,
      side === "board" ? k.board : k.site,
    ]),
  }));
}

export interface ContextOptions {
  width: Width;
  reducedMotion: boolean;
}

async function newContext(
  browser: Browser,
  sections: Sections,
  opts: ContextOptions,
  extra: Parameters<Browser["newContext"]>[0] = {}
): Promise<BrowserContext> {
  const viewport = sections.viewports[opts.width];
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    timezoneId: sections.timezone,
    locale: "en-GB",
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
    colorScheme: "light",
    serviceWorkers: "block",
    ...extra,
  });
  await ctx.addInitScript({ path: INPAGE });
  return ctx;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
export const contentType = (file: string) =>
  TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/**
 * A board context: the board, its photos and the runtime come from the
 * boards directory and the runtime bytes; Google Fonts is answered with the
 * committed stylesheet and font files; every other request is refused.
 */
export async function boardContext(
  browser: Browser,
  sections: Sections,
  dir: string,
  manifest: Manifest,
  runtime: Buffer,
  opts: ContextOptions,
  refused: string[] = []
): Promise<BrowserContext> {
  const ctx = await newContext(browser, sections, opts);
  const fonts = path.join(dir, "fonts");
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === BOARD_ORIGIN) {
      const rel = decodeURIComponent(url.pathname.slice(1));
      if (rel === "support.js")
        return route.fulfill({ body: runtime, contentType: TYPES[".js"] });
      const allowed =
        rel in manifest.boards ||
        (rel.startsWith("img/") && rel.slice(4) in manifest.images);
      if (allowed)
        return route.fulfill({
          body: readFileSync(path.join(dir, rel)),
          contentType: contentType(rel),
        });
      refused.push(url.href);
      return route.fulfill({ status: 404, body: "" });
    }
    if (url.host === "fonts.googleapis.com")
      return route.fulfill({
        body: readFileSync(path.join(fonts, manifest.fontCss)),
        contentType: TYPES[".css"],
      });
    if (url.host === "fonts.gstatic.com") {
      const name = path.basename(url.pathname);
      if (name in manifest.fonts)
        return route.fulfill({
          body: readFileSync(path.join(fonts, name)),
          contentType: TYPES[".woff2"],
          headers: { "access-control-allow-origin": "*" },
        });
    }
    if (url.protocol === "data:" || url.protocol === "blob:")
      return route.continue();
    refused.push(url.href);
    return route.abort();
  });
  return ctx;
}

/** A site context: same-origin requests only, so images stay local. */
export async function siteContext(
  browser: Browser,
  sections: Sections,
  baseURL: string,
  opts: ContextOptions
): Promise<BrowserContext> {
  const ctx = await newContext(browser, sections, opts, { baseURL });
  const origin = new URL(baseURL).origin;
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === origin ||
      url.protocol === "data:" ||
      url.protocol === "blob:"
    )
      return route.continue();
    return route.abort();
  });
  return ctx;
}

const locate = (page: Page, t: Target) =>
  page
    .getByRole(t.role as Parameters<Page["getByRole"]>[0], {
      name: t.name,
      exact: true,
    })
    .first();

async function frames(page: Page, n = 2) {
  for (let i = 0; i < n; i++)
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => r(null)))
    );
}

export async function runSteps(page: Page, steps: Step[]) {
  for (const step of steps) {
    if (step.mock) {
      const { url, status, body } = step.mock;
      await page.route(url, (route) =>
        route.fulfill({
          status,
          body: body ?? "{}",
          contentType: "application/json",
        })
      );
    }
    if (step.fill) await locate(page, step.fill.target).fill(step.fill.value);
    if (step.click) {
      const target = locate(page, step.click);
      await target.scrollIntoViewIfNeeded({ timeout: 5000 });
      await target.click({ timeout: 5000 });
    }
    if (step.press) await page.keyboard.press(step.press);
  }
}

export const stepsFor = (def: StateDef | undefined, side: "board" | "site") =>
  (side === "board" ? def?.board : def?.site) ?? def?.steps ?? [];

export interface StateRequest {
  /** "default" or a key of sections.states. */
  state: string;
  theme: Theme;
  /** The page starts in the other theme and its toggle is pressed. */
  toggle: boolean;
}

/** A page ready to measure: loaded, fonts in, load motion recorded. */
export async function load(page: Page, url: string, clock: string) {
  await page.clock.setFixedTime(new Date(clock));
  await page.goto(url, { waitUntil: "load" });
  // Rendered: a main landmark, every font and every picture in.
  await page.waitForFunction(
    () =>
      !!document.querySelector("main") &&
      document.fonts.status === "loaded" &&
      [...document.images].every((i) => i.complete),
    undefined,
    { timeout: 15_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  await frames(page, 3);
}

/** Lets the motions a step started begin, then takes them. */
async function takeMotion(page: Page, rows: RowQuery[], sections: Sections) {
  await frames(page, 3);
  await page.waitForTimeout(60);
  return page.evaluate(
    (spec) =>
      (
        window as unknown as {
          __fidelity: { motionTake(s: unknown): unknown };
        }
      ).__fidelity.motionTake(spec),
    { rows, keys: sections.keys }
  ) as Promise<Motion[]>;
}

type Fid = {
  __fidelity: {
    motionStart(): void;
    settle(): Promise<void>;
    holdHalfway(): Promise<void>;
    hide(e: { selector: string; mode?: string }[]): void;
    measure(spec: unknown): Capture;
  };
};

const fid = (page: Page) => ({
  settle: () =>
    page.evaluate(() => (window as unknown as Fid).__fidelity.settle()),
  holdHalfway: () =>
    page.evaluate(() => (window as unknown as Fid).__fidelity.holdHalfway()),
  motionStart: () =>
    page.evaluate(() => (window as unknown as Fid).__fidelity.motionStart()),
  hide: (e: { selector: string; mode?: string }[]) =>
    page.evaluate((x) => (window as unknown as Fid).__fidelity.hide(x), e),
});

/**
 * Reaches one state on a loaded page and measures it. The page is left in
 * that state, so the caller can shoot it.
 */
export async function captureState(
  page: Page,
  sections: Sections,
  rows: RowQuery[],
  req: StateRequest,
  side: "board" | "site",
  opts: {
    hide?: { selector: string; mode?: "hide" | "remove" }[];
    /** The site reads the board's token names. */
    tokenNames?: string[];
  } = {}
): Promise<Capture> {
  const loadMotion = await takeMotion(page, rows, sections);
  await fid(page).settle();
  const other: Theme = req.theme === "light" ? "dark" : "light";
  if (req.toggle) {
    await runSteps(page, sections.theme[other]);
    await page.waitForTimeout(40);
    await fid(page).settle();
    await page.waitForTimeout(40);
    await takeMotion(page, rows, sections);
  }
  if (opts.hide?.length) {
    await fid(page).hide(opts.hide);
    await frames(page);
  }
  let motion = loadMotion;
  const def = sections.states[req.state];
  if (req.state !== "default") {
    await fid(page).motionStart();
    await runSteps(
      page,
      def?.toggleTheme ? sections.theme[req.theme] : stepsFor(def, side)
    );
    motion = await takeMotion(page, rows, sections);
  }
  if (def?.inFlight) await fid(page).holdHalfway();
  else {
    await fid(page).settle();
    await page.waitForTimeout(40);
    await fid(page).settle();
  }
  const measured = (await page.evaluate(
    (spec) => (window as unknown as Fid).__fidelity.measure(spec),
    { rows, keys: sections.keys, tokenNames: opts.tokenNames }
  )) as Capture;
  return { tokens: measured.tokens, rows: measured.rows, motion };
}

/**
 * A shot of a page region, as PNG bytes: taken until two in a row agree, so
 * a late paint (a picture still decoding, a frame still rasterising) never
 * ends up in a reference. Some boards' full-page captures flip between two
 * rasterisations of the same frame (a dither pattern behind a control, a
 * pixel either way); then the one with the lower sha256 is kept, so the
 * choice never depends on which came first.
 */
export async function shoot(
  page: Page,
  box: [number, number, number, number]
): Promise<Buffer> {
  const [x, y, w, h] = box;
  const fx = Math.max(0, Math.floor(x));
  const fy = Math.max(0, Math.floor(y));
  const take = () =>
    page.screenshot({
      fullPage: true,
      animations: "allow",
      caret: "hide",
      clip: {
        x: fx,
        y: fy,
        width: Math.max(1, Math.ceil(x + w) - fx),
        height: Math.max(1, Math.ceil(y + h) - fy),
      },
    });
  const shots = [await take()];
  for (let i = 0; i < 5; i++) {
    const next = await take();
    if (next.equals(shots[shots.length - 1])) return next;
    shots.push(next);
  }
  const distinct = new Map<string, { shot: Buffer; seen: number }>();
  for (const shot of shots) {
    const key = sha256(shot);
    const d = distinct.get(key) ?? { shot, seen: 0 };
    d.seen++;
    distinct.set(key, d);
  }
  if (distinct.size === 2 && [...distinct.values()].every((d) => d.seen >= 2))
    return distinct.get([...distinct.keys()].sort()[0])!.shot;
  throw new Error(`the region at ${box.join(", ")} never stopped changing`);
}

/** Reference shots are lossy: the verifier compares them by eye. */
export const WEBP_QUALITY = 0.85;

/**
 * PNG to an opaque lossy WebP made only of its VP8 chunk: Chromium's encoder
 * wraps the image in VP8X and ICCP chunks, and PRV-1's image guard allows no
 * ICC profile.
 */
export async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const b64 = (await page.evaluate(
    async ([data, quality]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" })
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { alpha: false })!;
      ctx.drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000)
        s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [png.toString("base64"), WEBP_QUALITY] as const
  )) as string;
  return bareWebp(Buffer.from(b64, "base64"));
}

/** The WebP rewritten as RIFF/WEBP and its one image chunk. */
export function bareWebp(webp: Buffer): Buffer {
  if (
    webp.toString("ascii", 0, 4) !== "RIFF" ||
    webp.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("encoder did not return a WebP");
  let at = 12;
  while (at + 8 <= webp.length) {
    const tag = webp.toString("ascii", at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    if (tag === "ALPH")
      throw new Error("encoder returned a WebP with an alpha channel");
    if (tag === "VP8 " || tag === "VP8L") {
      const chunk = webp.subarray(at, at + 8 + size + (size & 1));
      const head = Buffer.alloc(12);
      head.write("RIFF", 0, "ascii");
      head.writeUInt32LE(4 + chunk.length, 4);
      head.write("WEBP", 8, "ascii");
      return Buffer.concat([head, chunk]);
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("encoder returned a WebP with no image chunk");
}

/** A white PNG of the given size: the site side of a pair whose row is missing. */
export async function blankPng(
  page: Page,
  width: number,
  height: number
): Promise<Buffer> {
  const b64 = (await page.evaluate(
    async ([w, h]) => {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const buf = new Uint8Array(
        await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()
      );
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000)
        s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [width, height] as const
  )) as string;
  return Buffer.from(b64, "base64");
}

/** WebP to PNG, for the verifier's pairs. */
export async function webpToPng(page: Page, webp: Buffer): Promise<Buffer> {
  const b64 = (await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/webp" })
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, webp.toString("base64"))) as string;
  return Buffer.from(b64, "base64");
}

/** Pads two PNGs onto canvases of the same size (white). */
export async function padPair(
  page: Page,
  a: Buffer,
  b: Buffer
): Promise<[Buffer, Buffer]> {
  const out = (await page.evaluate(
    async ([x, y]) => {
      const dec = async (data: string) =>
        createImageBitmap(
          new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
            type: "image/png",
          })
        );
      const [p, q] = [await dec(x), await dec(y)];
      const w = Math.max(p.width, q.width);
      const h = Math.max(p.height, q.height);
      const enc = async (bm: ImageBitmap) => {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bm, 0, 0);
        const buf = new Uint8Array(
          await (
            await canvas.convertToBlob({ type: "image/png" })
          ).arrayBuffer()
        );
        let s = "";
        for (let i = 0; i < buf.length; i += 0x8000)
          s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      };
      return [await enc(p), await enc(q)];
    },
    [a.toString("base64"), b.toString("base64")]
  )) as [string, string];
  return [Buffer.from(out[0], "base64"), Buffer.from(out[1], "base64")];
}

export { captureKey };
