/**
 * npm run boards:regen [-- --board <file>...] [--dir <boards dir>]
 *
 * The only way to change docs/boards/ref/ and spec.json. It renders each
 * board with the pinned canvas runtime and fonts, measures every row in
 * every reference state (reduced motion and states held in flight
 * included) and shoots it as a lossy WebP (owner, 2026-11-25), recording
 * each shot's sha256 and the photos each board loads.
 *
 * The runtime (`support.js`) is never committed. Regen reads it from the
 * gitignored cache (BOARDS_CACHE, default .cache/boards/) and, when the
 * cache is empty, fetches it into the cache from BOARDS_RUNTIME_URL, or
 * else from the manifest's runtime.url resolved against
 * BOARDS_RUNTIME_BASE (the canvas origin, which no tracked file names).
 * Either way its sha256 must equal the manifest's before anything renders;
 * every pinned board, font and photo is checked the same way. On any
 * mismatch regen exits non-zero, names the sha256 and writes nothing.
 *
 * With --board, only those boards are re-rendered: every other board's
 * references and spec.json entries stay byte for byte as they were.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  boardContext,
  boardPhotos,
  BOARD_ORIGIN,
  RASTER_ARGS,
  captureState,
  load,
  rowQueries,
  shoot,
  toWebp,
} from "./boards/capture";
import {
  packSpec,
  parseDeviations,
  readJson,
  readSpec,
  refPath,
  sha256,
  type BoardRef,
  type Manifest,
  type Sections,
  type SpecFile,
} from "./boards/model";
import { boardThemes, plannedCaptures } from "./boards/plan";

export class RegenError extends Error {}

/** Every pinned input whose bytes differ from the manifest. */
export function inputProblems(dir: string, manifest: Manifest): string[] {
  const problems: string[] = [];
  const check = (rel: string, want: string) => {
    const file = path.join(dir, rel);
    if (!existsSync(file)) return problems.push(`${rel}: missing`);
    const got = sha256(readFileSync(file));
    if (got !== want)
      problems.push(`${rel}: sha256 ${got}, the manifest pins ${want}`);
  };
  for (const [f, p] of Object.entries(manifest.boards)) check(f, p.sha256);
  for (const [f, p] of Object.entries(manifest.fonts))
    check(`fonts/${f}`, p.sha256);
  for (const [f, p] of Object.entries(manifest.images))
    check(`img/${f}`, p.sha256);
  return problems;
}

/**
 * Where the runtime is fetched from: BOARDS_RUNTIME_URL as given, or the
 * manifest's runtime.url (absolute, or relative to BOARDS_RUNTIME_BASE).
 */
