/**
 * npm run boards:regen [-- --board <file>...] [--dir <boards dir>]
 *
 * The only way to change docs/boards/ref/ and spec.json. It renders each
 * board with the pinned canvas runtime and fonts, measures every row in
 * every reference state and shoots it as a lossy WebP (none for reduced
 * motion or a state held in flight: the verifier compares settled states).
 *
 * The runtime (`support.js`) is never committed. Regen reads it from the
 * gitignored cache (BOARDS_CACHE, default .cache/boards/) and, when the
 * cache is empty, fetches it from BOARDS_RUNTIME_URL or the manifest's
 * runtime.url into the cache. Either way its sha256 must equal the
 * manifest's before anything renders; every pinned board, font and photo is
 * checked the same way. On any mismatch regen exits non-zero, names the
 * sha256 and writes nothing.
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
  BOARD_ORIGIN,
  captureState,
  load,
  rowQueries,
  shoot,
  toWebp,
} from "./boards/capture";
import {
  packSpec,
  readJson,
  readSpec,
  refPath,
  sha256,
  type BoardRef,
  type Manifest,
  type Sections,
  type SpecFile,
} from "./boards/model";
import { boardThemes, hiddenFor, plannedCaptures } from "./boards/plan";

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

/** The runtime from the cache, or fetched into it; never unchecked. */
export async function runtimeBytes(
  manifest: Manifest,
  cache: string,
  url: string | undefined
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
  const from = url || manifest.runtime.url;
  if (!from)
    throw new RegenError(
      `no runtime: put the canvas runtime at ${cached} or set BOARDS_RUNTIME_URL (${manifest.runtime.source})`
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
  log?: (line: string) => void;
}

export async function regen(opts: Options): Promise<void> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const dir = path.resolve(opts.dir);
  const manifest = readJson<Manifest>(path.join(dir, "manifest.json"));
  const sections = readJson<Sections>(path.join(dir, "sections.json"));
  const specFile = path.join(dir, "spec.json");
  const previous: SpecFile = existsSync(specFile)
    ? readSpec(specFile)
    : { version: 1, boards: {} };

  const problems = inputProblems(dir, manifest);
  if (problems.length) throw new RegenError(problems.join("\n"));
  const unknown = opts.boards.filter((b) => !(b in manifest.boards));
  if (unknown.length) throw new RegenError(`not pinned: ${unknown.join(", ")}`);
  const runtime = await runtimeBytes(manifest, opts.cache, opts.runtimeUrl);

  const todo = opts.boards.length
    ? opts.boards
    : Object.keys(manifest.boards).sort();
  const fonts = Object.fromEntries(
    Object.entries(manifest.fonts).map(([f, p]) => [f, p.sha256])
  );
  const images = Object.fromEntries(
    Object.entries(manifest.images).map(([f, p]) => [f, p.sha256])
  );
  const files = new Map<string, Buffer>();
  const seen = new Map<string, string>();
  const made: Record<string, BoardRef> = {};

  const browser = await chromium.launch();
  try {
    for (const board of todo) {
      const pin = manifest.boards[board];
      const ref: BoardRef = {
        board: pin.sha256,
        runtime: manifest.runtime.sha256,
        fonts,
        images,
        width: pin.width,
        captures: {},
      };
      for (const bt of boardThemes(sections, board, pin.width)) {
        const queries = rowQueries(bt.rows, sections.rows, "board");
        for (const plan of plannedCaptures(sections, bt)) {
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
              { hide: hiddenFor(bt.rows, plan.pending) }
            );
            if (errors.length)
              throw new RegenError(`${board}: ${errors.join("; ")}`);
            if (refused.length)
              throw new RegenError(
                `${board}: requested an unpinned file: ${refused.join(", ")}`
              );
            const stateLabel = plan.key.slice(bt.theme.length + 1);
            const shots = !plan.rm && !sections.states[plan.state]?.inFlight;
            for (const [id, row] of Object.entries(capture.rows)) {
              if (!row || !shots) continue;
              const png = await shoot(page, row.box);
              const webp = await toWebp(page, png);
              // A shot identical to one already made for this board (another
              // state, or reduced motion) is kept once.
              const hash = `${board}|${sha256(webp)}`;
              let rel = seen.get(hash);
              if (!rel) {
                rel = refPath(board, id, stateLabel, pin.width, bt.theme);
                files.set(rel, webp);
                seen.set(hash, rel);
              }
              row.shot = rel;
            }
            ref.captures[plan.key] = capture;
            log(`${board} ${plan.key}`);
          } finally {
            await ctx.close();
          }
        }
      }
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
