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

const FONT_FILE = /\.(woff2?|ttf|otf)$/i;

/**
 * A site context: same-origin requests only, so images stay local. Each
 * font file the site loads is noted with its sha256 in `fonts`, so its faces
 * can be bound to the pinned files.
 */
export async function siteContext(
  browser: Browser,
  sections: Sections,
  baseURL: string,
  opts: ContextOptions,
  fonts: Map<string, string> = new Map()
): Promise<BrowserContext> {
  const ctx = await newContext(browser, sections, opts, { baseURL });
  const origin = new URL(baseURL).origin;
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && FONT_FILE.test(url.pathname)) {
      const response = await route.fetch();
      const body = await response.body();
      if (response.ok()) fonts.set(url.href, sha256(body));
      return route.fulfill({ response, body });
    }
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

/** The pinned photos a board page shows (`img/<file>`), by file name. */
export async function boardPhotos(page: Page): Promise<string[]> {
  const urls = (await page.evaluate(() =>
    (
      window as unknown as { __fidelity: { photos(): string[] } }
    ).__fidelity.photos()
  )) as string[];
  const prefix = `${BOARD_ORIGIN}/img/`;
  return urls
    .filter((u) => u.startsWith(prefix))
    .map((u) => decodeURIComponent(u.slice(prefix.length)));
}

export interface FontFaceReport {
  family: string;
  weight: string;
  style: string;
  urls: string[];
  local: boolean;
  status: string;
}

/** The page's @font-face rules and load status, and the faces its rows use. */
export const fontsReport = (page: Page, rows: RowQuery[], sections: Sections) =>
  page.evaluate(
    (spec) =>
      (
        window as unknown as {
          __fidelity: { fonts(s: unknown): unknown };
        }
      ).__fidelity.fonts(spec),
    {
      rows,
      text:
        sections.keys.text +
        ", " +
        sections.keys.heading +
        ", " +
        sections.keys.control,
    }
  ) as Promise<{ faces: FontFaceReport[]; used: string[] }>;

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

/**
 * Lets the motions a step started begin, then takes them. A view transition
 * the step started is waited for until it is ready, however long that takes.
 */
async function takeMotion(page: Page, rows: RowQuery[], sections: Sections) {
  await frames(page, 3);
  await page.waitForTimeout(60);
  return page.evaluate(
    async (spec) => {
      const f = (
        window as unknown as {
          __fidelity: {
            transitionReady(): Promise<void>;
            motionTake(s: unknown): unknown;
          };
        }
      ).__fidelity;
      await f.transitionReady();
      return f.motionTake(spec);
    },
    { rows, keys: sections.keys }
  ) as Promise<Motion[]>;
}

type Fid = {
  __fidelity: {
    motionStart(): void;
    holdArm(at: number): void;
    settle(): Promise<void>;
    motionSweep(): void;
    hold(at: number): Promise<[number, number, number, number] | null>;
    hide(e: { selector: string; mode?: string }[]): void;
    measure(spec: unknown): Capture;
  };
};

const fid = (page: Page) => ({
  settle: () =>
    page.evaluate(() => (window as unknown as Fid).__fidelity.settle()),
  hold: (at: number) =>
    page.evaluate((x) => (window as unknown as Fid).__fidelity.hold(x), at),
  motionStart: () =>
    page.evaluate(() => (window as unknown as Fid).__fidelity.motionStart()),
  holdArm: (at: number) =>
    page.evaluate((x) => (window as unknown as Fid).__fidelity.holdArm(x), at),
  hide: (e: { selector: string; mode?: string }[]) =>
    page.evaluate((x) => (window as unknown as Fid).__fidelity.hide(x), e),
});

/** A read of the viewport, then the page's first full-page shot. */
async function fixRendering(page: Page) {
  await page.screenshot({ animations: "allow", caret: "hide" });
  await page.screenshot({
    fullPage: true,
    animations: "allow",
    caret: "hide",
    clip: { x: 0, y: 0, width: 1, height: 1 },
  });
}

/**
 * Runs a state's steps, each one from rest: the motions a step starts are
 * noted, then settled, before the next step. A step that lands while the
 * last one's transition is still moving would start its own from wherever
 * that transition had got to, which depends on how fast the host is (the
 * holly deck's "Next photo" clicks recorded a different start direction
 * run to run).
 */
