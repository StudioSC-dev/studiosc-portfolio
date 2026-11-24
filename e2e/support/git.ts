import { execFileSync } from "node:child_process";
import path from "node:path";

/** The repository root. Playwright runs from it. */
export const ROOT = process.cwd();

/**
 * The environment for child processes, without any GIT_* variable. A suite
 * started from inside a git hook inherits GIT_DIR and friends, which would
 * point every child git command at the wrong repository.
 */
export type Env = Record<string, string | undefined>;

export function cleanEnv(extra: Env = {}): NodeJS.ProcessEnv {
  const env: Env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  // Next's types mark NODE_ENV as required; child processes do not need it.
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

/** Runs git and returns its stdout. Throws when git exits non-zero. */
export function git(
  args: string[],
  opts: { cwd?: string; input?: string | Buffer } = {}
): string {
  return execFileSync("git", args, {
    cwd: opts.cwd ?? ROOT,
    env: cleanEnv(),
    input: opts.input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Same as git(), but returns the raw stdout bytes. */
export function gitBuffer(args: string[], opts: { cwd?: string } = {}): Buffer {
  return execFileSync("git", args, {
    cwd: opts.cwd ?? ROOT,
    env: cleanEnv(),
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Whether git exits zero for these arguments. */
export function gitOk(args: string[], opts: { cwd?: string } = {}): boolean {
  try {
    git(args, opts);
    return true;
  } catch {
    return false;
  }
}

/** The commit under test: PR_HEAD_SHA when set (CI), otherwise HEAD. */
export function headSha(env: Env = process.env): string {
  const fromEnv = env.PR_HEAD_SHA?.trim();
  return git(["rev-parse", "--verify", `${fromEnv || "HEAD"}^{commit}`]).trim();
}

/**
 * The pull request base: PR_BASE_SHA when set, otherwise the merge base of
 * HEAD and origin/main. On main itself this is HEAD.
 */
export function baseSha(env: Env = process.env): string {
  const fromEnv = env.PR_BASE_SHA?.trim();
  if (fromEnv) {
    return git(["rev-parse", "--verify", `${fromEnv}^{commit}`]).trim();
  }
  return git(["merge-base", "HEAD", "origin/main"]).trim();
}

export interface PrRange {
  base: string;
  head: string;
}

/**
 * The pull request under test. In CI that is PR_BASE_SHA..PR_HEAD_SHA, and a
 * build without PR_HEAD_SHA (a push to main or develop) has none, so checks
 * that judge a PR's own changes do not run there. Locally it is
 * PR_BASE_SHA (or the merge base with origin/main) to PR_HEAD_SHA (or HEAD).
 */
export function prRange(env: Env = process.env): PrRange | null {
  if (env.CI && !env.PR_HEAD_SHA?.trim()) return null;
  return { base: baseSha(env), head: headSha(env) };
}

/**
 * Whether the pull request itself changes `file`: its head against the point
 * where it branched from the base, so a change made only on the base after
 * that point is not blamed on the PR.
 */
export function changedByPr(
  range: PrRange,
  file: string,
  opts: { cwd?: string } = {}
): boolean {
  const fork = git(["merge-base", range.base, range.head], opts).trim();
  return !gitOk(["diff", "--quiet", fork, range.head, "--", file], opts);
}

/** Whether `file` exists in the tree of `sha`. */
export function existsAt(sha: string, file: string): boolean {
  return gitOk(["cat-file", "-e", `${sha}:${file}`]);
}

/** Tracked files at HEAD, repo-relative, with forward slashes. */
export function trackedFiles(): string[] {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((f) => f.split(path.sep).join("/"));
}

export interface TreeFile {
  path: string;
  content: Buffer;
}

/** Every file in the tree of `sha`, with its committed content. */
export function treeFiles(sha = "HEAD"): TreeFile[] {
  const entries = git(["ls-tree", "-r", "-z", "--full-tree", sha])
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split("\t");
      const [, type, object] = meta.split(" ");
      return { type, object, path: file };
    })
    .filter((e) => e.type === "blob");
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: ROOT,
    env: cleanEnv(),
    input: entries.map((e) => e.object).join("\n") + "\n",
    maxBuffer: 1024 * 1024 * 1024,
  });
  const files: TreeFile[] = [];
  let pos = 0;
  for (const entry of entries) {
    const headerEnd = out.indexOf(0x0a, pos);
    const size = Number(out.subarray(pos, headerEnd).toString().split(" ")[2]);
    const start = headerEnd + 1;
    files.push({
      path: entry.path,
      content: out.subarray(start, start + size),
    });
    pos = start + size + 1;
  }
  return files;
}
