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
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
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
  walk,
  type BoardsDir,
  type Deviation,
  type Manifest,
  type Sections,
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
  runSteps,
  shoot,
  siteContext,
} from "../scripts/boards/capture";
import { runtimeBytes, runtimeSource } from "../scripts/boards-regen";
import {
  CANVAS,
  RUNTIME,
  startFixtureServer,
  type FixtureServer,
} from "./fixtures/fidelity/server";
import { DRIFTS } from "./fixtures/fidelity/drifts";
import { boardThemes, plannedCaptures } from "../scripts/boards/plan";
import { scanText, isBinary } from "./support/denylist";
import { exifGpsSegment, jpegWithSegment } from "./support/dirty-images";
import {
  ROOT,
  cleanEnv,
  existsAt,
  git,
  prRange,
  treeFiles,
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

    test("records theme-reveal motion under the reproduced timing condition", async ({
      browser,
    }) => {
      chromiumOnly();
      test.setTimeout(5 * 60_000);
      const fx = fixture();
      const only: Only = {
        rows: ["fx/header"],
        widths: ["1440"],
        themes: ["dark"],
        states: ["theme-reveal"],
        rm: false,
      };
      const missed = [
        "fx/header [theme-reveal, 1440, dark] motion page theme-reveal: expected grow@button[Switch to the dark theme] 560ms, got does not run",
        "fx/header [theme-reveal, 1440, dark] motion page -ua-view-transition-group-anim-root: expected none 250ms, got does not run",
      ];
      const failures = async (site: typeof checkSite, js: string) => {
        server.setDrift({ js });
        try {
          const result = await site({
            dir: CANVAS,
            baseURL: server.url,
            browser,
            only,
          });
          return result.failures.map(describeFailure);
        } finally {
          server.setDrift(null);
        }
      };

      // The harness as PRV-22 merged it, before PRV-25's fix.
      const old = tmp("fidelity-pre-fix-");
      try {
        const archive = spawnSync(
          "git",
          ["archive", "--format=tar", PRE_FIX, "scripts/boards"],
          { cwd: ROOT, env: cleanEnv(), maxBuffer: 1 << 28 }
        );
        expect(archive.status).toBe(0);
        const untar = spawnSync("tar", ["-x", "-C", old], {
          input: archive.stdout,
        });
        expect(untar.status).toBe(0);
        const preFix = createRequire(__filename)(
          path.join(old, "scripts/boards/check.ts")
        ) as { checkSite: typeof checkSite };
        // The reveal is ready only after the fixed wait has run out: the
        // pre-fix harness takes its record first and sees neither motion.
        expect(await failures(preFix.checkSite, LATE_REVEAL)).toEqual(missed);
      } finally {
        rmSync(old, { recursive: true, force: true });
      }

      // The fixed harness, under the same condition: both motions, within
      // the duration tolerance.
      expect(await failures(checkSite, LATE_REVEAL)).toEqual([]);

      // The fixed capture itself: the board's motions, and the reveal held
      // at the in-flight point the verifier's shot is taken at.
      const motion =
        fx.spec.boards["fx-dark-desktop.dc.html"].captures["dark/theme-reveal"]
          .motion;
      const site = async (js: string) => {
        const ctx = await siteContext(browser, fx.sections, server.url, {
          width: "1440",
          reducedMotion: false,
        });
        const page = await ctx.newPage();
        server.setDrift({ js });
        try {
          await load(page, "/", fx.sections.clock);
        } finally {
          server.setDrift(null);
        }
        return { ctx, page };
      };
      /** The dark row's reveal captured, and what the page then holds. */
      const reveal = async (js: string) => {
        const { ctx, page } = await site(js);
        try {
          const capture = await captureState(
            page,
            fx.sections,
            rowQueries(
              fx.sections.rows.filter((r) => r.built),
              fx.sections.rows,
              "site"
            ),
            { state: "theme-reveal", theme: "dark", toggle: true },
            "site"
          );
          const held = await page.evaluate(() =>
            document
              .getAnimations()
              .filter((a) => a.playState !== "finished")
              .map((a) => {
                const t = a.effect!.getComputedTiming();
                return {
                  name: (a as CSSAnimation).animationName,
                  state: a.playState,
                  at: Number(t.localTime) / Number(t.activeDuration),
                };
              })
          );
          const theme = await page.evaluate(
            () => document.documentElement.dataset.theme
          );
          return { capture, held, theme };
        } finally {
          await ctx.close();
        }
      };
      const halfway = [
        {
          name: "-ua-view-transition-group-anim-root",
          state: "paused",
          at: IN_FLIGHT_AT,
        },
        { name: "theme-reveal", state: "paused", at: IN_FLIGHT_AT },
      ];
      const frame = { at: IN_FLIGHT_AT, viewport: [0, 0, 1440, 900] };
      const late = await reveal(LATE_REVEAL);
      expect(late.capture.motion).toEqual(motion);
      expect(late.capture.frame).toEqual(frame);
      expect(late.held).toEqual(halfway);

      // The driver resuming 800 ms after the reveal is ready, longer than
      // either animation runs: both are still held at the midpoint, armed
      // before the step and held in the page the moment the reveal is ready.
      const slow = await reveal(SLOW_DRIVER);
      expect(slow.capture.motion).toEqual(motion);
      expect(slow.capture.frame).toEqual(frame);
      expect(slow.held).toEqual(halfway);
      expect(await failures(checkSite, SLOW_DRIVER)).toEqual([]);

      // A short transition, not held, plays and is torn down (its
      // animations cancelled to idle) before the recorder's frames come
      // round, as on a slow host: it still counts as run.
      const short = await measuredPage(browser);
      try {
        const ran = await short.evaluate(async () => {
          const f = (
            window as unknown as {
              __fidelity: {
                motionStart(): void;
                transitionReady(): Promise<void>;
                motionTake(s: unknown): { name: string; duration: number }[];
              };
            }
          ).__fidelity;
          const style = document.createElement("style");
          style.textContent =
            "::view-transition-group(*), ::view-transition-image-pair(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 1ms !important; }";
          document.head.append(style);
          // Every animation frame callback runs three frames late.
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => raf(() => raf(() => raf(cb)));
          f.motionStart();
          const t = document.startViewTransition(() => {
            document.querySelector("h1")!.textContent = "Changed";
          });
          await f.transitionReady();
          await t.finished;
          const live = document
            .getAnimations()
            .filter((a) =>
              (a.effect as KeyframeEffect).pseudoElement?.startsWith(
                "::view-transition"
              )
            ).length;
          const taken = f.motionTake({
            rows: [{ id: "r", selector: "#r", exclude: [], named: [] }],
            keys: { heading: "h1", text: "p" },
          });
          return { live, names: taken.map((m) => `${m.name} ${m.duration}`) };
        });
        expect(ran.live).toBe(0);
        expect(ran.names).toContain("-ua-view-transition-group-anim-root 1");
      } finally {
        await short.close();
      }

      // A reveal the page skips once it is ready never plays: the theme
      // still switches, and neither motion counts.
      const skipped = await site(SKIP_ON_READY);
      try {
        const page = skipped.page;
        const theme = () =>
          page.evaluate(() => document.documentElement.dataset.theme);
        await runSteps(page, fx.sections.theme.light);
        await expect.poll(theme).toBe("dark");
        await runSteps(page, fx.sections.theme.dark);
        await expect.poll(theme).toBe("light");
      } finally {
        await skipped.ctx.close();
      }
      const cancelled = await reveal(SKIP_ON_READY);
      expect(cancelled.capture.motion).toEqual([]);
      expect(cancelled.theme).toBe("light");
      const skips = await failures(checkSite, SKIP_ON_READY);
      expect(skips).toEqual(expect.arrayContaining(missed));

      // A page whose reveal really does not run still fails: no view
      // transition, the theme toggle still switching the theme.
      const still = await site(NO_VIEW_TRANSITION);
      try {
        await runSteps(still.page, fx.sections.theme.light);
        const theme = await still.page.evaluate(
          () => document.documentElement.dataset.theme
        );
        expect(theme).toBe("dark");
      } finally {
        await still.ctx.close();
      }
      const none = await failures(checkSite, NO_VIEW_TRANSITION);
      expect(none).toEqual(expect.arrayContaining(missed));
    });
  });
});

