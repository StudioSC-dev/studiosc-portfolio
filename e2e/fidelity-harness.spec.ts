import { spawnSync } from "node:child_process";
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
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { checkSite, pairName, type Only } from "../scripts/boards/check";
import {
  describe as describeFailure,
  type Failure,
} from "../scripts/boards/compare";
import {
  checkSections,
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
  CANVAS,
  RUNTIME,
  startFixtureServer,
  type FixtureServer,
} from "./fixtures/fidelity/server";
import { DRIFTS } from "./fixtures/fidelity/drifts";
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

/** The environment for a child run: no git, CI or Playwright worker variables. */
function childEnv(extra: Record<string, string | undefined> = {}) {
  const env = cleanEnv();
  for (const key of Object.keys(env))
    if (
      /^(TEST_|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|FIDELITY_|FIXTURE_|UI_VERIFY|BOARDS_)/.test(
        key
      )
    )
      delete env[key];
  for (const key of ["CI", "GITHUB_EVENT_NAME", "PR_HEAD_SHA", "PR_BASE_SHA"])
    delete env[key];
  return { ...env, ...extra };
}

const regen = (dir: string, env: Record<string, string>, args: string[] = []) =>
  spawnSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    [path.join(ROOT, "scripts/boards-regen.ts"), "--dir", dir, ...args],
    { cwd: ROOT, env: childEnv(env), encoding: "utf8", timeout: 15 * 60_000 }
  );

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
      const env = {
        BOARDS_CACHE: cache,
        BOARDS_RUNTIME_URL: `${server.url}/published/support.js`,
      };
      expect(existsSync(cache)).toBe(false);
      const first = regen(work, env);
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
          "Three made-up pictures.",
          "Three made-up pictures, changed."
        )
      );
      const manifest = readJson<Manifest>(path.join(work, "manifest.json"));
      manifest.boards[changed].sha256 = sha256(readFileSync(boardFile));
      writeFileSync(
        path.join(work, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      const before = snapshot(work);
      const specBefore = readSpec(path.join(work, "spec.json"));
      const second = regen(work, env, ["--board", changed]);
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

      // A fetched runtime one byte off: non-zero, the sha256 named, nothing written.
      const bad = flipByte(readFileSync(RUNTIME));
      server.setRuntime(bad);
      const emptyCache = path.join(dir, "cache-2");
      const held = snapshot(work);
      const fetched = regen(work, { ...env, BOARDS_CACHE: emptyCache });
      expect(fetched.status).not.toBe(0);
      expect(fetched.stderr).toContain(sha256(bad));
      expect(fetched.stderr).toContain(pinned);
      expect(snapshot(work)).toEqual(held);
      expect(existsSync(path.join(emptyCache, "support.js"))).toBe(false);

      // A cached runtime one byte off: the same.
      mkdirSync(path.join(dir, "cache-3"));
      writeFileSync(path.join(dir, "cache-3", "support.js"), bad);
      const cached = regen(work, {
        ...env,
        BOARDS_CACHE: path.join(dir, "cache-3"),
      });
      expect(cached.status).not.toBe(0);
      expect(cached.stderr).toContain(sha256(bad));
      expect(snapshot(work)).toEqual(held);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
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

      type Case = [drift: string, only: Only, want: Want | "pass"];
      const opener = (w: (typeof W)[keyof typeof W], rm = false): Only => ({
        ...w,
        rows: ["fx/opener"],
        states: ["default"],
        rm,
      });
      const L1 = refRow("1440", "light", "default", "fx/opener");
      const L3range = refRow("390", "light", "default", "fx/range");
      const L3gallery = refRow("390", "light", "default", "fx/gallery");
      const gapL3 = L3gallery.box[1] - (L3range.box[1] + L3range.box[3]);
      const D3img = refRow("390", "dark", "default", "fx/gallery").keys.find(
        (k) => k.key === "image:0"
      )!;
      const L3img = refRow("390", "light", "default", "fx/gallery").keys.find(
        (k) => k.key === "image:0"
      )!;
      const cases: Case[] = [
        // One thing each, named with its value.
        [
          "moved-10",
          opener(W.L1),
          {
            section: "fx/opener",
            state: "default",
            width: "1440",
            theme: "light",
            property: "box x",
            expected: L1.box[0],
            actual: L1.box[0] + 10,
          },
        ],
        [
          "order-swap",
          {
            ...W.D3,
            rows: ["fx/range", "fx/gallery"],
            states: ["default"],
            rm: false,
          },
          {
            section: "fx/range",
            width: "390",
            theme: "dark",
            property: "order",
            expected: "fx/range, fx/gallery",
            actual: "fx/gallery, fx/range",
          },
        ],
        [
          "gap-6",
          {
            ...W.L3,
            rows: ["fx/range", "fx/gallery"],
            states: ["default"],
            rm: false,
          },
          {
            section: "fx/gallery",
            property: "gap after fx/range",
            expected: gapL3,
            actual: gapL3 + 6,
          },
        ],
        [
          "token",
          opener(W.D1),
          {
            property: "token --accent",
            theme: "dark",
            expected: "rgba(127, 162, 255, 1)",
            actual: "rgba(255, 0, 0, 1)",
          },
        ],
        [
          "font-size",
          opener(W.L1),
          { property: "key heading:0 font-size", expected: 56, actual: 57 },
        ],
        [
          "word",
          opener(W.D3),
          { property: "copy", width: "390", theme: "dark" },
        ],
        [
          "frame-narrower",
          { ...W.L3, rows: ["fx/gallery"], states: ["default"], rm: false },
          {
            property: "key image:0 width",
            expected: L3img.box[2],
            actual: L3img.box[2] - 10,
          },
        ],
        [
          "no-animation",
          opener(W.D1),
          {
            property: "motion heading:0 rise",
            expected: "enter y+ fade-in 560ms",
            actual: "does not run",
          },
        ],
        [
          "duration-doubled",
          { ...W.L3, rows: ["fx/range"], states: ["tab-2"], rm: false },
          {
            state: "tab-2",
            property: "motion frame:0 enter x+ fade-in duration",
            expected: "240ms",
            actual: "480ms",
          },
        ],
        [
          "wrong-side",
          { ...W.D1, rows: ["fx/range"], states: ["tab-2"], rm: false },
          {
            state: "tab-2",
            property: "motion frame:0 direction",
            expected: "plate-from-right enter x+ fade-in",
            actual: "plate-from-left enter x- fade-in",
          },
        ],
        [
          "rm-animation",
          opener(W.L1, true),
          {
            state: "default-rm",
            property: "reduced motion",
            expected: "no animation",
            actual: "rise on heading:0",
          },
        ],
        [
          "tab-dead",
          {
            ...W.L1,
            rows: ["fx/range"],
            states: ["default", "tab-2"],
            rm: false,
          },
          { state: "tab-2", property: "control", actual: "no visible change" },
        ],
        [
          "gallery-dead",
          {
            ...W.D3,
            rows: ["fx/gallery"],
            states: ["default", "gallery-2"],
            rm: false,
          },
          {
            state: "gallery-2",
            property: "control",
            actual: "no visible change",
          },
        ],
        [
          "filter-dead",
          {
            ...W.L3,
            rows: ["fx/list"],
            states: ["default", "filter-live"],
            rm: false,
          },
          {
            state: "filter-live",
            property: "control",
            actual: "no visible change",
          },
        ],
        [
          "toggle-dead",
          {
            widths: ["1440"],
            rows: ["fx/opener"],
            states: ["default"],
            rm: false,
          },
          {
            theme: "dark",
            property: "control",
            expected: '"Switch to the dark theme" switches the theme',
          },
        ],
        // Only the picture inside a frame changes: it passes.
        [
          "picture-only",
          {
            ...W.L1,
            rows: ["fx/gallery"],
            states: ["default", "gallery-2"],
            rm: false,
          },
          "pass",
        ],
        // Every other property in scope.
        [
          "font-family",
          opener(W.D3),
          {
            property: "key text:0 font-family",
            expected: "red hat text",
            actual: "serif",
          },
        ],
        [
          "font-weight",
          opener(W.L3),
          { property: "key heading:0 font-weight", expected: 600, actual: 700 },
        ],
        [
          "text-colour",
          opener(W.D1),
          { property: "key text:0 color", actual: "rgba(18, 52, 86, 1)" },
        ],
        [
          "background",
          { ...W.D1, rows: ["fx/range"], states: ["default"], rm: false },
          {
            property: "key control:0 background",
            actual: "rgba(18, 52, 86, 1)",
          },
        ],
        [
          "border",
          { ...W.L3, rows: ["fx/header"], states: ["default"], rm: false },
          { property: /^key control:\d+ border$/ },
        ],
        [
          "frame-ratio",
          { ...W.D1, rows: ["fx/gallery"], states: ["default"], rm: false },
          { property: "key image:0 aspect ratio" },
        ],
        [
          "frame-radius",
          { ...W.L3, rows: ["fx/gallery"], states: ["default"], rm: false },
          { property: "key image:0 radius", expected: "0px", actual: "4px" },
        ],
        [
          "frame-border",
          { ...W.D3, rows: ["fx/gallery"], states: ["default"], rm: false },
          { property: "key image:0 border", expected: D3img.border },
        ],
        // Each tolerance: at the limit passes, just beyond fails.
        ["x-at-limit", opener(W.L1), "pass"],
        ["x-beyond", opener(W.L1), { property: "box x" }],
        ["width-at-limit", opener(W.D1), "pass"],
        ["width-beyond", opener(W.D1), { property: "box width" }],
        ["height-at-limit", opener(W.L3), "pass"],
        ["height-beyond", opener(W.L3), { property: "box height" }],
        ["key-at-limit", opener(W.D3), "pass"],
        ["key-beyond", opener(W.D3), { property: "key text:0 y" }],
        [
          "gap-at-limit",
          {
            ...W.L1,
            rows: ["fx/range", "fx/gallery"],
            states: ["default"],
            rm: false,
          },
          "pass",
        ],
        [
          "gap-beyond",
          {
            ...W.L1,
            rows: ["fx/range", "fx/gallery"],
            states: ["default"],
            rm: false,
          },
          { property: "gap after fx/range" },
        ],
        ["line-height-at-limit", opener(W.D1), "pass"],
        [
          "line-height-beyond",
          opener(W.D1),
          { property: "key text:0 line-height" },
        ],
        [
          "tracking-at-limit",
          { ...W.L3, rows: ["fx/range"], states: ["default"], rm: false },
          "pass",
        ],
        [
          "tracking-beyond",
          { ...W.L3, rows: ["fx/range"], states: ["default"], rm: false },
          { property: /^key text:\d+ letter-spacing$/ },
        ],
        ["duration-at-limit", opener(W.D3), "pass"],
        [
          "duration-beyond",
          opener(W.D3),
          {
            property: "motion heading:0 enter y+ fade-in duration",
            expected: "560ms",
            actual: "701ms",
          },
        ],
      ];
      for (const [drift, only, want] of cases) {
        const result = await check(browser, drift, only);
        if (want === "pass") {
          expect(result.failures.map(describeFailure), drift).toEqual([]);
          expect(result.checked.length, drift).toBeGreaterThan(0);
        } else {
          expectFailure(result.failures, want, drift);
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

      // A later ticket's elements: hidden on the board only while an accepted
      // deviation names that ticket, and only until it merges.
      const headerOnly: Only = { ...only, rows: ["fx/header"] };
      const later: Deviation = {
        ...copy,
        id: "D3",
        section: ["fx/header"],
        property: "later",
        board: 'a[href^="/cv/"]',
        built: "absent",
        expires: "PRV-19",
      };
      expectFailure(
        (await run("cv-absent", [], [], headerOnly)).failures,
        { section: "fx/header", property: "copy" },
        "no later deviation"
      );
      expect(
        (
          await run("cv-absent", register([later]), [], headerOnly)
        ).failures.map(describeFailure)
      ).toEqual([]);
      expectFailure(
        (
          await run(
            "cv-absent",
            register([{ ...later, accepted: "" }]),
            [],
            headerOnly
          )
        ).failures,
        { property: "copy" },
        "unaccepted later"
      );
      expectFailure(
        (await run("cv-absent", register([later]), ["PRV-19"], headerOnly))
          .failures,
        { property: "copy" },
        "expired later"
      );
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
      // An undrawn width is skipped and listed, never failed.
      const skipped = broken((b) => (at(b).sources["390"] = null));
      expect(skipped.problems).toEqual([]);
      expect(skipped.undrawn).toContain(`${row} at 390`);
    });

    test("writes verifier pairs, fails on a mismatch, leaves the site unchanged", async () => {
      chromiumOnly();
      test.setTimeout(30 * 60_000);
      const only: Only = {
        rows: ["fx/opener", "fx/range"],
        states: ["default", "tab-2"],
        rm: false,
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
          for (const t of ["light", "dark"]) {
            want.push(pairName("fx/opener", "default", w, t));
            for (const s of ["default", "tab-2"])
              want.push(pairName("fx/range", s, w, t));
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
        /^(docs\/boards\/|e2e\/fidelity(-harness)?\.spec\.ts$|e2e\/fixtures\/fidelity\/|scripts\/boards[/.-]|package\.json$|\.gitignore$|\.prettierignore$|\.lintstagedrc\.json$|\.husky\/|\.github\/workflows\/ci\.yml$)/;
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
});

type Want = Partial<Omit<Failure, "property">> & { property: string | RegExp };
type CheckOptionsBoards = Parameters<typeof checkSite>[0]["boards"];
