import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
} from "@playwright/test";
import { checkSite, pairName, type Only } from "../scripts/boards/check";
import {
  TOLERANCE,
  describe as describeFailure,
  type Failure,
} from "../scripts/boards/compare";
import {
  checkSections,
  isAccepted,
  loadBoards,
  packSpec,
  parseDeviations,
  pinProblems,
  readJson,
  readSpec,
  runtimeCopies,
  sha256,
  stableJson,
  stateName,
  unpackSpec,
  walk,
  WIDTHS,
  type BoardsDir,
  type Capture,
  type Deviation,
  type KeyMeasure,
  type Manifest,
  type Row,
  type RowMeasure,
  type Sections,
  type SpecFile,
  type Theme,
  type Width,
} from "../scripts/boards/model";
import { checkImage, isImageCandidate } from "../scripts/image-metadata";
import {
  BOARD_ORIGIN,
  IN_FLIGHT_AT,
  INPAGE,
  RASTER_ARGS,
  boardContext,
  captureState,
  load,
  pickShot,
  rowQueries,
  shoot,
} from "../scripts/boards/capture";
import { runtimeBytes, runtimeSource } from "../scripts/boards-regen";
import {
  CANVAS,
  RUNTIME,
  startFixtureServer,
  type FixtureServer,
} from "./fixtures/fidelity/server";
import { DRIFTS } from "./fixtures/fidelity/drifts";
import {
  boardThemes,
  hiddenFor,
  laterSelector,
  plannedCaptures,
  rowStates,
  type BoardTheme,
  type Hide,
  type PlannedCapture,
  type Register,
} from "../scripts/boards/plan";
import { scanText, isBinary } from "./support/denylist";
import { exifGpsSegment, jpegWithSegment } from "./support/dirty-images";
import {
  ROOT,
  cleanEnv,
  existsAt,
  git,
  prRange,
  treeFiles,
  type PrRange,
} from "./support/git";
import { throwawayRepo } from "./support/throwaway";

/**
 * PRV-22's harness: the committed boards and references, the regeneration
 * gate, and the fidelity check itself, run against a fixture canvas (three
 * fixture boards and a stand-in runtime) and a fixture site that drifts one
 * thing at a time.
 */
const BOARDS = path.join(ROOT, "docs/boards");
const SPEC_FILE = "e2e/fidelity-harness.spec.ts";

function chromiumOnly() {
  test.skip(
    test.info().project.name !== "chromium",
    "runs once, in the chromium project"
  );
}

const tmp = (prefix: string) => mkdtempSync(path.join(os.tmpdir(), prefix));

/** A copy of a boards directory whose ref/ is linked, not copied. */
function boardsCopy(src: string, prefix: string): string {
  const dir = tmp(prefix);
  cpSync(src, dir, {
    recursive: true,
    filter: (f) => path.relative(src, f) !== "ref",
  });
  symlinkSync(path.join(src, "ref"), path.join(dir, "ref"));
  return dir;
}

const flipByte = (buf: Buffer, at = Math.floor(buf.length / 2)) => {
  const out = Buffer.from(buf);
  out[at] ^= 0x01;
  return out;
};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

/**
 * The environment for a child run: no git, CI, GitHub Actions or Playwright
 * worker variables. A nested Playwright run that sees GitHub Actions captures
 * the PR diff, fetching the base with --depth=1 and making the repo shallow.
 */
function childEnv(extra: Record<string, string | undefined> = {}) {
  const env = cleanEnv();
  for (const key of Object.keys(env))
    if (
      /^(TEST_|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|FIDELITY_|FIXTURE_|UI_VERIFY|BOARDS_|GITHUB_)/.test(
        key
      )
    )
      delete env[key];
  for (const key of ["CI", "PR_HEAD_SHA", "PR_BASE_SHA"]) delete env[key];
  return { ...env, ...extra };
}

/**
 * boards:regen in a child process. It runs asynchronously so this worker's
 * fixture server can answer the runtime fetch meanwhile.
 */
const regen = (dir: string, env: Record<string, string>, args: string[] = []) =>
  new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(
      path.join(ROOT, "node_modules/.bin/tsx"),
      [path.join(ROOT, "scripts/boards-regen.ts"), "--dir", dir, ...args],
      { cwd: ROOT, env: childEnv(env), stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 15 * 60_000);
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stderr });
    });
  });

/** Every file under `dir` with its sha256, links followed. */
const snapshot = (dir: string) =>
  Object.fromEntries(
    walk(dir).map((f) => [f, sha256(readFileSync(path.join(dir, f)))])
  );