export function runtimeSource(
  manifest: Manifest,
  url: string | undefined,
  base: string | undefined
): string | null {
  if (url) return url;
  const rel = manifest.runtime.url;
  if (!rel) return null;
  if (/^[a-z]+:\/\//i.test(rel)) return rel;
  return base
    ? new URL(rel, base.endsWith("/") ? base : `${base}/`).href
    : null;
}

/** The runtime from the cache, or fetched into it; never unchecked. */
export async function runtimeBytes(
  manifest: Manifest,
  cache: string,
  url: string | undefined,
  base?: string
): Promise<Buffer> {
  const cached = path.join(cache, "support.js");
  const want = manifest.runtime.sha256;
  if (existsSync(cached)) {
    const bytes = readFileSync(cached);
    const got = sha256(bytes);
    if (got !== want)
      throw new RegenError(
        `the cached runtime ${cached} has sha256 ${got}; the manifest pins ${want}`
      );
    return bytes;
  }
  const from = runtimeSource(manifest, url, base);
  if (!from)
    throw new RegenError(
      manifest.runtime.url
        ? `no runtime: set BOARDS_RUNTIME_BASE to the canvas origin that serves ${manifest.runtime.url}, or put the runtime at ${cached} (${manifest.runtime.source})`
        : `no runtime: put the canvas runtime at ${cached} or set BOARDS_RUNTIME_URL (${manifest.runtime.source})`
    );
  const res = await fetch(from);
  if (!res.ok)
    throw new RegenError(`fetching the runtime failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha256(bytes);
  if (got !== want)
    throw new RegenError(
      `the fetched runtime has sha256 ${got}; the manifest pins ${want}`
    );
  mkdirSync(cache, { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
}

interface Options {
  dir: string;
  boards: string[];
  cache: string;
  runtimeUrl?: string;
  runtimeBase?: string;
  log?: (line: string) => void;
}

export async function regen(opts: Options): Promise<void> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const dir = path.resolve(opts.dir);
  const manifest = readJson<Manifest>(path.join(dir, "manifest.json"));
  const sections = readJson<Sections>(path.join(dir, "sections.json"));
  const register = {
    deviations: parseDeviations(
      readFileSync(path.join(dir, "deviations.md"), "utf8")
    ),
    merged: readJson<string[]>(path.join(dir, "merged.json")),
  };
  const specFile = path.join(dir, "spec.json");
  const previous: SpecFile = existsSync(specFile)
    ? readSpec(specFile)
    : { version: 1, boards: {} };

  const problems = inputProblems(dir, manifest);
  if (problems.length) throw new RegenError(problems.join("\n"));
  const unknown = opts.boards.filter((b) => !(b in manifest.boards));
  if (unknown.length) throw new RegenError(`not pinned: ${unknown.join(", ")}`);
  const runtime = await runtimeBytes(
    manifest,
    opts.cache,
    opts.runtimeUrl,
    opts.runtimeBase
  );

  const todo = opts.boards.length
    ? opts.boards
    : Object.keys(manifest.boards).sort();
  const fonts = Object.fromEntries(
    Object.entries(manifest.fonts).map(([f, p]) => [f, p.sha256])
  );
  const files = new Map<string, Buffer>();
  const seen = new Map<string, string>();
  const made: Record<string, BoardRef> = {};

  const browser = await chromium.launch({ args: RASTER_ARGS });
  try {
    for (const board of todo) {
      const pin = manifest.boards[board];
      const photos = new Set<string>();
      const ref: BoardRef = {
        board: pin.sha256,
        runtime: manifest.runtime.sha256,
        fonts,
        images: {},
        width: pin.width,
        captures: {},
      };
      // Rows this board is the undrawn evidence for: measured, never drawn.
      const evidence = sections.rows.filter(
        (r) => r.undrawn?.[pin.width] === board
      );
      for (const bt of boardThemes(sections, board, pin.width)) {
        const queries = rowQueries(
          [...bt.rows, ...evidence.filter((r) => !bt.rows.includes(r))],
          sections.rows,
          "board"
        );
        for (const plan of plannedCaptures(sections, bt, register)) {
          const refused: string[] = [];
          const ctx = await boardContext(
            browser,
            sections,
            dir,
            manifest,
            runtime,
            {
              width: pin.width,
              reducedMotion: plan.rm,
            },
            refused
          );
          try {
            const page = await ctx.newPage();
            const errors: string[] = [];
            page.on("pageerror", (e) => errors.push(e.message));
            await load(page, `${BOARD_ORIGIN}/${board}`, sections.clock);
            const capture = await captureState(
              page,
              sections,
              queries,
              { state: plan.state, theme: bt.theme, toggle: bt.toggle },
              "board",
              { hide: plan.hide, allMotion: plan.rm }
            );
            for (const f of await boardPhotos(page))
              if (f in manifest.images) photos.add(f);
            if (errors.length)
              throw new RegenError(`${board}: ${errors.join("; ")}`);
            if (refused.length)
              throw new RegenError(
                `${board}: requested an unpinned file: ${refused.join(", ")}`
              );
            const stateLabel = plan.key.slice(bt.theme.length + 1);
            for (const [id, row] of Object.entries(capture.rows)) {
              if (!row) continue;
              const png = await shoot(page, row.box, capture.frame);
              const webp = await toWebp(page, png);
              // A shot identical to one already made for this board (another
              // state, or reduced motion) is kept once.
              const digest = sha256(webp);
              const hash = `${board}|${digest}`;
              let rel = seen.get(hash);
              if (!rel) {
                rel = refPath(board, id, stateLabel, pin.width, bt.theme);
                files.set(rel, webp);
                seen.set(hash, rel);
              }
              row.shot = rel;
              row.shotSha = digest;
            }
            ref.captures[plan.key] = capture;
            log(`${board} ${plan.key}`);
          } finally {
            await ctx.close();
          }
        }
      }
      ref.images = Object.fromEntries(
        [...photos].sort().map((f) => [f, manifest.images[f].sha256])
      );
      made[board] = ref;
    }
  } finally {
    await browser.close();
  }

  // Nothing is written until every board has rendered.
  for (const board of todo) {
    rmSync(path.join(dir, "ref", board.replace(/\.dc\.html$/, "")), {
      recursive: true,
      force: true,
    });
  }
  for (const [rel, bytes] of files) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), bytes);
  }
  const boards: SpecFile["boards"] = {};
  for (const board of Object.keys(manifest.boards).sort()) {
    const entry = made[board] ?? previous.boards[board];
    if (entry) boards[board] = entry;
  }
  writeFileSync(specFile, packSpec({ version: 1, boards }));
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dir: "docs/boards",
    boards: [],
    cache: process.env.BOARDS_CACHE || ".cache/boards",
    runtimeUrl: process.env.BOARDS_RUNTIME_URL || undefined,
    runtimeBase: process.env.BOARDS_RUNTIME_BASE || undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--board") opts.boards.push(argv[++i]);
    else if (a === "--dir") opts.dir = argv[++i];
    else throw new RegenError(`unknown argument ${a}`);
  }
  return opts;
}

if (require.main === module) {
  regen(parseArgs(process.argv.slice(2))).then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e instanceof RegenError ? `boards:regen: ${e.message}` : e);
      process.exit(1);
    }
  );
}