export async function runStepsAtRest(page: Page, steps: Step[]) {
  for (const [i, step] of steps.entries()) {
    await runSteps(page, [step]);
    if (i === steps.length - 1) break;
    await frames(page, 3);
    await page.waitForTimeout(60);
    await page.evaluate(async () => {
      const f = (
        window as unknown as {
          __fidelity: { transitionReady(): Promise<void>; motionSweep(): void };
        }
      ).__fidelity;
      await f.transitionReady();
      f.motionSweep();
    });
    await fid(page).settle();
  }
}

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
    /** The site reads the board's token names at its own scope. */
    tokenNames?: string[];
    /**
     * Reduced motion: the capture's motion is everything that ran from load
     * on (the load, the theme toggle and the state's steps), not only the
     * state's own.
     */
    allMotion?: boolean;
  } = {}
): Promise<Capture> {
  const loadMotion = await takeMotion(page, rows, sections);
  const everything = [...loadMotion];
  await fid(page).settle();
  const other: Theme = req.theme === "light" ? "dark" : "light";
  if (req.toggle) {
    await runSteps(page, sections.theme[other]);
    await page.waitForTimeout(40);
    everything.push(...(await takeMotion(page, rows, sections)));
    await fid(page).settle();
    await page.waitForTimeout(40);
    everything.push(...(await takeMotion(page, rows, sections)));
  }
  if (opts.hide?.length) {
    await fid(page).hide(opts.hide);
    await frames(page);
  }
  let motion = loadMotion;
  const def = sections.states[req.state];
  if (req.state !== "default") {
    await fid(page).motionStart();
    // An in-flight state's transition is held the moment it is ready, so it
    // cannot finish before hold() below, however slow the host.
    if (def?.inFlight) await fid(page).holdArm(IN_FLIGHT_AT);
    const steps = def?.toggleTheme
      ? sections.theme[req.theme]
      : stepsFor(def, side);
    // An in-flight state holds the transition its steps start: they run as
    // they always have.
    await (def?.inFlight ? runSteps : runStepsAtRest)(page, steps);
    motion = await takeMotion(page, rows, sections);
    everything.push(...motion);
  }
  const viewport = def?.inFlight ? await fid(page).hold(IN_FLIGHT_AT) : null;
  if (!def?.inFlight) {
    await fid(page).settle();
    await page.waitForTimeout(40);
    await fid(page).settle();
  }
  const tokens =
    side === "board"
      ? { scope: sections.tokens.board, names: sections.tokens.names }
      : { scope: sections.tokens.site, read: opts.tokenNames ?? [] };
  const measured = (await page.evaluate(
    (spec) => (window as unknown as Fid).__fidelity.measure(spec),
    { rows, keys: sections.keys, tokens }
  )) as Capture;
  if (opts.allMotion)
    everything.push(...(await takeMotion(page, rows, sections)));
  // The first full-page shot of a settled page fixes how every later shot
  // draws an element whose finished animation still fills, and which way
  // it draws it depends on how soon the shot lands. Straight after a read
  // of the viewport it is always drawn one way, the way reduced motion
  // draws it, so the capture takes that first full-page shot itself.
  if (!def?.inFlight) await fixRendering(page);
  const capture: Capture = {
    tokens: measured.tokens,
    rows: measured.rows,
    motion: opts.allMotion ? sortMotion(everything) : motion,
  };
  if (viewport) {
    // A view transition draws the viewport only: a row outside it is not in
    // the held frame, so it has no in-flight measurement or shot.
    capture.frame = { at: IN_FLIGHT_AT, viewport };
    for (const [id, row] of Object.entries(capture.rows))
      if (row && !inFrame(row.box, viewport)) capture.rows[id] = null;
  }
  return capture;
}

/**
 * Where an in-flight state is held: this fraction of every running
 * animation's active duration (a theme reveal half grown). Recorded on the
 * capture with the frame it held.
 */
export const IN_FLIGHT_AT = 0.5;

type Rect = [number, number, number, number];

