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
export function headSha(): string {
  const fromEnv = process.env.PR_HEAD_SHA?.trim();
  return git(["rev-parse", "--verify", `${fromEnv || "HEAD"}^{commit}`]).trim();
}

/**
 * The pull request base: PR_BASE_SHA when set, otherwise the merge base of
 * HEAD and origin/main. On main itself this is HEAD.
 */
export function baseSha(): string {
  const fromEnv = process.env.PR_BASE_SHA?.trim();
  if (fromEnv) {
    return git(["rev-parse", "--verify", `${fromEnv}^{commit}`]).trim();
  }
  return git(["merge-base", "HEAD", "origin/main"]).trim();
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
