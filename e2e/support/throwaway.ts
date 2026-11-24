import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, cleanEnv, type Env } from "./git";

export interface RunResult {
  status: number | null;
  /** stdout and stderr together. */
  output: string;
}

export interface Throwaway {
  dir: string;
  /** Runs a command in `cwd` (the repo by default) without GIT_* variables. */
  run(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Env; input?: string }
  ): RunResult;
  /** Runs git, throwing when it fails. */
  git(args: string[], opts?: { cwd?: string; env?: Env }): string;
  write(file: string, content: string | Buffer): void;
  remove(): void;
}

/**
 * A throwaway git repo holding copies of some of this repo's files, with this
 * repo's node_modules linked in and husky's hooks installed. The copied files
 * are committed first, before the hooks exist.
 */
export function throwawayRepo(files: string[], prefix: string): Throwaway {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  const dir = path.join(root, "repo");
  mkdirSync(dir);
  const run: Throwaway["run"] = (cmd, args, opts = {}) => {
    const result = spawnSync(cmd, args, {
      cwd: opts.cwd ?? dir,
      env: cleanEnv({ HUSKY: undefined, ...opts.env }),
      input: opts.input,
      encoding: "utf8",
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  };
  const git: Throwaway["git"] = (args, opts = {}) => {
    const result = run("git", args, opts);
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed:\n${result.output}`);
    }
    return result.output;
  };
  const write: Throwaway["write"] = (file, content) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };

  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "Throwaway"]);
  git(["config", "user.email", "throwaway@example.com"]);
  git(["config", "commit.gpgsign", "false"]);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  write(".gitignore", "node_modules\n");
  symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  git(["add", "--", ".gitignore", ...files]);
  git(["commit", "-q", "-m", "scaffold"]);
  const husky = run(path.join(dir, "node_modules/.bin/husky"), []);
  if (husky.status !== 0) throw new Error(`husky failed:\n${husky.output}`);

  return {
    dir,
    run,
    git,
    write,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