/** The part of a box inside a frame, or null when none of it is. */
export function clipToFrame(box: Rect, frame: Rect): Rect | null {
  const x0 = Math.max(box[0], frame[0]);
  const y0 = Math.max(box[1], frame[1]);
  const x1 = Math.min(box[0] + box[2], frame[0] + frame[2]);
  const y1 = Math.min(box[1] + box[3], frame[1] + frame[3]);
  return x1 - x0 >= 1 && y1 - y0 >= 1 ? [x0, y0, x1 - x0, y1 - y0] : null;
}
const inFrame = (box: Rect, frame: Rect) => clipToFrame(box, frame) !== null;

const sortMotion = (m: Motion[]) =>
  [...m].sort((a, b) =>
    `${a.row}|${a.name}|${a.key}|${a.direction}|${a.duration}`.localeCompare(
      `${b.row}|${b.name}|${b.key}|${b.direction}|${b.duration}`
    )
  );

/**
 * Chromium flags for board renders: rasterise on one thread, in software,
 * whole tiles at a time. Without them a region's captures can wobble between
 * several renderings a level or two apart (a scroller or a plate's rounded
 * edge), so the same board would give different reference bytes run to run.
 */
export const RASTER_ARGS = [
  "--disable-gpu-rasterization",
  "--num-raster-threads=1",
  "--disable-partial-raster",
];

/**
 * Picks a shot from repeated captures of one region, the same way whatever
 * order they come in. The first captures of a region can differ from the
 * rest (the compositor re-rasterises after the first full-page capture), so
 * those are dropped: the region is steady once `settle` captures in a row
 * agree, and `window` more are taken after that. Some boards' captures flip
 * between two rasterisations of the same frame (a dither behind a control).
 * The rendering seen most often among the steady captures (or, when they
 * never settle, the last `2 * settle`) is kept, so a rendering that turns up
 * once beside an established one never replaces it; only an even split falls
 * to the lowest sha256, which no starting phase changes. Three renderings
 * fail.
 */
export async function pickShot(
  take: () => Promise<Buffer>,
  settle = 3,
  window = 3,
  limit = 16
): Promise<Buffer> {
  const shots: Buffer[] = [];
  let steady = false;
  while (shots.length < limit && !steady) {
    shots.push(await take());
    const run = shots.slice(-settle);
    steady = run.length === settle && run.every((b) => b.equals(run[0]));
  }
  const kept = steady ? shots.slice(-settle) : shots.slice(-2 * settle);
  if (steady) for (let i = 0; i < window; i++) kept.push(await take());
  const seen = new Map<string, { shot: Buffer; count: number }>();
  for (const shot of kept) {
    const sha = sha256(shot);
    const entry = seen.get(sha) ?? { shot, count: 0 };
    entry.count++;
    seen.set(sha, entry);
  }
  if (seen.size > 2)
    throw new Error(`${seen.size} different renderings of one frame`);
  const [best] = [...seen.entries()].sort(
    ([a, x], [b, y]) => y.count - x.count || (a < b ? -1 : 1)
  );
  return best[1].shot;
}

/**
 * A shot of a page region, as PNG bytes. A held in-flight frame is shot
 * from the viewport as it stands: a full-page shot resizes the viewport,
 * which ends a running view transition, and draws nothing of it outside the
 * viewport. Its region is the part of the box inside the frame.
 */
export async function shoot(
  page: Page,
  box: Rect,
  frame?: Capture["frame"]
): Promise<Buffer> {
  const region = frame ? clipToFrame(box, frame.viewport) : box;
  if (!region)
    throw new Error(`the region at ${box.join(", ")} is out of frame`);
  const [x, y, w, h] = region;
  // Page coordinates, or the viewport's for a held frame.
  const [ox, oy] = frame ? frame.viewport : [0, 0];
  const fx = Math.max(0, Math.floor(x - ox));
  const fy = Math.max(0, Math.floor(y - oy));
  const take = () =>
    page.screenshot({
      fullPage: !frame,
      animations: "allow",
      caret: "hide",
      clip: {
        x: fx,
        y: fy,
        width: Math.max(1, Math.ceil(x - ox + w) - fx),
        height: Math.max(1, Math.ceil(y - oy + h) - fy),
      },
    });
  try {
    return await pickShot(take);
  } catch (e) {
    throw new Error(
      `the region at ${box.join(", ")}: ${e instanceof Error ? e.message : e}`
    );
  }
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
