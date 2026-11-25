/**
 * Runs a lint-staged formatter on the staged files outside the byte-exact
 * trees, so formatting never rewrites a board export or a fixture board.
 *
 *   tsx scripts/boards-staged.ts <command> [args...] <files...>
 *
 * lint-staged appends the staged files to the command. Every argument that
 * names a file inside an exact tree is dropped; when no file is left, the
 * formatter does not run at all.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Trees whose files are kept byte for byte as exported. */
export const EXACT_TREES = ["docs/boards/", "e2e/fixtures/fidelity/canvas/"];

/** Whether `file` (absolute, or relative to `root`) sits in an exact tree. */
export function isExact(file: string, root = process.cwd()): boolean {
  const rel = path
    .relative(root, path.resolve(root, file))
    .split(path.sep)
    .join("/");
  return EXACT_TREES.some((tree) => rel.startsWith(tree));
}

/** The command line left once exact-tree files are dropped, or null. */
export function filterArgs(
  args: string[],
  root = process.cwd()
): string[] | null {
  const [command, ...rest] = args;
  if (!command) return null;
  const isFile = (a: string) =>
    !a.startsWith("-") && existsSync(path.resolve(root, a));
  const kept = rest.filter((a) => !(isFile(a) && isExact(a, root)));
  if (!kept.some(isFile)) return null;
  return [command, ...kept];
}

function main(args: string[]): number {
  const line = filterArgs(args);
  if (!line) return 0;
  const run = spawnSync(line[0], line.slice(1), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return run.status ?? 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