/** The nested fidelity run: the spec on the fixture site, in `cwd`. */
async function nestedRun(cwd: string, env: Record<string, string>) {
  const port = await freePort();
  const out = tmp("fidelity-out-");
  const run = spawnSync(
    path.join(cwd, "node_modules/.bin/playwright"),
    [
      "test",
      "--config",
      "e2e/fixtures/fidelity/playwright.config.ts",
      "--workers=1",
    ],
    {
      cwd,
      env: childEnv({
        FIXTURE_PORT: String(port),
        FIXTURE_OUTPUT: out,
        ...env,
      }),
      encoding: "utf8",
      timeout: 20 * 60_000,
    }
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}`, out };
}

const pngSize = (buf: Buffer) => {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

test.describe("fidelity harness", () => {
  test("boards pinned and stale references rejected", () => {
    chromiumOnly();
    const all = readdirSync(BOARDS).sort();
    const boards = all.filter((f) => f.endsWith(".dc.html"));
    expect(boards.filter((f) => f.startsWith("range-"))).toHaveLength(5);
    expect(boards.filter((f) => f.startsWith("pages-"))).toHaveLength(20);
    expect(readdirSync(path.join(BOARDS, "img"))).toHaveLength(12);
    const expected = [
      ...boards,
      "stickies.json",
      "img/",
      "fonts/",
      "ref/",
      "spec.json",
      "manifest.json",
      "sections.json",
      "deviations.md",
      "merged.json",
    ];
    expect(pinProblems(BOARDS, expected)).toEqual([]);
    // Nothing else sits at the top: no other canvas direction, no Main board.
    expect(
      all.filter((f) => !expected.includes(f) && !expected.includes(`${f}/`))
    ).toEqual([]);

    const manifest = readJson<Manifest>(path.join(BOARDS, "manifest.json"));
    const board = "range-phone.dc.html";
    const font = Object.keys(manifest.fonts).find((f) => f.endsWith(".woff2"))!;

    // A changed board byte, or font byte, is named with its sha256.
    for (const rel of [board, `fonts/${font}`]) {
      const dir = boardsCopy(BOARDS, "pins-");
      try {
        const bytes = flipByte(readFileSync(path.join(dir, rel)));
        writeFileSync(path.join(dir, rel), bytes);
        const problems = pinProblems(dir);
        expect(problems.join("\n")).toContain(
          `${rel}: sha256 ${sha256(bytes)} differs`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    // A reference recorded from another board, runtime or font is stale.
    const stale: [
      string,
      (r: ReturnType<typeof readSpec>["boards"][string]) => void,
      string,
    ][] = [
      ["board", (r) => (r.board = "0".repeat(64)), "made from board sha256"],
      [
        "runtime",
        (r) => (r.runtime = "1".repeat(64)),
        "made from runtime sha256",
      ],
      [
        "font",
        (r) => (r.fonts[font] = "2".repeat(64)),
        "made from other font sha256s",
      ],
    ];
    for (const [, mutate, needle] of stale) {
      const dir = boardsCopy(BOARDS, "stale-");
      try {
        const spec = readSpec(path.join(dir, "spec.json"));
        mutate(spec.boards[board]);
        writeFileSync(path.join(dir, "spec.json"), packSpec(spec));
        const problems = pinProblems(dir);
        expect(problems.join("\n")).toContain(
          `spec.json: ${board} references were ${needle}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    // A shot replaced at its own path by another valid WebP is named: each
    // shot's sha256 is recorded with its row.
    {
      const dir = boardsCopy(BOARDS, "shot-");
      try {
        // The copy's ref/ links to the committed one: this case writes a
        // shot, so it gets a ref/ of its own.
        rmSync(path.join(dir, "ref"));
        cpSync(path.join(BOARDS, "ref"), path.join(dir, "ref"), {
          recursive: true,
        });
        const spec = readSpec(path.join(dir, "spec.json"));
        const shots = [
          ...new Set(
            Object.values(spec.boards[board].captures).flatMap((c) =>
              Object.values(c.rows).flatMap((r) => (r?.shot ? [r.shot] : []))
            )
          ),
        ];
        const [victim, other] = shots;
        const bytes = readFileSync(path.join(dir, other));
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        writeFileSync(path.join(dir, victim), bytes);
        expect(pinProblems(dir).join("\n")).toContain(
          `${victim}: sha256 ${sha256(bytes)} differs from the`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      // None of the cases above reached the committed references.
      expect(pinProblems(BOARDS)).toEqual([]);
    }

    // Each board records only the photos it loaded: a board with no photo
    // records none, so a photo it never loads cannot make it stale.
    const spec = readSpec(path.join(BOARDS, "spec.json"));
    expect(
      Object.keys(spec.boards["pages-404-desktop.dc.html"].images)
    ).toEqual([]);
    expect(
      Object.keys(spec.boards["pages-post-life-desktop.dc.html"].images).sort()
    ).toEqual(
      [
        ...new Set(
          readFileSync(
            path.join(BOARDS, "pages-post-life-desktop.dc.html"),
            "utf8"
          ).match(/(?<=img\/)[a-z0-9_-]+\.[a-z]+/g)
        ),
      ].sort()
    );
  });

  test("committed boards pass the PRV-1 guards", () => {
    chromiumOnly();
    test.setTimeout(10 * 60_000);
    const files = walk(BOARDS);
    // Image guard: every photo and every reference shot.
    const images = files.filter((f) =>
      isImageCandidate(f, readFileSync(path.join(BOARDS, f)))
    );
    expect(images.filter((f) => f.startsWith("img/"))).toHaveLength(12);
    expect(images.filter((f) => f.startsWith("ref/")).length).toBeGreaterThan(
      0
    );
    const dirty = images.flatMap((f) =>
      checkImage(f, readFileSync(path.join(BOARDS, f))).map((r) => `${f}: ${r}`)
    );
    expect(dirty).toEqual([]);

    // Docs denylist, under the docs rules.
    const hits = files.flatMap((f) => {
      const content = readFileSync(path.join(BOARDS, f));
      if (isBinary(content)) return [];
      return scanText(`docs/boards/${f}`, content.toString("utf8")).map(
        (h) => `docs/boards/${f}:${h.line}: ${h.rule}`
      );
    });
    expect(hits).toEqual([]);

    // Pre-push: the boards pushed through PRV-1's hook with a fixture list.
    const repo = throwawayRepo(
      [".husky/pre-push", "scripts/privacy-scan.ts", "e2e/support/denylist.ts"],
      "boards-push-"
    );
    try {
      const root = path.dirname(repo.dir);
      const list = path.join(root, "private-list.txt");
      writeFileSync(
        list,
        "# fixture private list\nquokka-harbour-17\nZephyrine Analytics\n"
      );
      for (const f of files)
        repo.write(`docs/boards/${f}`, readFileSync(path.join(BOARDS, f)));
      repo.git(["add", "--", "docs/boards"]);
      repo.git(["commit", "-q", "-m", "add the boards"]);
      const remote = path.join(root, "remote.git");
      repo.git(["init", "-q", "--bare", remote]);
      repo.git(["remote", "add", "origin", remote]);
      const push = repo.run("git", ["push", "origin", "main"], {
        env: { PREFLIGHT_PRIVATE_LIST: list },
      });
      expect(push.status, push.output).toBe(0);
      expect(push.output).not.toContain("push refused");
    } finally {
      repo.remove();
    }
  });

  test("exports stay byte-exact, photos still guarded", () => {
    chromiumOnly();
    test.setTimeout(5 * 60_000);
    const repo = throwawayRepo(
      [
        ".husky/pre-commit",
        ".lintstagedrc.json",
        ".prettierrc",
        ".prettierignore",
        "scripts/image-metadata.ts",
        "scripts/boards-staged.ts",
        "e2e/support/ico.ts",
      ],
      "boards-commit-"
    );
    try {
      const exact = [
        "docs/boards/range-phone.dc.html",
        "docs/boards/pages-contact-desktop.dc.html",
        "docs/boards/sections.json",
        "docs/boards/deviations.md",
        "docs/boards/stickies.json",
        "docs/boards/fonts/google.css",
        "docs/boards/img/holly-chair.jpg",
        "e2e/fixtures/fidelity/canvas/fx-phone.dc.html",
        "e2e/fixtures/fidelity/canvas/sections.json",
      ];
      const before = Object.fromEntries(
        exact.map((f) => [f, sha256(readFileSync(path.join(ROOT, f)))])
      );
      for (const f of exact) repo.write(f, readFileSync(path.join(ROOT, f)));
      // A loose file outside the exact trees shows the formatter does run.
      repo.write("notes/loose.json", '{"a":1}');
      repo.git(["add", "--", ...exact, "notes/loose.json"]);
      const commit = repo.run("git", ["commit", "-m", "add the boards"]);
      expect(commit.status, commit.output).toBe(0);
      for (const f of exact) {
        expect(sha256(readFileSync(path.join(repo.dir, f))), f).toBe(before[f]);
        const committed = repo.git(["rev-parse", `HEAD:${f}`]).trim();
        const blob = repo.git(["hash-object", path.join(ROOT, f)]).trim();
        expect(committed, `${f} as committed`).toBe(blob);
      }
      expect(
        readFileSync(path.join(repo.dir, "notes/loose.json"), "utf8")
      ).toBe('{ "a": 1 }\n');

      // A dirty copy of a board photo is still blocked by the image entry.
      const photo = readFileSync(path.join(BOARDS, "img/holly-chair.jpg"));
      repo.write(
        "docs/boards/img/holly-chair-copy.jpg",
        jpegWithSegment(photo, exifGpsSegment())
      );
      repo.git(["add", "--", "docs/boards/img/holly-chair-copy.jpg"]);
      const blocked = repo.run("git", ["commit", "-m", "add a dirty photo"]);
      expect(blocked.status).not.toBe(0);
      expect(blocked.output).toContain("docs/boards/img/holly-chair-copy.jpg");
      expect(blocked.output).toContain("APP1 segment (Exif)");
      expect(repo.git(["rev-list", "--count", "HEAD"]).trim()).toBe("2");
    } finally {
      repo.remove();
    }
  });

  test("runtime never committed", () => {
    chromiumOnly();
    expect(
      readFileSync(path.join(ROOT, ".gitignore"), "utf8").split("\n")
    ).toContain(".cache/");
    const ignored = spawnSync(
      "git",
      ["check-ignore", "-q", ".cache/boards/support.js"],
      {
        cwd: ROOT,
        env: cleanEnv(),
      }
    );
    expect(ignored.status, ".cache/boards/support.js is ignored").toBe(0);
    // Lint never reads the cached runtime either.
    const linted = spawnSync(
      process.execPath,
      [
        "-e",
        'new (require("eslint").ESLint)().isPathIgnored(".cache/boards/support.js").then((y) => process.exit(y ? 0 : 1))',
      ],
      { cwd: ROOT, env: cleanEnv() }
    );
    expect(linted.status, "eslint ignores .cache/").toBe(0);
    const manifest = readJson<Manifest>(path.join(BOARDS, "manifest.json"));
    expect(manifest.runtime.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(runtimeCopies(treeFiles("HEAD"), manifest.runtime.sha256)).toEqual(
      []
    );

    // A fixture tree that commits its pinned runtime fails the same check.
    const repo = throwawayRepo([], "runtime-");
    try {
      repo.write(
        "docs/boards/manifest.json",
        readFileSync(path.join(CANVAS, "manifest.json"))
      );
      repo.write("public/vendor/support.js", readFileSync(RUNTIME));
      repo.git(["add", "--", "docs", "public"]);
      repo.git(["commit", "-q", "-m", "commit the runtime"]);
      const fixtureSha = readJson<Manifest>(
        path.join(repo.dir, "docs/boards/manifest.json")
      ).runtime.sha256;
      const tracked = repo
        .git(["ls-files", "-z"])
        .split("\0")
        .filter(Boolean)
        .map((f) => ({
          path: f,
          content: readFileSync(path.join(repo.dir, f)),
        }));
      expect(runtimeCopies(tracked, fixtureSha)).toEqual([
        "public/vendor/support.js",
      ]);
    } finally {
      repo.remove();
    }
  });

  test("nested runs keep the repo a full clone", async () => {
    chromiumOnly();
    test.setTimeout(10 * 60_000);
    // A full-history copy whose origin can serve its own HEAD. Under GitHub
    // Actions, Playwright's PR diff capture would fetch that base with
    // --depth=1 and leave the copy shallow, as it did to the CI clone.
    const root = tmp("fidelity-actions-");
    const clone = path.join(root, "repo");
    const event = path.join(root, "event.json");
    const actions: Record<string, string> = {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: event,
    };
    const saved = Object.keys(actions).map((k) => [k, process.env[k]] as const);
    try {
      git(["clone", "-q", "--shared", ROOT, clone]);
      symlinkSync(
        path.join(ROOT, "node_modules"),
        path.join(clone, "node_modules")
      );
      const base = git(["rev-parse", "HEAD"], { cwd: clone }).trim();
      writeFileSync(
        event,
        JSON.stringify({
          pull_request: { title: "fixture", number: 1, base: { sha: base } },
        })
      );
      const shallow = () =>
        git(["rev-parse", "--is-shallow-repository"], { cwd: clone }).trim();
      expect(shallow()).toBe("false");
      // This worker runs as if under Actions; the nested run inherits it.
      Object.assign(process.env, actions);
      const one: Only = {
        rows: ["fx/opener"],
        widths: ["1440"],
        themes: ["light"],
        states: ["default"],
        rm: false,
      };
      const run = await nestedRun(clone, {
        FIDELITY_ONLY: JSON.stringify(one),
      });
      expect(run.status, run.output).toBe(0);
      rmSync(run.out, { recursive: true, force: true });
      expect(shallow(), "the nested run made the repo shallow").toBe("false");
    } finally {
      for (const [k, v] of saved)
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runs from an empty cache, regenerates exactly, refuses a mismatched runtime", async () => {
    chromiumOnly();
    test.setTimeout(40 * 60_000);

    // A fresh copy of the committed tree: no .cache/, committed refs only.
    const clone = tmp("fidelity-clone-");
    try {
      const archive = spawnSync("git", ["archive", "--format=tar", "HEAD"], {
        cwd: ROOT,
        env: cleanEnv(),
        maxBuffer: 1 << 30,
      });
      expect(archive.status).toBe(0);
      const untar = spawnSync("tar", ["-x", "-C", clone], {
        input: archive.stdout,
      });
      expect(untar.status).toBe(0);
      symlinkSync(
        path.join(ROOT, "node_modules"),
        path.join(clone, "node_modules")
      );
      expect(existsSync(path.join(clone, ".cache"))).toBe(false);
      const run = await nestedRun(clone, {});
      expect(run.status, run.output).toBe(0);
      expect(run.output).toMatch(/1 passed/);
      expect(existsSync(path.join(clone, ".cache"))).toBe(false);
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }

    // Regen against the fixture canvas, its runtime served locally.
    const server = await startFixtureServer();
    const dir = tmp("fidelity-regen-");
    const work = path.join(dir, "canvas");
    try {
      cpSync(CANVAS, work, {
        recursive: true,
        filter: (f) => !["ref", "spec.json"].includes(path.relative(CANVAS, f)),
      });
      const cache = path.join(dir, "cache");
      // The manifest's relative runtime.url, resolved against the canvas
      // origin: the path production takes, with no URL override.
      const env = { BOARDS_CACHE: cache, BOARDS_RUNTIME_BASE: server.url };
      expect(existsSync(cache)).toBe(false);
      const first = await regen(work, env);
      expect(first.status, first.stderr).toBe(0);
      const pinned = readJson<Manifest>(path.join(CANVAS, "manifest.json"))
        .runtime.sha256;
      expect(sha256(readFileSync(path.join(cache, "support.js")))).toBe(pinned);
      // Byte for byte: every reference shot and spec.json.
      const committed = snapshot(CANVAS);
      expect(snapshot(work)).toEqual(committed);

      // One changed board: only its references move.
      const changed = "fx-phone.dc.html";
      const boardFile = path.join(work, changed);
      writeFileSync(
        boardFile,
        readFileSync(boardFile, "utf8").replace(
          "#gallery figure { margin-top: 16px;",
          "#gallery figure { margin-top: 24px;"
        )
      );
      const manifest = readJson<Manifest>(path.join(work, "manifest.json"));
      const edited = sha256(readFileSync(boardFile));
      expect(edited, "the board edit applied").not.toBe(
        manifest.boards[changed].sha256
      );
      manifest.boards[changed].sha256 = edited;
      writeFileSync(
        path.join(work, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      const before = snapshot(work);
      const specBefore = readSpec(path.join(work, "spec.json"));
      const second = await regen(work, env, ["--board", changed]);
      expect(second.status, second.stderr).toBe(0);
      const after = snapshot(work);
      const specAfter = readSpec(path.join(work, "spec.json"));
      for (const f of Object.keys({ ...before, ...after })) {
        if (f.startsWith("ref/fx-phone/") || f === "spec.json") continue;
        expect(after[f], f).toBe(before[f]);
      }
      expect(
        Object.keys(after).some(
          (f) => f.startsWith("ref/fx-phone/") && after[f] !== before[f]
        )
      ).toBe(true);
      for (const board of Object.keys(specBefore.boards)) {
        if (board === changed) continue;
        expect(JSON.stringify(specAfter.boards[board]), board).toBe(
          JSON.stringify(specBefore.boards[board])
        );
      }
      expect(specAfter.boards[changed].board).toBe(
        manifest.boards[changed].sha256
      );
      expect(JSON.stringify(specAfter.boards[changed])).not.toBe(
        JSON.stringify(specBefore.boards[changed])
      );

      // One changed photo that only the phone board loads: regenerating that
      // board leaves every other board's entries and shots byte-identical,
      // and the tree is clean (the desktop boards never loaded it).
      const photo = path.join(work, "img", "four.webp");
      const swapped = readFileSync(path.join(CANVAS, "../site/alt.webp"));
      expect(sha256(swapped)).not.toBe(sha256(readFileSync(photo)));
      writeFileSync(photo, swapped);
      const m2 = readJson<Manifest>(path.join(work, "manifest.json"));
      m2.images["four.webp"].sha256 = sha256(swapped);
      writeFileSync(
        path.join(work, "manifest.json"),
        `${JSON.stringify(m2, null, 2)}\n`
      );
      const spec2 = readSpec(path.join(work, "spec.json"));
      expect(Object.keys(spec2.boards[changed].images)).toContain("four.webp");
      expect(
        Object.keys(spec2.boards["fx-desktop.dc.html"].images)
      ).not.toContain("four.webp");
      const before2 = snapshot(work);
      const third = await regen(work, env, ["--board", changed]);
      expect(third.status, third.stderr).toBe(0);
      const after2 = snapshot(work);
      const spec3 = readSpec(path.join(work, "spec.json"));
      for (const f of Object.keys({ ...before2, ...after2 })) {
        if (f.startsWith("ref/fx-phone/") || f === "spec.json") continue;
        if (f === "img/four.webp" || f === "manifest.json") continue;
        expect(after2[f], f).toBe(before2[f]);
      }
      for (const board of Object.keys(spec2.boards))
        if (board !== changed)
          expect(JSON.stringify(spec3.boards[board]), board).toBe(
            JSON.stringify(spec2.boards[board])
          );
      expect(spec3.boards[changed].images["four.webp"]).toBe(sha256(swapped));
      expect(pinProblems(work)).toEqual([]);

      // A fetched runtime one byte off: non-zero, the sha256 named, nothing written.
      const bad = flipByte(readFileSync(RUNTIME));
      server.setRuntime(bad);
      const emptyCache = path.join(dir, "cache-2");
      const held = snapshot(work);
      const fetched = await regen(work, { ...env, BOARDS_CACHE: emptyCache });
      expect(fetched.status).not.toBe(0);
      expect(fetched.stderr).toContain(sha256(bad));
      expect(fetched.stderr).toContain(pinned);
      expect(snapshot(work)).toEqual(held);
      expect(existsSync(path.join(emptyCache, "support.js"))).toBe(false);

      // A cached runtime one byte off: the same.
      mkdirSync(path.join(dir, "cache-3"));
      writeFileSync(path.join(dir, "cache-3", "support.js"), bad);
      const cached = await regen(work, {
        ...env,
        BOARDS_CACHE: path.join(dir, "cache-3"),
      });
      expect(cached.status).not.toBe(0);
      expect(cached.stderr).toContain(sha256(bad));
      expect(snapshot(work)).toEqual(held);

      // Production names its runtime by path only: with an empty cache and
      // no canvas origin, regen says which variable to set.
      const prod = readJson<Manifest>(path.join(BOARDS, "manifest.json"));
      expect(prod.runtime.url).toMatch(/^[\w./-]+$/);
      expect(runtimeSource(prod, undefined, undefined)).toBeNull();
      expect(runtimeSource(prod, undefined, "https://canvas.invalid/x")).toBe(
        `https://canvas.invalid/x/${prod.runtime.url}`
      );
      await expect(
        runtimeBytes(prod, path.join(dir, "cache-4"), undefined, undefined)
      ).rejects.toThrow(/set BOARDS_RUNTIME_BASE/);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }

    // The shot picked from repeated captures is the same whatever order
    // they come in: warm-up captures before the region settles are dropped,
    // a rendering that turns up now and then beside an established one never
    // replaces it, and a region split evenly between two renderings gives
    // the lower sha256 in either phase. A third rendering fails.
    const a = Buffer.from("rendering a");
    const b = Buffer.from("rendering b");
    const c = Buffer.from("rendering c");
    const lowest = sha256(a) < sha256(b) ? a : b;
    const highest = lowest === a ? b : a;
    /** The sequence, then its last element for good, or cycled. */
    const feed = (seq: Buffer[], cycle = false) => {
      let i = 0;
      return async () =>
        cycle ? seq[i++ % seq.length] : seq[Math.min(i++, seq.length - 1)];
    };
    const pick = async (seq: Buffer[], cycle = false) =>
      (await pickShot(feed(seq, cycle))).toString();
    // Settling on one rendering after a warm-up: that one, either way round.
    expect(await pick([highest, highest, lowest])).toBe(lowest.toString());
    expect(await pick([lowest, lowest, highest])).toBe(highest.toString());
    expect(await pick([a, b, a, a, a])).toBe(a.toString());
    // Flipping evenly for good, in either phase: the lowest.
    for (const seq of [
      [highest, lowest],
      [lowest, highest],
    ])
      expect(await pick(seq, true), seq.map(String).join()).toBe(
        lowest.toString()
      );
    // An occasional other rendering, in every starting phase of the cycle,
    // even when it has the lower sha256: the established one.
    for (const [usual, odd, run] of [
      [highest, lowest, 6],
      [highest, lowest, 3],
      [lowest, highest, 6],
    ] as const) {
      const cycle = [...Array<Buffer>(run).fill(usual), odd];
      for (let phase = 0; phase < cycle.length; phase++) {
        const seq = [...cycle.slice(phase), ...cycle.slice(0, phase)];
        expect(
          await pick(seq, true),
          `${run} of ${usual} then ${odd}, from ${phase}`
        ).toBe(usual.toString());
      }
    }
    await expect(pickShot(feed([a, a, a, b, c]))).rejects.toThrow(
      "3 different renderings"
    );
    await expect(pickShot(feed([a, b, c], true))).rejects.toThrow(
      "3 different renderings"
    );
  });

  /** A small page with the measurement script, as boards and the site get it. */
  async function measuredPage(browser: Browser) {
    const page = await browser.newPage();
    await page.addInitScript({ path: INPAGE });
    // A navigation, so the init script runs (setContent would not).
    await page.goto(
      `data:text/html,${encodeURIComponent(
        '<main><section id="r"><h1>Heading</h1><p>Text</p></section></main>'
      )}`
    );
    return page;
  }
  type Fid = {
    __fidelity: {
      motionStart(): void;
      motionTake(s: unknown): { name: string; direction: string }[];
      hide(e: { selector: string; mode?: string }[]): void;
    };
  };

  test("records motion as it plays", async ({ browser }) => {
    chromiumOnly();
    const page = await measuredPage(browser);
    try {
      const motion = await page.evaluate(async () => {
        const f = (window as unknown as Fid).__fidelity;
        f.motionStart();
        const h1 = document.querySelector("h1")!;
        // Turned round straight after animate(): it plays backwards.
        h1.animate(
          [
            { transform: "translateX(24px)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 240, id: "turned" }
        ).reverse();
        // Built by hand and started with play(), done within a frame.
        const short = new Animation(
          new KeyframeEffect(
            document.querySelector("p"),
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 1 }
          ),
          document.timeline
        );
        short.id = "short";
        short.play();
        await new Promise((r) => setTimeout(r, 100));
        return f.motionTake({
          rows: [{ id: "r", selector: "#r", exclude: [], named: [] }],
          keys: { heading: "h1", text: "p" },
        });
      });
      expect(motion.map((m) => `${m.name} ${m.direction}`).sort()).toEqual([
        "animate:short fade-in",
        "animate:turned exit x+ fade-out",
      ]);
    } finally {
      await page.close();
    }
  });

  test("hides what a later ticket adds, mounted before or after", async ({
    browser,
  }) => {
    chromiumOnly();
    const page = await measuredPage(browser);
    try {
      // A hide holds for elements mounted after it, as a picked plate's
      // interior is: removed, or hidden in place.
      const styles = await page.evaluate(() => {
        const f = (window as unknown as Fid).__fidelity;
        f.hide([
          { selector: ".inside", mode: "remove" },
          { selector: ".drawing", mode: "hide" },
        ]);
        const add = (cls: string) => {
          const el = document.createElement("div");
          el.className = cls;
          el.textContent = cls;
          document.querySelector("#r")!.append(el);
          return getComputedStyle(el);
        };
        const inside = add("inside");
        const drawing = add("drawing");
        return [inside.display, drawing.visibility];
      });
      expect(styles).toEqual(["none", "hidden"]);
    } finally {
      await page.close();
    }
  });

  /** The share of a shot's pixels that are its commonest colour. */
  async function flatness(page: Page, image: Buffer, type: string) {
    return page.evaluate(
      async ([data, mime]) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const bm = await createImageBitmap(new Blob([bytes], { type: mime }));
        const canvas = new OffscreenCanvas(bm.width, bm.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bm, 0, 0);
        const px = ctx.getImageData(0, 0, bm.width, bm.height).data;
        const count = new Map<number, number>();
        for (let i = 0; i < px.length; i += 4) {
          const k =
            ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
          count.set(k, (count.get(k) ?? 0) + 1);
        }
        return Math.max(...count.values()) / (px.length / 4);
      },
      [image.toString("base64"), type] as const
    );
  }
  /** One flat colour: what a shot outside a view transition's frame shows. */
  const FLAT = 0.995;

  test("holds an in-flight state at one recorded frame", async () => {
    chromiumOnly();
    test.setTimeout(120_000);
    const fx = loadBoards(CANVAS);
    const manifest = readJson<Manifest>(path.join(CANVAS, "manifest.json"));
    const board = "fx-desktop.dc.html";
    const bt = boardThemes(fx.sections, board, "1440").find(
      (t) => t.theme === "light"
    )!;
    const queries = rowQueries(bt.rows, fx.sections.rows, "board");
    const browser = await chromium.launch({ args: RASTER_ARGS });
    try {
      const scratch = await browser.newPage();
      const run = async (state: string) => {
        const ctx = await boardContext(
          browser,
          fx.sections,
          CANVAS,
          manifest,
          readFileSync(RUNTIME),
          { width: "1440", reducedMotion: false }
        );
        try {
          const page = await ctx.newPage();
          await load(page, `${BOARD_ORIGIN}/${board}`, fx.sections.clock);
          const capture = await captureState(
            page,
            fx.sections,
            queries,
            { state, theme: "light", toggle: false },
            "board"
          );
          const shots: Record<string, string> = {};
          const flat: Record<string, number> = {};
          for (const [id, row] of Object.entries(capture.rows)) {
            if (!row) continue;
            const png = await shoot(page, row.box, capture.frame);
            shots[id] = sha256(png);
            flat[id] = await flatness(scratch, png, "image/png");
          }
          return { capture, shots, flat };
        } finally {
          await ctx.close();
        }
      };
      const settled = await run("default");
      const first = await run("theme-reveal");
      const again = await run("theme-reveal");

      // Held at the recorded fraction, framed by the viewport, and the same
      // frame each time: the same measurements and the same shot bytes.
      expect(first.capture.frame).toEqual({
        at: IN_FLIGHT_AT,
        viewport: [0, 0, 1440, 900],
      });
      expect(again.capture).toEqual(first.capture);
      expect(again.shots).toEqual(first.shots);

      // A row outside the viewport is not in the frame; one inside is.
      for (const [id, row] of Object.entries(settled.capture.rows)) {
        if (!row) continue;
        const out = row.box[1] >= 900;
        expect(first.capture.rows[id] === null, id).toBe(out);
      }
      expect(Object.keys(first.shots)).toContain("fx/range");

      // No shot is one flat colour unless the row is flat when settled too
      // (the fixture's opener text has no visible glyphs).
      for (const [id, share] of Object.entries(first.flat))
        if (share > FLAT)
          expect(
            settled.flat[id],
            `${id} is blank in flight only`
          ).toBeGreaterThan(FLAT);
      expect(first.flat["fx/range"]).toBeLessThan(FLAT);
      // Mid-reveal: the frame is neither theme alone.
      expect(first.shots["fx/range"]).not.toBe(settled.shots["fx/range"]);

      // The committed references: every in-flight capture with motion records
      // its frame, and none of its shots is blank where the settled state is
      // not.
      const real = loadBoards(BOARDS);
      let inFlight = 0;
      for (const [name, ref] of Object.entries(real.spec.boards))
        for (const [key, capture] of Object.entries(ref.captures)) {
          const state = key.split("/")[1].replace(/\+pre-.*|-rm$/g, "");
          if (!real.sections.states[state]?.inFlight) continue;
          // Reduced motion has no reveal to hold: the page as it lands.
          if (!key.endsWith("-rm"))
            expect(capture.frame, `${name} ${key}`).toBeDefined();
          const theme = key.split("/")[0];
          const base = ref.captures[`${theme}/default`];
          for (const [id, row] of Object.entries(capture.rows)) {
            if (!row?.shot) continue;
            inFlight++;
            const share = await flatness(
              scratch,
              readFileSync(path.join(BOARDS, row.shot)),
              "image/webp"
            );
            if (share <= FLAT) continue;
            const plain = base?.rows[id]?.shot;
            const plainShare = plain
              ? await flatness(
                  scratch,
                  readFileSync(path.join(BOARDS, plain)),
                  "image/webp"
                )
              : 0;
            expect(plainShare, `${name} ${key} ${id} is blank`).toBeGreaterThan(
              FLAT
            );
          }
        }
      expect(inFlight).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  test.describe("against the fixture site", () => {
    let server: FixtureServer;
    test.beforeAll(async () => {
      server = await startFixtureServer();
    });
    test.afterAll(async () => {
      await server.close();
    });

    const fixture = () => loadBoards(CANVAS);
    const W: Record<
      "L1" | "D1" | "L3" | "D3",
      Pick<Only, "widths" | "themes">
    > = {
      L1: { widths: ["1440"], themes: ["light"] },
      D1: { widths: ["1440"], themes: ["dark"] },
      L3: { widths: ["390"], themes: ["light"] },
      D3: { widths: ["390"], themes: ["dark"] },
    };
    const boardFor = (width: string, theme: string) =>
      width === "390"
        ? "fx-phone.dc.html"
        : theme === "dark"
          ? "fx-dark-desktop.dc.html"
          : "fx-desktop.dc.html";
    const refRow = (width: string, theme: string, state: string, row: string) =>
      fixture().spec.boards[boardFor(width, theme)].captures[
        `${theme}/${state}`
      ].rows[row]!;

    async function check(
      browser: Browser,
      drift: string | null,
      only: Only,
      boards?: CheckOptionsBoards
    ) {
      server.setDrift(drift ? DRIFTS[drift] : null);
      try {
        return await checkSite({
          dir: CANVAS,
          baseURL: server.url,
          browser,
          only,
          boards,
        });
      } finally {
        server.setDrift(null);
      }
    }

    /** The failure the scenario expects, named in full. */
    function expectFailure(failures: Failure[], want: Want, label: string) {
      const hit = failures.find(
        (f) =>
          (typeof want.property === "string"
            ? f.property === want.property
            : want.property.test(f.property)) &&
          (want.section === undefined || f.section === want.section) &&
          (want.state === undefined || f.state === want.state) &&
          (want.width === undefined || f.width === want.width) &&
          (want.theme === undefined || f.theme === want.theme) &&
          (want.expected === undefined ||
            String(f.expected) === String(want.expected)) &&
          (want.actual === undefined ||
            String(f.actual) === String(want.actual))
      );
      expect(
        hit,
        `${label}: no failure like ${JSON.stringify(want)} in\n${failures.map(describeFailure).join("\n")}`
      ).toBeDefined();
      const text = describeFailure(hit!);
      for (const part of [
        hit!.section,
        hit!.state,
        hit!.width,
        hit!.theme,
        hit!.property,
        String(hit!.expected),
        String(hit!.actual),
      ])
        expect(text).toContain(part);
    }

    test("catches each kind of drift", async ({ browser }) => {
      chromiumOnly();
      test.setTimeout(30 * 60_000);
      const fx = fixture();

      // The unchanged fixture passes everywhere: every built row, state,
      // width and theme, with motion on and reduced.
      const clean = await check(browser, null, {});
      expect(clean.failures.map(describeFailure)).toEqual([]);
      expect(clean.undrawn).toEqual(["fx/footer at 390"]);
      for (const w of ["1440", "390"])
        for (const t of ["light", "dark"])
          expect(
            clean.checked.some((c) => c.endsWith(`${w} ${t}`)),
            `${w} ${t}`
          ).toBe(true);
      expect(clean.checked).toContain("fx/range tab-2-rm 390 dark");

      // Partial build: fx/notes is unbuilt and absent from the site, between
      // two built rows. The unchanged run above skipped the gaps beside it;
      // built, it would be missing.
      const order = Object.entries(
        fx.spec.boards["fx-desktop.dc.html"].captures["light/default"].rows
      )
        .filter(([, r]) => r)
        .sort((a, b) => a[1]!.order - b[1]!.order)
        .map(([id]) => id);
      expect(
        order.slice(
          order.indexOf("fx/gallery"),
          order.indexOf("fx/gallery") + 3
        )
      ).toEqual(["fx/gallery", "fx/notes", "fx/list"]);
      const allBuilt: Sections = {
        ...fx.sections,
        rows: fx.sections.rows.map((r) => ({ ...r, built: true })),
      };
      const notes = await check(
        browser,
        null,
        {
          ...W.L1,
          states: ["default"],
          rm: false,
          rows: ["fx/gallery", "fx/notes", "fx/list"],
        },
        { sections: allBuilt }
      );
      expectFailure(
        notes.failures,
        { section: "fx/notes", property: "drawn", actual: "missing" },
        "unbuilt row once built"
      );
      // An in-scope element still fails in the partial build.
      const inScope = await check(browser, "text-colour", {
        ...W.L1,
        rows: ["fx/opener"],
        states: ["default"],
        rm: false,
      });
      expectFailure(
        inScope.failures,
        {
          section: "fx/opener",
          property: "key text:0 color",
          actual: "rgba(18, 52, 86, 1)",
        },
        "in-scope drift"
      );

      // Each case runs at both widths and both themes in one check; the
      // expected failure is named per combination, with the reference's own
      // values, or the combination must pass.
      type Combo = { width: "1440" | "390"; theme: "light" | "dark" };
      const COMBOS: Combo[] = (["1440", "390"] as const).flatMap((width) =>
        (["light", "dark"] as const).map((theme) => ({ width, theme }))
      );
      type Expect = (c: Combo) => Want | "pass" | null;
      type Case = [drift: string, only: Only, want: Expect | "pass"];
      const rowsIn = (rows: string[], states: string[], rm = false): Only => ({
        rows,
        states,
        rm,
      });
      const opener = (rm = false) => rowsIn(["fx/opener"], ["default"], rm);
      const ref = (c: Combo, row: string, state = "default") =>
        refRow(c.width, c.theme, state, row);
      const key = (c: Combo, row: string, k: string, state = "default") =>
        ref(c, row, state).keys.find((x) => x.key === k)!;
      const tokens = (c: Combo) =>
        fixture().spec.boards[boardFor(c.width, c.theme)].captures[
          `${c.theme}/default`
        ].tokens;
      /** Copy as a control failure quotes it: 60 characters at most. */
      const quoted = (t: string) =>
        JSON.stringify(t.length > 60 ? `${t.slice(0, 57)}...` : t);
      const list = (v: (string | number)[]) =>
        v.length ? v.map(String).join(", ") : "nothing";
      const gapBetween = (c: Combo, row: string, a: string, b: string) => {
        const ka = key(c, row, a);
        const kb = key(c, row, b);
        return Math.round((kb.box[1] - (ka.box[1] + ka.box[3])) * 100) / 100;
      };
      const rowGap = (c: Combo, a: string, b: string) =>
        ref(c, b).box[1] - (ref(c, a).box[1] + ref(c, a).box[3]);
      const pinned = readJson<Manifest>(path.join(CANVAS, "manifest.json"));
      const phoneOnly =
        (want: Expect): Expect =>
        (c) =>
          c.width === "390" ? want(c) : null;
      const darkOnly =
        (want: Expect): Expect =>
        (c) =>
          c.theme === "dark" ? want(c) : null;
      const photoControl =
        (control: string, state: string, row = "fx/gallery"): Expect =>
        (c) => ({
          section: row,
          state,
          property: "control photo",
          expected: `${control} shows another photo (board: ${list(ref(c, row).shows.photos)} to ${list(ref(c, row, state).shows.photos)})`,
          actual: `it stays ${list(ref(c, row).shows.photos)}`,
        });

      const plateControl =
        (control: string, state: string): Expect =>
        (c) => ({
          section: "fx/range",
          state,
          property: "control plate",
          expected: `${control} shows another plate (board: ${list(ref(c, "fx/range").shows.slides)} to ${list(ref(c, "fx/range", state).shows.slides)})`,
          actual: `it stays ${list(ref(c, "fx/range").shows.slides)}`,
        });
      const altFont = `alt-font.woff2 with sha256 ${sha256(
        readFileSync(path.join(CANVAS, "../site/alt-font.woff2"))
      )}`;

      const cases: Case[] = [
        // One thing each, named with its value.
        [
          "moved-10",
          opener(),
          (c) => ({
            section: "fx/opener",
            state: "default",
            property: "box x",
            expected: ref(c, "fx/opener").box[0],
            actual: ref(c, "fx/opener").box[0] + 10,
          }),
        ],
        [
          "order-swap",
          rowsIn(["fx/range", "fx/gallery"], ["default"]),
          () => ({
            section: "fx/range",
            property: "order",
            expected: "fx/range, fx/gallery",
            actual: "fx/gallery, fx/range",
          }),
        ],
        // Rendered order, across the unbuilt notes: the DOM is unchanged.
        [
          "css-order-swap",
          rowsIn(["fx/gallery", "fx/list"], ["default"]),
          () => ({
            section: "fx/gallery",
            property: "order",
            expected: "fx/gallery, fx/list",
            actual: "fx/list, fx/gallery",
          }),
        ],
        [
          "gap-6",
          rowsIn(["fx/range", "fx/gallery"], ["default"]),
          (c) => ({
            section: "fx/gallery",
            property: "gap after fx/range",
            expected: rowGap(c, "fx/range", "fx/gallery"),
            actual: rowGap(c, "fx/range", "fx/gallery") + 6,
          }),
        ],
        [
          "token",
          opener(),
          (c) => ({
            property: "token --accent",
            expected: tokens(c)["--accent"],
            actual: "rgba(255, 0, 0, 1)",
          }),
        ],
        [
          "font-size",
          opener(),
          (c) => ({
            property: "key heading:0 font-size",
            expected: key(c, "fx/opener", "heading:0").type!.size,
            actual: 57,
          }),
        ],
        [
          "word",
          opener(),
          (c) => ({
            property: "copy",
            expected: JSON.stringify(ref(c, "fx/opener").copy),
            actual: JSON.stringify(
              ref(c, "fx/opener").copy.replace(
                "made to be measured",
                "made to be checked"
              )
            ),
          }),
        ],
        [
          "frame-narrower",
          rowsIn(["fx/gallery"], ["default"]),
          (c) => ({
            property: "key image:0 width",
            expected: key(c, "fx/gallery", "image:0").box[2],
            actual: key(c, "fx/gallery", "image:0").box[2] - 10,
          }),
        ],
        [
          "no-animation",
          opener(),
          () => ({
            property: "motion heading:0 rise",
            expected: "enter y+ fade-in 560ms",
            actual: "does not run",
          }),
        ],
        [
          "duration-doubled",
          rowsIn(["fx/range"], ["tab-2"]),
          () => ({
            state: "tab-2",
            property: "motion frame:0 enter x+ fade-in duration",
            expected: "240ms",
            actual: "480ms",
          }),
        ],
        [
          "wrong-side",
          rowsIn(["fx/range"], ["tab-2"]),
          () => ({
            state: "tab-2",
            property: "motion frame:0 direction",
            expected: "plate-from-right enter x+ fade-in",
            actual: "plate-from-left enter x- fade-in",
          }),
        ],
        // Played backwards: the same keyframes, the other way.
        [
          "plate-reversed",
          rowsIn(["fx/range"], ["tab-2"]),
          () => ({
            state: "tab-2",
            property: "motion frame:0 direction",
            expected: "plate-from-right enter x+ fade-in",
            actual: "plate-from-right exit x+ fade-out",
          }),
        ],
        // The theme circle shrinking onto the toggle instead of growing.
        [
          "reveal-shrinks",
          rowsIn(["fx/header"], ["theme-reveal"]),
          (c) => {
            // Named as the toggle reads once the reveal has started.
            const button = `button[Switch to the ${c.theme} theme]`;
            return {
              section: "fx/header",
              state: "theme-reveal",
              property: "motion page direction",
              expected: `theme-reveal grow@${button}`,
              actual: `theme-reveal shrink@${button}`,
            };
          },
        ],
        // A row's motion in a state that is not its own.
        [
          "opener-moves-on-tab",
          rowsIn(["fx/opener", "fx/range"], ["tab-2"]),
          () => ({
            section: "fx/opener",
            state: "tab-2",
            property: "motion text:0 fade-in",
            expected: "no motion",
            actual: "fade-in 300ms",
          }),
        ],
        [
          "rm-animation",
          opener(true),
          () => ({
            state: "default-rm",
            property: "reduced motion",
            expected: "no animation",
            actual: "rise on heading:0",
          }),
        ],
        // Web Animations, and motion started by the first theme toggle.
        [
          "rm-waapi",
          opener(true),
          () => ({
            section: "fx/opener",
            state: "default-rm",
            property: "reduced motion",
            expected: "no animation",
            actual: "animate:effect on heading:0",
          }),
        ],
        // A short effect started by play(), finished before any sweep.
        [
          "rm-play",
          opener(true),
          () => ({
            section: "fx/opener",
            state: "default-rm",
            property: "reduced motion",
            expected: "no animation",
            actual: "animate:effect on heading:0",
          }),
        ],
        [
          "rm-toggle-motion",
          rowsIn(["fx/header"], ["default"], true),
          darkOnly(() => ({
            section: "fx/header",
            state: "default-rm",
            property: "reduced motion",
            expected: "no animation",
            actual: "fade-in on row",
          })),
        ],
        // Each control's visible result, against the state it starts from.
        [
          "tab-dead",
          rowsIn(["fx/range"], ["default", "tab-2"]),
          () => ({
            state: "tab-2",
            property: "control plate",
            expected:
              '"Two" shows another plate (board: 1 of 3: One to 2 of 3: Two)',
            actual: "it stays 1 of 3: One",
          }),
        ],
        [
          "plate-next-dead",
          rowsIn(["fx/range"], ["default", "plate-next"]),
          plateControl('"Next plate"', "plate-next"),
        ],
        [
          "plate-prev-dead",
          rowsIn(["fx/range"], ["default", "plate-prev"]),
          plateControl('"Previous plate"', "plate-prev"),
        ],
        [
          "gallery-dead",
          rowsIn(["fx/gallery"], ["default", "gallery-2"]),
          photoControl('"Next photo"', "gallery-2"),
        ],
        // The counter and thumbnail move and the picture does not: still a fail.
        [
          "gallery-counter-only",
          rowsIn(["fx/gallery"], ["default", "gallery-2"]),
          photoControl('"Next photo"', "gallery-2"),
        ],
        [
          "thumb-dead",
          rowsIn(["fx/gallery"], ["default", "photo-2-of-3"]),
          photoControl('"Photo 2 of 3"', "photo-2-of-3"),
        ],
        [
          "holly-dead",
          rowsIn(["fx/holly"], ["default", "holly-2"]),
          photoControl('"Next photo of Holly"', "holly-2", "fx/holly"),
        ],
        [
          "treat-dead",
          rowsIn(["fx/holly"], ["default", "holly-treat"]),
          (c) => ({
            section: "fx/holly",
            state: "holly-treat",
            property: "control copy",
            expected: '"Give Holly a treat" changes the text',
            actual: `the text stays ${quoted(ref(c, "fx/holly").copy)}`,
          }),
        ],
        [
          "contact-dead",
          rowsIn(["fx/contact"], ["default", "contact-sent"]),
          (c) => ({
            section: "fx/contact",
            state: "contact-sent",
            property: "control copy",
            expected: '"Send message" changes the text',
            actual: `the text stays ${quoted(ref(c, "fx/contact").copy)}`,
          }),
        ],
        [
          "contact-error-dead",
          rowsIn(["fx/contact"], ["default", "contact-error"]),
          (c) => ({
            section: "fx/contact",
            state: "contact-error",
            property: "control copy",
            expected: '"Send message" changes the text',
            actual: `the text stays ${quoted(ref(c, "fx/contact").copy)}`,
          }),
        ],
        // Back must undo forward, not merely differ from the first state.
        [
          "chips-back-dead",
          rowsIn(["fx/range"], ["chips-forward", "chips-back"]),
          phoneOnly((c) => {
            const fwd = ref(c, "fx/range", "chips-forward").shows.scroll;
            const back = ref(c, "fx/range", "chips-back").shows.scroll;
            return {
              state: "chips-back",
              property: "control scroll",
              expected: `"Scroll the categories back" scrolls back (board: ${list(fwd)} to ${list(back)})`,
              actual: `it does not scroll (${list(fwd)} to ${list(fwd)})`,
            };
          }),
        ],
        [
          "filter-dead",
          rowsIn(["fx/list"], ["default", "filter-live"]),
          (c) => ({
            state: "filter-live",
            property: "control copy",
            expected: '"Live" changes the text',
            actual: `the text stays ${quoted(ref(c, "fx/list").copy)}`,
          }),
        ],
        [
          "writing-dead",
          rowsIn(["fx/list"], ["default"]),
          () => ({
            section: "fx/list",
            property: 'link a[href="/blog/work"]',
            expected: "/blog/work",
            actual: "/",
          }),
        ],
        [
          "toggle-dead",
          opener(),
          darkOnly(() => ({
            property: "control",
            expected: '"Switch to the dark theme" switches the theme',
            actual: "no visible change",
          })),
        ],
        // Only the picture inside a frame changes: it passes.
        [
          "picture-only",
          rowsIn(["fx/gallery"], ["default", "gallery-2"]),
          "pass",
        ],
        // The site's fonts: the pinned files, loaded.
        [
          "fonts-wrong",
          opener(),
          () => ({
            section: "fx/opener",
            property: "font red hat text 400 700",
            expected: "a pinned red hat text file",
            actual: altFont,
          }),
        ],
        [
          "fonts-missing",
          opener(),
          () => ({
            section: "fx/opener",
            property: "font red hat text 400 700",
            expected: "loaded from a pinned file",
            actual: "failed to load missing.woff2",
          }),
        ],
        // The pinned file behind a local() source, and another font inline.
        [
          "fonts-local",
          opener(),
          () => ({
            section: "fx/opener",
            property: "font red hat text 400 700",
            expected: "loaded from a pinned file",
            actual: "a local() source: whatever font the machine has",
          }),
        ],
        [
          "fonts-inline",
          opener(),
          () => ({
            section: "fx/opener",
            property: "font red hat text 400 700",
            expected: "loaded from a pinned file",
            actual: "loaded from no file the site served",
          }),
        ],
        // Fonts are checked in every state, reduced motion included.
        [
          "fonts-wrong-rm",
          opener(true),
          () => ({
            section: "fx/opener",
            state: "default-rm",
            property: "font red hat text 400 700",
            expected: "a pinned red hat text file",
            actual: altFont,
          }),
        ],
        [
          "fonts-wrong-on-tab",
          rowsIn(["fx/range"], ["tab-2"]),
          () => ({
            section: "fx/range",
            state: "tab-2",
            property: "font red hat text 400 700",
            expected: "a pinned red hat text file",
            actual: altFont,
          }),
        ],
        // Every other property in scope.
        [
          "font-family",
          opener(),
          () => ({
            property: "key text:0 font-family",
            expected: "red hat text",
            actual: "serif",
          }),
        ],
        [
          "font-weight",
          opener(),
          () => ({
            property: "key heading:0 font-weight",
            expected: 600,
            actual: 700,
          }),
        ],
        [
          "text-colour",
          opener(),
          (c) => ({
            property: "key text:0 color",
            expected: key(c, "fx/opener", "text:0").color,
            actual: "rgba(18, 52, 86, 1)",
          }),
        ],
        [
          "background",
          rowsIn(["fx/range"], ["default"]),
          (c) => ({
            property: "key control:0 background",
            expected: key(c, "fx/range", "control:0").background,
            actual: "rgba(18, 52, 86, 1)",
          }),
        ],
        [
          "border",
          rowsIn(["fx/header"], ["default"]),
          () => ({ property: /^key control:\d+ border$/ }),
        ],
        [
          "frame-ratio",
          rowsIn(["fx/gallery"], ["default"]),
          (c) => ({
            property: "key image:0 aspect ratio",
            expected: key(c, "fx/gallery", "image:0").ratio,
          }),
        ],
        // The shape on its own: each side inside its tolerance, the ratio not.
        [
          "ratio-skew",
          rowsIn(["fx/gallery"], ["default"]),
          (c) => ({
            property: "key image:0 aspect ratio",
            expected: key(c, "fx/gallery", "image:0").ratio,
          }),
        ],
        [
          "frame-radius",
          rowsIn(["fx/gallery"], ["default"]),
          () => ({
            property: "key image:0 radius",
            expected: "0px",
            actual: "4px",
          }),
        ],
        [
          "frame-border",
          rowsIn(["fx/gallery"], ["default"]),
          (c) => ({
            property: "key image:0 border",
            expected: key(c, "fx/gallery", "image:0").border,
          }),
        ],
        // Each tolerance: at the limit passes, just beyond fails.
        ["x-at-limit", opener(), "pass"],
        ["x-beyond", opener(), () => ({ property: "box x" })],
        ["width-at-limit", opener(), "pass"],
        ["width-beyond", opener(), () => ({ property: "box width" })],
        ["height-at-limit", opener(), "pass"],
        ["height-beyond", opener(), () => ({ property: "box height" })],
        ["key-at-limit", opener(), "pass"],
        ["key-beyond", opener(), () => ({ property: "key text:0 y" })],
        ["inner-gap-at-limit", opener(), "pass"],
        [
          "inner-gap-beyond",
          opener(),
          (c) => ({
            property: "gap heading:0 to text:0",
            expected: gapBetween(c, "fx/opener", "heading:0", "text:0"),
            actual: gapBetween(c, "fx/opener", "heading:0", "text:0") + 3,
          }),
        ],
        [
          "gap-at-limit",
          rowsIn(["fx/range", "fx/gallery"], ["default"]),
          "pass",
        ],
        [
          "gap-beyond",
          rowsIn(["fx/range", "fx/gallery"], ["default"]),
          () => ({ property: "gap after fx/range" }),
        ],
        ["line-height-at-limit", opener(), "pass"],
        [
          "line-height-beyond",
          opener(),
          () => ({ property: "key text:0 line-height" }),
        ],
        ["tracking-at-limit", rowsIn(["fx/range"], ["default"]), "pass"],
        [
          "tracking-beyond",
          rowsIn(["fx/range"], ["default"]),
          () => ({ property: /^key text:\d+ letter-spacing$/ }),
        ],
        ["duration-at-limit", opener(), "pass"],
        [
          "duration-beyond",
          opener(),
          () => ({
            property: "motion heading:0 enter y+ fade-in duration",
            expected: "560ms",
            actual: "701ms",
          }),
        ],
      ];
      expect(pinned.runtime.url).toBe("published/support.js");
      for (const [drift, o, want] of cases) {
        const result = await check(browser, drift, o);
        expect(result.checked.length, drift).toBeGreaterThan(0);
        for (const c of COMBOS) {
          const label = `${drift} at ${c.width} ${c.theme}`;
          const here = result.failures.filter(
            (f) => f.width === c.width && f.theme === c.theme
          );
          const w = want === "pass" ? "pass" : want(c);
          if (w === null) continue;
          if (w === "pass")
            expect(here.map(describeFailure), label).toEqual([]);
          else expectFailure(here, { ...w, ...c }, label);
        }
      }
    });

    test("deviations are exact, accepted and expire", async ({ browser }) => {
      chromiumOnly();
      test.setTimeout(15 * 60_000);
      const fx = fixture();
      const head =
        "| id | section | state | width | theme | property | board | built | from | accepted | expires |\n|---|---|---|---|---|---|---|---|---|---|---|\n";
      const register = (rows: Deviation[]) =>
        parseDeviations(
          head +
            rows
              .map(
                (d) =>
                  `| ${d.id} | ${d.section.join(", ")} | ${d.state.join(", ")} | ${d.width.join(", ")} | ${d.theme.join(", ")} | \`${d.property}\` | \`${d.board}\` | \`${d.built}\` | ${d.from} | ${d.accepted} | ${d.expires ?? "-"} |`
              )
              .join("\n")
        );
      const only: Only = {
        widths: ["1440"],
        themes: ["light"],
        rows: ["fx/opener"],
        states: ["default"],
        rm: false,
      };
      const copy: Deviation = {
        id: "D1",
        section: ["fx/opener"],
        state: ["default"],
        width: ["1440"],
        theme: ["light"],
        property: "copy",
        board: "made to be measured",
        built: "made to be checked",
        from: "harness",
        accepted: "owner, 2026-11-20",
        expires: null,
      };
      const run = (
        drift: string,
        deviations: Deviation[],
        merged: string[] = [],
        o: Only = only
      ) => check(browser, drift, o, { deviations, merged });
      // The register round-trips through markdown.
      expect(register([copy])).toEqual([copy]);

      const accepted = await run("word", register([copy]));
      expect(accepted.failures.map(describeFailure)).toEqual([]);
      const unaccepted = await run(
        "word",
        register([{ ...copy, accepted: "" }])
      );
      expectFailure(unaccepted.failures, { property: "copy" }, "unaccepted");
      const differing: [string, Partial<Deviation>][] = [
        ["section", { section: ["fx/range"] }],
        ["state", { state: ["tab-2"] }],
        ["width", { width: ["390"] }],
        ["theme", { theme: ["dark"] }],
        ["property", { property: "key text:0 color" }],
        ["board", { board: "made to be weighed" }],
        ["built", { built: "made to be tested" }],
      ];
      for (const [field, change] of differing) {
        const r = await run("word", register([{ ...copy, ...change }]));
        expectFailure(r.failures, { property: "copy" }, `differing ${field}`);
      }
      // Expiry: once the ticket is merged the mismatch fails again.
      const expiring = { ...copy, expires: "PRV-50" };
      expect((await run("word", register([expiring]))).failures).toEqual([]);
      expectFailure(
        (await run("word", register([expiring]), ["PRV-50"])).failures,
        { property: "copy" },
        "expired copy"
      );

      // A numeric deviation: exact values, then the board's tolerance after expiry.
      const h = refRow("1440", "light", "default", "fx/opener").box[3];
      const taller: Deviation = {
        ...copy,
        id: "D2",
        property: "box height",
        board: String(h),
        built: String(h + 10),
        expires: "PRV-50",
      };
      expect(
        (await run("taller-10", register([taller]))).failures.map(
          describeFailure
        )
      ).toEqual([]);
      expectFailure(
        (await run("taller-10", register([taller]), ["PRV-50"])).failures,
        { property: "box height", expected: h, actual: h + 10 },
        "expired height"
      );
      expect(
        (await run("taller-3", register([taller]), ["PRV-50"])).failures.map(
          describeFailure
        )
      ).toEqual([]);
      expectFailure(
        (
          await run(
            "taller-10",
            register([{ ...taller, built: String(h + 9) }])
          )
        ).failures,
        { property: "box height" },
        "other built value"
      );

      // Acceptance is exactly `owner, YYYY-MM-DD`: rejection text is not.
      for (const text of [
        "Rejected by owner, 2026-11-20",
        "owner, not yet",
        "owner, 2026-13-40",
      ]) {
        expect(isAccepted({ ...copy, accepted: text }), text).toBe(false);
        expectFailure(
          (await run("word", register([{ ...copy, accepted: text }]))).failures,
          { property: "copy" },
          `accepted as ${JSON.stringify(text)}`
        );
      }

      // A later ticket's elements: hidden on the board only while an accepted
      // deviation names that row's entry, and only until the ticket merges.
      // The fixture register lists two (the CV link in the header, L1, and in
      // the footer, L2), both PRV-19, neither accepted.
      const both: Only = { ...only, rows: ["fx/header", "fx/footer"] };
      const listed = fx.deviations.filter((d) => d.property === "later");
      expect(listed.map((d) => [d.id, d.section, d.accepted])).toEqual([
        ["L1", ["fx/header"], ""],
        ["L2", ["fx/footer"], ""],
      ]);
      const accept = (d: Deviation) => ({
        ...d,
        accepted: "owner, 2026-11-20",
      });
      const [l1, l2] = listed;
      expectFailure(
        (await run("cv-absent", fx.deviations, [], both)).failures,
        { section: "fx/header", property: "copy" },
        "no accepted later deviation"
      );
      expect(
        (
          await run("cv-absent", [accept(l1), accept(l2)], [], both)
        ).failures.map(describeFailure)
      ).toEqual([]);
      expectFailure(
        (await run("cv-absent", [accept(l1), accept(l2)], ["PRV-19"], both))
          .failures,
        { section: "fx/header", property: "copy" },
        "expired later"
      );
      // One of the two accepted: only the header's link may be hidden, so the
      // reference both share does not stand in for it.
      expectFailure(
        (await run("cv-absent", [accept(l1), l2], [], both)).failures,
        {
          section: "fx/header",
          property: "reference",
          expected: "fx-desktop.dc.html light/default+pre-L1",
          actual: "missing from spec.json (run boards:regen)",
        },
        "one of two accepted"
      );
      const desktop = boardThemes(fx.sections, "fx-desktop.dc.html", "1440")[0];
      const planned = plannedCaptures(fx.sections, desktop, {
        deviations: [accept(l1), l2],
        merged: [],
      }).find((p) => p.key === "light/default+pre-L1")!;
      expect(planned.hide).toEqual([
        { selector: ':is(header) :is(a[href^="/cv/"])', mode: "remove" },
      ]);
      expect(fx.merged).toEqual([]);
    });

    test("sections mapped, dark from the boards", () => {
      chromiumOnly();
      const real = loadBoards(BOARDS);
      const { problems, undrawn } = checkSections(real);
      expect(problems).toEqual([]);
      const nulls = real.sections.rows.flatMap((r) =>
        (["1440", "390"] as const)
          .filter((w) => r.sources[w] === null)
          .map((w) => `${r.id} at ${w}`)
      );
      expect(undrawn).toEqual(nulls);
      expect(undrawn).toContain("home/contact at 390");
      for (const row of real.sections.rows) {
        expect(row.ticket, row.id).toMatch(/^PRV-\d+$/);
        expect(row.route, row.id).toMatch(/^\//);
        expect(typeof row.built, row.id).toBe("boolean");
        for (const w of ["1440", "390"] as const) {
          const src = row.sources[w];
          if (!src) continue;
          const pin = real.manifest.boards[src.dark.board];
          // Dark is the dark board as drawn, or a light board's own toggle.
          expect(
            (pin.theme === "dark" && src.dark.theme === "drawn") ||
              (pin.theme === "light" && src.dark.theme === "toggle"),
            `${row.id} ${w} dark`
          ).toBe(true);
        }
      }
      // The section ids the ticket names are all mapped.
      const boardsSel = real.sections.rows.map((r) => r.board).join(" ");
      for (const id of [
        "range-title",
        "people",
        "holly-title",
        "writing-title",
        "work",
        "contact-title",
        "person-name",
      ])
        expect(boardsSel, id).toContain(id);
      expect(checkSections(loadBoards(CANVAS)).problems).toEqual([]);

      const broken = (mutate: (b: BoardsDir) => void) => {
        const b = loadBoards(BOARDS);
        b.sections = structuredClone(b.sections);
        mutate(b);
        return checkSections(b);
      };
      const row = "home/opener";
      const at = (b: BoardsDir) => b.sections.rows.find((r) => r.id === row)!;
      // A drawn width and theme without a board fails.
      expect(
        broken((b) => (at(b).sources["390"]!.dark.board = "")).problems.join(
          "\n"
        )
      ).toContain(`${row}: 390 dark is drawn but names no board`);
      // Dark said to be drawn on a light board fails.
      expect(
        broken(
          (b) =>
            (at(b).sources["390"]!.dark = {
              board: "range-phone.dc.html",
              theme: "drawn",
            })
        ).problems.join("\n")
      ).toContain("range-phone.dc.html is drawn light, not dark");
      // Dark from a toggle with no rendered dark state fails.
      expect(
        broken((b) => {
          delete b.spec.boards["range-phone.dc.html"].captures["dark/default"];
        }).problems.join("\n")
      ).toContain(
        `${row}: no rendered dark/default reference on range-phone.dc.html`
      );
      // An undrawn width is skipped and listed, never failed, but only with
      // its evidence: the board at that width, measured without the row.
      expect(undrawn).toContain("home/contact at 390");
      const contact = real.sections.rows.find((r) => r.id === "home/contact")!;
      expect(contact.undrawn).toEqual({ "390": "range-phone.dc.html" });
      // A drawn row relabelled undrawn fails: with no evidence, with evidence
      // that is no phone board, and with the phone board that draws it.
      expect(
        broken((b) => (at(b).sources["390"] = null)).problems.join("\n")
      ).toContain(
        `${row}: 390 is marked undrawn but names no board that leaves it out`
      );
      expect(
        broken((b) => {
          at(b).sources["390"] = null;
          at(b).undrawn = { "390": "range-light-desktop.dc.html" };
        }).problems.join("\n")
      ).toContain(
        `${row}: range-light-desktop.dc.html, the undrawn evidence at 390, is not a pinned 390 board`
      );
      expect(
        broken((b) => {
          at(b).sources["390"] = null;
          at(b).undrawn = { "390": "range-phone.dc.html" };
        }).problems.join("\n")
      ).toContain(`${row}: range-phone.dc.html draws this row at 390`);
      // Evidence from another page's board fails, even where that board
      // measured the row as absent: only the board that draws the row's own
      // page can show it left out.
      const elsewhere = broken((b) => {
        at(b).sources["390"] = null;
        at(b).undrawn = { "390": "pages-404-phone.dc.html" };
        b.spec = structuredClone(b.spec);
        b.spec.boards["pages-404-phone.dc.html"].captures["light/default"].rows[
          row
        ] = null;
      });
      expect(elsewhere.problems.join("\n")).toContain(
        `${row}: pages-404-phone.dc.html, the undrawn evidence at 390, does not draw /preview/home`
      );
      expect(elsewhere.undrawn).not.toContain(`${row} at 390`);

      // PRV-5's variants show each plate's shell only: the interior a later
      // ticket draws is gone even though the plate mounts after the hide
      // (when its tab is picked). The full build keeps it.
      const interiors: Record<string, string[]> = {
        D11: ["finance", "sites", "testing"],
        D12: ["mobile", "ai", "3d"],
      };
      let shells = 0;
      for (const board of [
        "range-light-desktop.dc.html",
        "range-dark-desktop.dc.html",
        "range-phone.dc.html",
      ])
        for (const [key, cap] of Object.entries(
          real.spec.boards[board].captures
        )) {
          const pre = /\+pre-([^-]+)/.exec(key)?.[1].split("+") ?? [];
          for (const [d, plates] of Object.entries(interiors))
            for (const k of plates) {
              const plate = cap.rows[`home/plate-${k}`];
              if (!plate) continue;
              const inside = cap.rows[`home/plate-${k}-interior`];
              if (pre.includes(d)) {
                shells++;
                expect(inside, `${board} ${key} ${k}`).toBeNull();
              } else if (!key.includes("+pre-"))
                expect(inside, `${board} ${key} ${k}`).not.toBeNull();
            }
        }
      expect(shells).toBeGreaterThan(0);

      // PRV-5 keeps each peek's frame and title; the status line above a
      // Finance, Sites or Testing peek drawing goes with the drawing (D13).
      const desk = real.spec.boards["range-light-desktop.dc.html"].captures;
      const listed = Object.keys(desk).find(
        (k) =>
          k.startsWith("light/default+pre-") &&
          k.includes("D13") &&
          !k.endsWith("-rm")
      )!;
      const base = desk["light/default"].rows["home/range"]!.copy;
      const shell = desk[listed].rows["home/range"]!.copy;
      for (const status of ["Live, tested", "In QA"])
        expect(base, status).toContain(status);
      expect(shell).not.toContain("Live, tested");
      expect(shell).not.toContain("In QA");
      expect(shell).toContain(
        "Testing StudioSC Portfolio Finance Tally & Trace"
      );

      // Every board's palette is recorded where the boards define it, and the
      // dark boards' differs from the light ones'.
      const names = real.sections.tokens.names;
      for (const [board, ref] of Object.entries(real.spec.boards))
        for (const [key, cap] of Object.entries(ref.captures)) {
          const got = Object.keys(cap.tokens);
          expect(got.length, `${board} ${key}`).toBeGreaterThan(0);
          expect(
            got.filter((n) => !names.includes(n)),
            board
          ).toEqual([]);
        }
      const light =
        real.spec.boards["range-light-desktop.dc.html"].captures[
          "light/default"
        ].tokens;
      expect(Object.keys(light).sort()).toEqual(
        names.filter((n) => n !== "--error").sort()
      );
      expect(
        broken((b) => {
          b.spec = structuredClone(b.spec);
          b.spec.boards["range-phone.dc.html"].captures[
            "light/default"
          ].tokens = {};
        }).problems.join("\n")
      ).toContain(
        "spec.json: range-phone.dc.html light/default has no colour tokens at div:has(> main)"
      );
      expect(
        broken((b) => {
          b.spec = structuredClone(b.spec);
          b.spec.boards["range-dark-desktop.dc.html"].captures[
            "dark/default"
          ].tokens = light;
        }).problems.join("\n")
      ).toContain(
        "spec.json: range-light-desktop.dc.html light and range-dark-desktop.dc.html dark have the same palette"
      );
    });

    test("writes verifier pairs, fails on a mismatch, leaves the site unchanged", async () => {
      chromiumOnly();
      test.setTimeout(30 * 60_000);
      // Motion on and reduced, and the theme reveal held in flight.
      const only: Only = {
        rows: ["fx/header", "fx/opener", "fx/range"],
        states: ["default", "tab-2", "theme-reveal"],
      };
      const drifted = await nestedRun(ROOT, {
        UI_VERIFY: "1",
        FIXTURE_DRIFT: "font-size",
        FIDELITY_ONLY: JSON.stringify(only),
      });
      try {
        expect(drifted.status, drifted.output).not.toBe(0);
        expect(drifted.output).toContain(
          "key heading:0 font-size: expected 56, got 57"
        );
        const pairs = path.join(drifted.out, "fidelity");
        const want: string[] = [];
        for (const w of ["1440", "390"])
          for (const t of ["light", "dark"])
            for (const rm of ["", "-rm"]) {
              for (const s of ["default", "theme-reveal"])
                want.push(pairName("fx/header", `${s}${rm}`, w, t));
              want.push(pairName("fx/opener", `default${rm}`, w, t));
              for (const s of ["default", "tab-2"])
                want.push(pairName("fx/range", `${s}${rm}`, w, t));
            }
        const written = readdirSync(pairs).sort();
        expect(written).toEqual(
          want.flatMap((n) => [`${n}-board.png`, `${n}-site.png`]).sort()
        );
        for (const n of want) {
          const b = pngSize(readFileSync(path.join(pairs, `${n}-board.png`)));
          const s = pngSize(readFileSync(path.join(pairs, `${n}-site.png`)));
          expect(s, n).toEqual(b);
          expect(b[0] * b[1], n).toBeGreaterThan(0);
        }
      } finally {
        rmSync(drifted.out, { recursive: true, force: true });
      }

      // The numbers pass; a verifier row reporting a visible mismatch fails.
      const one: Only = {
        rows: ["fx/opener"],
        widths: ["1440"],
        themes: ["light"],
        states: ["default"],
        rm: false,
      };
      const reports = tmp("verifier-");
      try {
        const report = (visible: string) => {
          const file = path.join(reports, `${visible}.json`);
          writeFileSync(
            file,
            JSON.stringify([
              {
                pair: pairName("fx/opener", "default", "1440", "light"),
                visible,
                note: "the h1 sits lower",
              },
            ])
          );
          return file;
        };
        const base = { UI_VERIFY: "1", FIDELITY_ONLY: JSON.stringify(one) };
        const matched = await nestedRun(ROOT, {
          ...base,
          FIDELITY_VERIFIER_REPORT: report("match"),
        });
        expect(matched.status, matched.output).toBe(0);
        rmSync(matched.out, { recursive: true, force: true });
        const mismatch = await nestedRun(ROOT, {
          ...base,
          FIDELITY_VERIFIER_REPORT: report("mismatch"),
        });
        expect(mismatch.status).not.toBe(0);
        expect(mismatch.output).toContain(
          "verifier: fx.opener-default-1440-light shows a visible mismatch"
        );
        expect(mismatch.output).not.toMatch(
          /\] (box|key|copy|token|gap|motion|order)/
        );
        rmSync(mismatch.out, { recursive: true, force: true });
      } finally {
        rmSync(reports, { recursive: true, force: true });
      }

      // The diff stays inside this ticket's paths while the base lacks it.
      const range = prRange();
      if (!range || existsAt(range.base, SPEC_FILE)) return;
      const allowed =
        /^(docs\/boards\/|e2e\/fidelity(-harness)?\.spec\.ts$|e2e\/fixtures\/fidelity\/|scripts\/boards[/.-]|package\.json$|eslint\.config\.mjs$|docs\/tickets\/PRV-22\.md$|\.gitignore$|\.prettierignore$|\.lintstagedrc\.json$|\.husky\/|\.github\/workflows\/ci\.yml$)/;
      const changed = git([
        "diff",
        "--name-only",
        "--no-renames",
        `${range.base}...${range.head}`,
      ])
        .split("\n")
        .filter(Boolean);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.filter((f) => !allowed.test(f))).toEqual([]);
    });
  });

  test("hidden header links leave no gap", async () => {
    chromiumOnly();
    const runtime = pinnedRuntime();
    test.skip(!runtime, NO_RUNTIME);
    test.setTimeout(40 * 60_000);
    const inputs = inputsAt(null);
    const d9 = inputs.register.deviations.find((d) => d.id === "D9")!;
    test.skip(inputs.register.merged.includes(d9.expires!), "D9 has expired");
    expect(d9.section).toEqual(["chrome/header"]);
    const row = inputs.sections.rows.find((r) => r.id === "chrome/header")!;
    /** The header's rendered nav links and its rendered empty list items. */
    const nav = (page: Page) =>
      page.evaluate((scope) => {
        const shown = (el: Element) => el.getClientRects().length > 0;
        const items = [...document.querySelectorAll(`:is(${scope}) li`)].filter(
          shown
        );
        return {
          links: [...document.querySelectorAll(`:is(${scope}) nav a`)]
            .filter(shown)
            .map((a) => (a.textContent ?? "").trim()),
          empty: items.filter(
            (li) => ![...li.querySelectorAll("*")].some(shown)
          ).length,
        };
      }, row.board);
    const browser = await chromium.launch({ args: RASTER_ARGS });
    const dirs: string[] = [];
    try {
      let checked = 0;
      for (const width of d9.width as Width[])
        for (const theme of d9.theme as Theme[]) {
          const board = row.sources[width]![theme].board;
          const bt = boardThemes(inputs.sections, board, width).find(
            (b) => b.theme === theme
          )!;
          const plans = plannedCaptures(inputs.sections, bt, inputs.register);
          const partial = plans.filter((p) => p.pending.includes("D9"));
          const states = partial.map((p) => stateName(p.state, { rm: p.rm }));
          const listed = [...d9.state].sort();
          expect(states.sort(), `${board} ${theme}`).toEqual(listed);
          // The control: the same board with the Seth and Christine list
          // items left out of its source. The phone header draws neither.
          const html = readFileSync(path.join(BOARDS, board), "utf8");
          const items =
            /\s*<li><a href="\/(?:seth|christine)"[^>]*>[^<]*<\/a><\/li>/g;
          const found = html.match(items)?.length ?? 0;
          expect(found, board).toBe(width === "1440" ? 2 : 0);
          const control = boardsWith(board, html.replace(items, ""));
          dirs.push(control);
          for (const plan of partial) {
            const at = `${board} ${plan.key}`;
            const d9Hides = hidesOf(inputs, [row], plan, bt, "D9");
            expect(d9Hides.length, at).toBe(1);
            const rendered = await renderPlan(
              browser,
              BOARDS,
              inputs,
              runtime!,
              board,
              bt,
              plan,
              plan.hide,
              nav
            );
            const ref =
              inputs.spec.boards[board].captures[plan.key].rows[row.id]!;
            const made = rendered.capture.rows[row.id]!;
            // The rendered header is the one the partial reference holds.
            expect(keyBoxes(made), at).toEqual(keyBoxes(ref));
            expect(rendered.seen.empty, at).toBe(0);
            const others = plan.hide.filter(
              (h) => !d9Hides.includes(h.selector)
            );
            const ctl = await renderPlan(
              browser,
              control,
              inputs,
              runtime!,
              board,
              bt,
              plan,
              others,
              nav
            );
            const clean = ctl.capture.rows[row.id]!;
            expect(ctl.seen.empty, at).toBe(0);
            if (width === "1440") {
              const want = ["Work", "Writing", "Start a project"];
              expect(rendered.seen.links, at).toEqual(want);
              expect(ctl.seen.links, at).toEqual(want);
              const work = ref.keys.find((k) => k.label === "Work")!;
              const cleanWork = clean.keys.find((k) => k.label === "Work")!;
              const dx = Math.abs(work.box[0] - cleanWork.box[0]);
              expect(dx, at).toBeLessThanOrEqual(TOLERANCE.key);
            } else {
              // Theme toggle, wordmark and Menu button, as the unmodified header.
              const labels = ref.keys.map((k) => k.label);
              expect(labels.slice(1), at).toEqual(["StudioSC, home", "Menu"]);
              const toggle = /^Switch to the (light|dark) theme$/;
              expect(labels[0], at).toMatch(toggle);
              const cleanLabels = clean.keys.map((k) => k.label);
              expect(cleanLabels, at).toEqual(labels);
              for (const [i, k] of ref.keys.entries()) {
                const drift = keyDrift(k, clean.keys[i]);
                expect(drift, `${at} ${k.label}`).toEqual([]);
              }
            }
            checked++;
          }
        }
      const cases = d9.width.length * d9.theme.length * d9.state.length;
      expect(checked).toBe(cases);
    } finally {
      await browser.close();
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });

  test("hidden CV links leave no gap", async () => {
    chromiumOnly();
    const runtime = pinnedRuntime();
    test.skip(!runtime, NO_RUNTIME);
    test.setTimeout(60 * 60_000);
    const inputs = inputsAt(null);
    const d5 = inputs.register.deviations.find((d) => d.id === "D5")!;
    test.skip(inputs.register.merged.includes(d5.expires!), "D5 has expired");
    const cv = 'a[href^="/cv/"]';
    expect(d5.board).toBe(cv);
    /**
     * Every CV link on the page in document order: whether it sits in the
     * row, its key label, whether it is rendered, and whether its wrapper
     * holds anything else (a wrapper shared with other content stays).
     */
    const links = (scope: string) => (page: Page) =>
      page.evaluate(
        ([scope, sel]) => {
          const shown = (el: Element) => el.getClientRects().length > 0;
          const rows = [...document.querySelectorAll(scope)];
          return [...document.querySelectorAll(sel)].map((a) => ({
            inRow: rows.some((r) => r.contains(a)),
            label: (a.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 40),
            shown: shown(a),
            shared: [...(a.parentElement?.children ?? [])].some(
              (c) => c !== a && shown(c)
            ),
          }));
        },
        [scope, cv] as const
      );
    const browser = await chromium.launch({ args: RASTER_ARGS });
    const dirs: string[] = [];
    try {
      let checked = 0;
      for (const id of d5.section) {
        const row = inputs.sections.rows.find((r) => r.id === id)!;
        for (const width of WIDTHS) {
          if (!row.sources[width] || !d5.width.includes(width)) continue;
          for (const theme of d5.theme as Theme[]) {
            const board = row.sources[width]![theme].board;
            const bt = boardThemes(inputs.sections, board, width).find(
              (b) => b.theme === theme
            )!;
            const plans = plannedCaptures(inputs.sections, bt, inputs.register);
            // The states sections.json maps for this row that D5 lists.
            const mapped = rowStates(inputs.sections, row, width);
            const partial = plans.filter(
              (p) =>
                p.pending.includes("D5") &&
                mapped.includes(p.state) &&
                d5.state.includes(stateName(p.state, { rm: p.rm }))
            );
            const where = `${id} ${board} ${theme}`;
            expect(partial.length, where).toBeGreaterThan(0);
            const html = readFileSync(path.join(BOARDS, board), "utf8");
            for (const plan of partial) {
              const at = `${id} ${board} ${plan.key}`;
              const d5Hides = hidesOf(inputs, [row], plan, bt, "D5");
              expect(d5Hides.length, at).toBe(1);
              const rendered = await renderPlan(
                browser,
                BOARDS,
                inputs,
                runtime!,
                board,
                bt,
                plan,
                plan.hide,
                links(row.board)
              );
              const inRow = rendered.seen.filter((l) => l.inRow);
              expect(inRow.length, at).toBeGreaterThan(0);
              const shown = inRow.filter((l) => l.shown);
              const alone = inRow.filter((l) => !l.shared);
              expect(shown, at).toEqual([]);
              expect(alone, at).toEqual([]);
              // The partial reference omits the CV links the full one draws.
              const caps = inputs.spec.boards[board].captures;
              const ref = caps[plan.key].rows[id]!;
              const fullKey = `${bt.theme}/${stateName(plan.state, { rm: plan.rm })}`;
              const full = caps[fullKey].rows[id]!;
              const cvLabels = inRow.map((l) => l.label);
              const refLabels = ref.keys.map((k) => k.label);
              const fullLabels = full.keys.map((k) => k.label);
              const leftIn = cvLabels.filter((l) => refLabels.includes(l));
              const notDrawn = cvLabels.filter((l) => !fullLabels.includes(l));
              expect(leftIn, at).toEqual([]);
              expect(notDrawn, at).toEqual([]);
              // The control: the row's CV links left out of the source.
              let n = 0;
              const omitted = html.replace(
                /\s*<a href="\/cv\/[^"]*"[^>]*>[\s\S]*?<\/a>/g,
                (m) => (rendered.seen[n++]?.inRow ? "" : m)
              );
              const inDom = rendered.seen.length;
              expect(n, `${at}: CV links in the source`).toBe(inDom);
              const control = boardsWith(board, omitted);
              dirs.push(control);
              const others = plan.hide.filter(
                (h) => !d5Hides.includes(h.selector)
              );
              const ctl = await renderPlan(
                browser,
                control,
                inputs,
                runtime!,
                board,
                bt,
                plan,
                others,
                links(row.board)
              );
              const kept = ctl.seen.filter((l) => l.inRow);
              expect(kept, at).toEqual([]);
              const clean = ctl.capture.rows[id]!;
              const [x, , w, h] = ref.box;
              const [cx, , cw, ch] = clean.box;
              const { sectionX, sectionWidth, sectionHeight } = TOLERANCE;
              expect(Math.abs(x - cx), at).toBeLessThanOrEqual(sectionX);
              expect(Math.abs(w - cw), at).toBeLessThanOrEqual(sectionWidth);
              expect(Math.abs(h - ch), at).toBeLessThanOrEqual(sectionHeight);
              const names = (r: RowMeasure) => r.keys.map((k) => k.label);
              expect(names(clean), at).toEqual(names(ref));
              for (const [i, k] of ref.keys.entries()) {
                const drift = keyDrift(k, clean.keys[i]);
                expect(drift, `${at} ${k.key} ${k.label}`).toEqual([]);
              }
              checked++;
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    } finally {
      await browser.close();
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });

  test("regenerates the affected board references exactly", async () => {
    chromiumOnly();
    const runtime = pinnedRuntime();
    test.skip(!runtime, NO_RUNTIME);
    const range = prRange();
    test.skip(!range || existsAt(range.base, PRV27_TICKET), PRV27_ONLY);
    test.setTimeout(60 * 60_000);
    const fork = forkOf(range!);
    const base = inputsAt(fork);
    const head = inputsAt(range!.head);
    const affected = affectedBoards(base, head);
    expect(affected.length).toBeGreaterThan(0);
    const changed = changedCaptures(base, head);
    // A field the unpacking would drop, on a changed D9 capture, is caught.
    const headText = git(["show", `${range!.head}:docs/boards/spec.json`]);
    const [first] = affected;
    const extra = repacked(headText, first, (b) => {
      b.captures[changed[first][0]].extra = true;
    });
    expect(() => specOf(extra, "mutation")).toThrow(/canonical/);
    // Committed: every capture whose plan is unchanged, and its reference
    // files, as at the base; only changed captures' references differ.
    const blobs = (sha: string) =>
      new Map(
        git(["ls-tree", "-r", sha, "--", "docs/boards/ref/"])
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [meta, file] = l.split("\t");
            return [file.slice("docs/boards/".length), meta.split(" ")[2]];
          })
      );
    const baseBlobs = blobs(fork);
    const headBlobs = blobs(range!.head);
    const shots = (spec: SpecFile, board: string, keys: string[]) =>
      keys.flatMap((k) =>
        Object.values(spec.boards[board].captures[k]?.rows ?? {})
          .map((r) => r?.shot)
          .filter((f): f is string => !!f)
      );
    for (const board of affected) {
      const keys = changed[board];
      expect(keys.length, board).toBeGreaterThan(0);
      const { captures: was, ...wasMeta } = base.spec.boards[board];
      const { captures: now, ...nowMeta } = head.spec.boards[board];
      expect(nowMeta, board).toEqual(wasMeta);
      const kept = Object.keys(now).filter((k) => !keys.includes(k));
      const keptSince = Object.keys(was).filter((k) => !keys.includes(k));
      expect(kept.sort(), board).toEqual(keptSince.sort());
      for (const k of kept) {
        const entry = JSON.stringify(now[k]);
        expect(entry, `${board} ${k}`).toBe(JSON.stringify(was[k]));
        for (const f of shots(head.spec, board, [k]))
          expect(headBlobs.get(f), `${board} ${k} ${f}`).toBe(baseBlobs.get(f));
      }
      // Reference files that differ from the base belong to changed captures.
      const mine = new Set([
        ...shots(head.spec, board, keys),
        ...shots(base.spec, board, keys),
      ]);
      const prefix = `ref/${board.replace(/\.dc\.html$/, "")}/`;
      const moved = [...new Set([...baseBlobs.keys(), ...headBlobs.keys()])]
        .filter((f) => f.startsWith(prefix))
        .filter((f) => baseBlobs.get(f) !== headBlobs.get(f));
      expect(
        moved.filter((f) => !mine.has(f)),
        board
      ).toEqual([]);
    }
    // Regenerated from the committed tree with the pinned runtime: every
    // changed capture's entry, reference paths and bytes are the committed ones.
    const dir = tmp("fidelity-prv27-");
    try {
      const archive = spawnSync(
        "git",
        ["archive", "--format=tar", range!.head, "docs/boards"],
        { cwd: ROOT, env: cleanEnv(), maxBuffer: 1 << 30 }
      );
      expect(archive.status).toBe(0);
      const untar = spawnSync("tar", ["-x", "-C", dir], {
        input: archive.stdout,
      });
      expect(untar.status).toBe(0);
      const work = path.join(dir, "docs/boards");
      const committed = snapshot(work);
      const cache = runtimeCache();
      // One board per run, each inside regen's time limit on a loaded host.
      for (const board of affected) {
        const run = await regen(work, { BOARDS_CACHE: cache }, [
          "--board",
          board,
        ]);
        expect(run.status, `${board}: ${run.stderr}`).toBe(0);
      }
      const made = specOf(
        readFileSync(path.join(work, "spec.json"), "utf8"),
        "the regenerated tree"
      );
      const fresh = snapshot(work);
      for (const board of affected)
        for (const k of changed[board]) {
          const at = `${board} ${k}`;
          const entry = JSON.stringify(made.boards[board].captures[k]);
          const want = JSON.stringify(head.spec.boards[board].captures[k]);
          expect(entry, at).toBe(want);
          for (const f of shots(made, board, [k])) {
            expect(committed[f], `${at} ${f}`).toBeDefined();
            expect(fresh[f], `${at} ${f}`).toBe(committed[f]);
          }
        }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("deviations carry the owner's signatures", () => {
    chromiumOnly();
    const range = prRange();
    test.skip(!range || existsAt(range.base, PRV27_TICKET), PRV27_ONLY);
    const fork = forkOf(range!);
    const base = inputsAt(fork);
    const head = inputsAt(range!.head);
    const before = base.register.deviations;
    const after = head.register.deviations;
    const ids = (rows: Deviation[]) => rows.map((d) => d.id);
    expect(ids(after)).toEqual(ids(before));
    const accepted = Object.fromEntries(after.map((d) => [d.id, d.accepted]));
    expect(accepted.D1).toBe("");
    for (let n = 2; n <= 14; n++)
      expect(accepted[`D${n}`], `D${n}`).toBe("owner, 2026-11-26");
    // Every other field as at the base, but D9's board selector (D5 is
    // unchanged).
    const rest = (d: Deviation) => ({
      ...d,
      accepted: "",
      board: d.id === "D9" ? "" : d.board,
    });
    for (const [i, d] of after.entries())
      expect(rest(d), d.id).toEqual(rest(before[i]));
    const d9 = after.find((d) => d.id === "D9")!;
    const items = 'li:has(> a[href="/seth"]), li:has(> a[href="/christine"])';
    expect(d9.board).toBe(items);
    // The mapped sections hide exactly the D9 and D5 board selectors, and
    // every other value in sections.json is as at the base.
    expect(sectionProblems(base, head)).toEqual([]);
    // A hide mode changed alongside D9's selector (the list items kept in
    // the layout, invisible) is caught.
    const mutated = structuredClone(head);
    const header = mutated.sections.rows.find((r) => r.id === "chrome/header")!;
    header.later!.find((l) => l.ticket === "PRV-10")!.hide[0].mode = "hide";
    expect(sectionProblems(base, mutated).length).toBeGreaterThan(0);
    // The register's text: only the sentence on acceptance changed.
    const prose = (sha: string) =>
      git(["show", `${sha}:docs/boards/deviations.md`])
        .split("\n")
        .filter((l) => !l.trim().startsWith("|"));
    const was = prose(fork);
    const now = prose(range!.head);
    const old =
      "PRV-22 seeds the rows below. None is accepted: the owner signs each one, with the date, before it applies.";
    const sentence =
      "PRV-22 seeds the rows below. A row applies once the owner signs and dates it in the `accepted` column, subject to the matching and expiry rules above.";
    expect(was).toContain(old);
    expect(now).toEqual(was.map((l) => (l === old ? sentence : l)));
  });

  test("PRV-27 changes only scoped paths", () => {
    chromiumOnly();
    const range = prRange();
    test.skip(!range || existsAt(range.base, PRV27_TICKET), PRV27_ONLY);
    const fork = forkOf(range!);
    const base = inputsAt(fork);
    const head = inputsAt(range!.head);
    // Affected boards: those whose capture plans (hide selectors included)
    // differ between the base and the head.
    const affected = affectedBoards(base, head);
    expect(affected.length).toBeGreaterThan(0);
    const refDir = (board: string) =>
      `docs/boards/ref/${board.replace(/\.dc\.html$/, "")}/`;
    const scoped = [
      "docs/boards/deviations.md",
      "docs/boards/sections.json",
      "docs/boards/spec.json",
      "e2e/fidelity-harness.spec.ts",
      PRV27_TICKET,
    ];
    const changed = git([
      "diff",
      "--name-only",
      "--no-renames",
      `${range!.base}...${range!.head}`,
    ])
      .split("\n")
      .filter(Boolean);
    const inScope = (f: string) =>
      scoped.includes(f) || affected.some((b) => f.startsWith(refDir(b)));
    expect(changed).toContain(PRV27_TICKET);
    expect(changed.filter((f) => !inScope(f))).toEqual([]);
    // Every unaffected board: its spec.json entry and its reference files'
    // paths and bytes as at the base.
    const files = (sha: string, board: string) =>
      git(["ls-tree", "-r", sha, "--", refDir(board)]);
    const boards = Object.keys(head.manifest.boards).sort();
    expect(boards).toEqual(Object.keys(base.manifest.boards).sort());
    // An unused table entry on an unaffected board is caught.
    const unaffected = boards.find((b) => !affected.includes(b))!;
    const headText = git(["show", `${range!.head}:docs/boards/spec.json`]);
    const padded = repacked(headText, unaffected, (b) => {
      b.table["0000000000000000"] = { unused: true };
    });
    expect(() => specOf(padded, "mutation")).toThrow(/canonical/);
    for (const board of boards.filter((b) => !affected.includes(b))) {
      const entry = JSON.stringify(head.spec.boards[board]);
      expect(entry, board).toBe(JSON.stringify(base.spec.boards[board]));
      expect(files(range!.head, board), board).toBe(files(fork, board));
    }
  });
});

type Want = Partial<Omit<Failure, "property">> & { property: string | RegExp };
type CheckOptionsBoards = Parameters<typeof checkSite>[0]["boards"];

/** PRV-27's ticket: its PR-boundary checks run on the PR that adds it. */
const PRV27_TICKET = "docs/tickets/PRV-27.md";
const PRV27_ONLY = "PRV-27's checks run on the PR that adds its ticket";
const NO_RUNTIME =
  "needs the pinned canvas runtime in .cache/boards/ (run locally; CI has none)";

/** Where a PR forked from its base: what it changed is judged from here. */
const forkOf = (range: PrRange) =>
  git(["merge-base", range.base, range.head]).trim();

/** The gitignored runtime cache regen reads. */
const runtimeCache = () =>
  path.resolve(ROOT, process.env.BOARDS_CACHE || ".cache/boards");

/**
 * The pinned canvas runtime from the gitignored cache, or null when the
 * cache has none. A cached runtime that is not the pinned bytes fails.
 */
function pinnedRuntime(): Buffer | null {
  const file = path.join(runtimeCache(), "support.js");
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  const pinned = readJson<Manifest>(path.join(BOARDS, "manifest.json"));
  expect(sha256(bytes), file).toBe(pinned.runtime.sha256);
  return bytes;
}

interface BoardInputs {
  manifest: Manifest;
  sections: Sections;
  register: Register;
  spec: SpecFile;
}

/** The board inputs in the working tree (sha null) or at a commit. */
function inputsAt(sha: string | null): BoardInputs {
  const read = (f: string) =>
    sha
      ? git(["show", `${sha}:docs/boards/${f}`])
      : readFileSync(path.join(BOARDS, f), "utf8");
  return {
    manifest: JSON.parse(read("manifest.json")) as Manifest,
    sections: JSON.parse(read("sections.json")) as Sections,
    register: {
      deviations: parseDeviations(read("deviations.md")),
      merged: JSON.parse(read("merged.json")) as string[],
    },
    spec: specOf(read("spec.json"), sha ?? "the working tree"),
  };
}

/**
 * Every board's capture plan (its rows, themes, states, partial builds and
 * hide selectors, and the rows it is the undrawn evidence for), as text.
 */
function capturePlans(inputs: BoardInputs): Record<string, string> {
  const { manifest, sections, register } = inputs;
  const out: Record<string, string> = {};
  for (const [board, pin] of Object.entries(manifest.boards)) {
    const evidence = sections.rows
      .filter((r) => r.undrawn?.[pin.width] === board)
      .map((r) => r.id);
    const themes = boardThemes(sections, board, pin.width).map((bt) => ({
      theme: bt.theme,
      toggle: bt.toggle,
      rows: bt.rows.map((r) => r.id),
      captures: plannedCaptures(sections, bt, register),
    }));
    out[board] = JSON.stringify({ evidence, themes });
  }
  return out;
}

/** The boards whose capture plans differ between two sets of inputs. */
function affectedBoards(base: BoardInputs, head: BoardInputs): string[] {
  const a = capturePlans(base);
  const b = capturePlans(head);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((board) => a[board] !== b[board])
    .sort();
}

/**
 * Per affected board, the capture keys whose plan (state, motion, partial
 * build and hide selectors) differs between the base and the head, or that
 * only one of them has.
 */
function changedCaptures(
  base: BoardInputs,
  head: BoardInputs
): Record<string, string[]> {
  const plans = (inputs: BoardInputs, board: string) => {
    const pin = inputs.manifest.boards[board];
    const out = new Map<string, string>();
    for (const bt of boardThemes(inputs.sections, board, pin.width))
      for (const plan of plannedCaptures(inputs.sections, bt, inputs.register))
        out.set(plan.key, JSON.stringify({ toggle: bt.toggle, plan }));
    return out;
  };
  const out: Record<string, string[]> = {};
  for (const board of affectedBoards(base, head)) {
    const a = plans(base, board);
    const b = plans(head, board);
    out[board] = [...new Set([...a.keys(), ...b.keys()])]
      .filter((k) => a.get(k) !== b.get(k))
      .sort();
  }
  return out;
}

/**
 * What differs in sections.json beyond PRV-27's one permitted change: each
 * section D9 and D5 list must hide exactly that deviation's board selector;
 * D5's entries equal the base; and with only the selector values of D9's
 * entries put back, the sections equal the base (a changed hide mode or an
 * added hide is a difference).
 */
function sectionProblems(base: BoardInputs, head: BoardInputs): string[] {
  const problems: string[] = [];
  const entry = (inputs: BoardInputs, section: string, ticket: string) =>
    inputs.sections.rows
      .find((r) => r.id === section)
      ?.later?.find((l) => l.ticket === ticket);
  const reset = structuredClone(head);
  for (const id of ["D9", "D5"]) {
    const d = head.register.deviations.find((x) => x.id === id)!;
    for (const section of d.section) {
      const now = entry(head, section, d.expires!);
      const was = entry(base, section, d.expires!);
      if (!now || !was) {
        problems.push(`${id} ${section}: no ${d.expires} entry`);
        continue;
      }
      if (laterSelector(now.hide) !== d.board)
        problems.push(`${id} ${section}: hides ${laterSelector(now.hide)}`);
      if (id === "D5" && !isDeepStrictEqual(now, was))
        problems.push(`D5 ${section}: its entry differs from the base`);
      if (id !== "D9" || now.hide.length !== was.hide.length) continue;
      const mine = entry(reset, section, d.expires!)!;
      mine.hide.forEach((h, i) => (h.selector = was.hide[i].selector));
    }
  }
  if (!isDeepStrictEqual(reset.sections, base.sections))
    problems.push("sections.json differs from the base beyond D9's selector");
  return problems;
}

/**
 * A committed spec.json, unpacked for comparison once it is exactly its own
 * canonical pack: an unknown field or an unused table entry, which unpacking
 * would drop, fails here instead.
 */
function specOf(text: string, where: string): SpecFile {
  const spec = unpackSpec(text);
  if (packSpec(spec) !== text)
    throw new Error(
      `${where}: spec.json is not its canonical pack (a field or table entry unpacking would drop)`
    );
  return spec;
}

/** A spec.json text with one packed board changed in memory. */
function repacked(
  text: string,
  board: string,
  change: (packed: {
    table: Record<string, unknown>;
    captures: Record<string, Record<string, unknown>>;
  }) => void
): string {
  const raw = JSON.parse(text) as {
    boards: Record<string, Parameters<typeof change>[0]>;
  };
  change(raw.boards[board]);
  return stableJson(raw, 4);
}

/** The boards directory with one board's source replaced, for a control. */
function boardsWith(board: string, source: string): string {
  const dir = tmp("fidelity-control-");
  for (const f of readdirSync(BOARDS))
    if (f !== "ref" && f !== board)
      symlinkSync(path.join(BOARDS, f), path.join(dir, f));
  writeFileSync(path.join(dir, board), source);
  return dir;
}

/**
 * One planned capture rendered as regen renders it, from `dir`, with the
 * given hides; `inspect` reads the page once the state is measured.
 */
async function renderPlan<T>(
  browser: Browser,
  dir: string,
  inputs: BoardInputs,
  runtime: Buffer,
  board: string,
  bt: BoardTheme,
  plan: PlannedCapture,
  hide: Hide[],
  inspect: (page: Page) => Promise<T>
): Promise<{ capture: Capture; seen: T }> {
  const { manifest, sections } = inputs;
  const evidence = sections.rows.filter(
    (r) => r.undrawn?.[bt.width] === board && !bt.rows.includes(r)
  );
  const queries = rowQueries([...bt.rows, ...evidence], sections.rows, "board");
  const refused: string[] = [];
  const ctx = await boardContext(
    browser,
    sections,
    dir,
    manifest,
    runtime,
    { width: bt.width, reducedMotion: plan.rm },
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
      { hide, allMotion: plan.rm }
    );
    const seen = await inspect(page);
    expect(errors, `${board} ${plan.key}`).toEqual([]);
    expect(refused, `${board} ${plan.key}`).toEqual([]);
    return { capture, seen };
  } finally {
    await ctx.close();
  }
}

/** The hides a plan applies for one deviation's entries, on these rows. */
function hidesOf(
  inputs: BoardInputs,
  rows: Row[],
  plan: PlannedCapture,
  where: { width: string; theme: string },
  id: string
): string[] {
  const { deviations, merged } = inputs.register;
  const state = stateName(plan.state, { rm: plan.rm });
  return hiddenFor(deviations, merged, rows, { ...where, state }, [id]).map(
    (h) => h.selector
  );
}

/** The key boxes of a row measure, by label, one line per key. */
const keyBoxes = (row: RowMeasure) =>
  row.keys.map((k) => `${k.key} ${k.label} ${k.box.join(",")}`);

/** The axes on which two key boxes differ by more than the key tolerance. */
const keyDrift = (a: KeyMeasure, b: KeyMeasure) =>
  (["x", "y", "width", "height"] as const).filter(
    (_, i) => Math.abs(a.box[i] - b.box[i]) > TOLERANCE.key
  );