/** The fidelity harness before PRV-25: PRV-22's merge commit on main. */
const PRE_FIX = "f0f08ab405cad5a5acf45f9a8e8e8f63b7485f56";

/**
 * PRV-25's timing condition, injected into the fixture site: the page's
 * second view transition (the dark row's reveal, after the toggle into dark)
 * holds its DOM update until the harness next calls its recorder, so the
 * reveal is ready only after the harness's fixed wait has run out, however
 * fast the host is. Chromium keeps running frames while a transition's
 * update is pending, so the wait of three frames and 60 ms runs out just as
 * it does when a loaded host makes the reveal late.
 */
const LATE_REVEAL = `(() => {
  const start = Document.prototype.startViewTransition;
  let n = 0;
  Document.prototype.startViewTransition = function (update) {
    if (++n !== 2) return start.call(this, update);
    const f = window.__fidelity;
    const calls = ["transitionReady", "motionTake"].filter((k) => k in f);
    const own = Object.fromEntries(calls.map((k) => [k, f[k]]));
    let release;
    const held = new Promise((r) => (release = r));
    for (const k of calls)
      f[k] = function (...args) {
        Object.assign(f, own);
        release();
        return own[k].apply(this, args);
      };
    return start.call(this, () => held.then(update));
  };
})();`;

/**
 * A slow driver: the harness's wait for the dark row's reveal returns 800 ms
 * after the reveal is ready, longer than either of its animations runs.
 */
const SLOW_DRIVER = `(() => {
  const f = window.__fidelity;
  const start = Document.prototype.startViewTransition;
  let n = 0;
  let late = false;
  Document.prototype.startViewTransition = function (update) {
    if (++n === 2) late = true;
    return start.call(this, update);
  };
  const ready = f.transitionReady;
  f.transitionReady = async function (...args) {
    await ready.apply(this, args);
    if (!late) return;
    late = false;
    await new Promise((r) => setTimeout(r, 800));
  };
})();`;

/**
 * The page skips the dark row's reveal in its own ready callback: the theme
 * switches, and the reveal never plays.
 */
const SKIP_ON_READY = `(() => {
  const start = Document.prototype.startViewTransition;
  let n = 0;
  Document.prototype.startViewTransition = function (update) {
    const t = start.call(this, update);
    if (++n === 2) t.ready.then(() => t.skipTransition());
    return t;
  };
})();`;

/** No view transition at all: the toggle switches the theme in one step. */
const NO_VIEW_TRANSITION =
  'Object.defineProperty(document, "startViewTransition", { value: undefined });';

type Want = Partial<Omit<Failure, "property">> & { property: string | RegExp };
type CheckOptionsBoards = Parameters<typeof checkSite>[0]["boards"];
