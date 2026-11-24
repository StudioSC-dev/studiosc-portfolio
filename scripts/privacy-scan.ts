/**
 * Pre-push privacy scan. Before a push, it scans every commit the push makes
 * newly reachable on the destination, each against its first parent (a root
 * commit against the empty tree), so a value added and removed within one
 * push is still caught. It checks the added lines of every text file against
 * the generic denylist (e2e/support/denylist.ts) and the owner's private list,
 * read from the file PREFLIGHT_PRIVATE_LIST names.
 *
 *   .husky/pre-push runs: tsx scripts/privacy-scan.ts --pre-push <remote> <url>
 *   with git's "<local ref> <local sha> <remote ref> <remote sha>" lines on stdin.
 *
 * It fails closed: an unset or unreadable private list, a destination it
 * cannot query, reachability it cannot work out or a diff it cannot read all
 * refuse the push. A hit names the commit, file, line and rule, never the
 * value.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { scanLine } from "../e2e/support/denylist";

export class Refusal extends Error {}

export interface PrivateEntry {
  /** The entry's line number in the private list. */
  line: number;
  value: string;
}

export interface AddedLine {
  file: string;
  line: number;
  text: string;
}

export interface PrivacyHit {
  commit: string;
  file: string;
  line: number;
  rule: string;
}

function git(args: string[], input?: string): string {
  try {
    return execFileSync("git", args, {
      input,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    const reason = stderr.trim().split("\n")[0] || (error as Error).message;
    throw new Refusal(`git ${args[0]} failed (${reason})`);
  }
}

function gitSucceeds(args: string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The real paths of this repository: its worktree, its git directories and
 * every other worktree of the same repository.
 */
function repositoryPaths(): string[] {
  const own = git([
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-dir",
    "--git-common-dir",
  ]);
  const worktrees = git(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
  return [...own.split("\n"), ...worktrees].filter(Boolean).map((p) => {
    try {
      return realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  });
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * The private list's entries: one per line; blank lines and # comments
 * skipped. The list must live outside the repository (symlinks resolved), so
 * it can never be committed with it.
 */
export function readPrivateList(): PrivateEntry[] {
  const file = process.env.PREFLIGHT_PRIVATE_LIST;
  if (!file) throw new Refusal("PREFLIGHT_PRIVATE_LIST is not set");
  let real: string;
  let text: string;
  try {
    real = realpathSync(file);
    text = readFileSync(real, "utf8");
  } catch {
    throw new Refusal("the file PREFLIGHT_PRIVATE_LIST names cannot be read");
  }
  if (repositoryPaths().some((repo) => isWithin(real, repo))) {
    throw new Refusal(
      "the private list must be kept outside the repository and its git directory"
    );
  }
  const entries = text
    .split(/\r?\n/)
    .map((value, i) => ({ line: i + 1, value: value.trim() }))
    .filter((e) => e.value && !e.value.startsWith("#"));
  if (!entries.length) throw new Refusal("the private list has no entries");
  return entries;
}

/** Denylist and private-list hits in one added line. */
export function scanAddedLine(
  added: AddedLine,
  privateList: PrivateEntry[]
): { file: string; line: number; rule: string }[] {
  const hits = scanLine(added.file, added.text, added.line);
  const lower = added.text.toLowerCase();
  for (const entry of privateList) {
    if (lower.includes(entry.value.toLowerCase())) {
      hits.push({
        file: added.file,
        line: added.line,
        rule: `private list entry on line ${entry.line}`,
      });
    }
  }
  return hits;
}

function unquotePath(raw: string): string {
  const name = raw.replace(/\t$/, "");
  if (!name.startsWith('"')) return name;
  try {
    return JSON.parse(name) as string;
  } catch {
    return name;
  }
}

/** The lines a commit adds to its text files, against its first parent. */
export function addedLines(commit: string, emptyTree: string): AddedLine[] {
  const parents = git(["rev-list", "--parents", "-n", "1", commit])
    .trim()
    .split(" ")
    .slice(1);
  const base = parents[0] ?? emptyTree;
  let diff: string;
  try {
    diff = git([
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--unified=0",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      base,
      commit,
    ]);
  } catch (error) {
    throw new Refusal(
      `cannot diff commit ${commit.slice(0, 12)}: ${(error as Error).message}`
    );
  }
  const added: AddedLine[] = [];
  let file: string | null = null;
  let line = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      file = null;
    } else if (text.startsWith("+++ ")) {
      const name = unquotePath(text.slice(4));
      file = name === "/dev/null" ? null : name.replace(/^b\//, "");
    } else if (text.startsWith("@@ ")) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (!match)
        throw new Refusal(`cannot read the diff of ${commit.slice(0, 12)}`);
      line = Number(match[1]);
    } else if (text.startsWith("+") && file) {
      added.push({ file, line, text: text.slice(1) });
      line++;
    }
  }
  return added;
}

interface RefUpdate {
  localRef: string;
  localSha: string;
}

function parseUpdates(stdin: string): RefUpdate[] {
  return stdin
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const m = /^(\S+) ([0-9a-f]{40,64}) (\S+) ([0-9a-f]{40,64})$/.exec(
        l.trim()
      );
      if (!m) throw new Refusal("cannot read the refs being pushed");
      return { localRef: m[1], localSha: m[2] };
    });
}

/** The commit-ish tips on the destination, fetching any missing locally. */
function destinationTips(destination: string): string[] {
  let listing: string;
  try {
    listing = git(["ls-remote", destination]);
  } catch (error) {
    throw new Refusal(
      `cannot list the destination's refs: ${(error as Error).message}`
    );
  }
  const tips: string[] = [];
  const fetched = new Set<string>();
  for (const row of listing.split("\n").filter(Boolean)) {
    const [sha, ref] = row.split("\t");
    if (!sha || !ref) throw new Refusal("cannot read the destination's refs");
    if (!gitSucceeds(["cat-file", "-e", sha])) {
      const name = ref.replace(/\^\{\}$/, "");
      if (!fetched.has(name)) {
        fetched.add(name);
        try {
          git([
            "fetch",
            "--quiet",
            "--no-tags",
            "--no-write-fetch-head",
            destination,
            name,
          ]);
        } catch (error) {
          throw new Refusal(
            `cannot fetch ${name}: ${(error as Error).message}`
          );
        }
      }
      if (!gitSucceeds(["cat-file", "-e", sha])) {
        throw new Refusal(`${ref} on the destination cannot be resolved`);
      }
    }
    // A tag of a tree or blob reaches no commits, so it excludes none.
    if (gitSucceeds(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`])) {
      tips.push(sha);
    }
  }
  return tips;
}

/** Scans the commits a push adds. Returns the hits; throws Refusal to refuse. */
export function scanPush(
  destination: string,
  stdin: string,
  privateList: PrivateEntry[]
): { commits: string[]; hits: PrivacyHit[] } {
  const pushed = parseUpdates(stdin)
    .map((u) => u.localSha)
    .filter((sha) => !/^0+$/.test(sha));
  // Deleting a ref publishes nothing.
  if (!pushed.length) return { commits: [], hits: [] };
  if (!destination) throw new Refusal("the push has no destination");

  const tips = destinationTips(destination);
  let commits: string[];
  try {
    commits = git(
      ["rev-list", "--stdin"],
      [...pushed, ...tips.map((t) => `^${t}`)].join("\n") + "\n"
    )
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    throw new Refusal(
      `cannot work out which commits the push adds: ${(error as Error).message}`
    );
  }

  const emptyTree = git(["hash-object", "-t", "tree", "--stdin"], "").trim();
  const hits: PrivacyHit[] = [];
  for (const commit of commits) {
    for (const added of addedLines(commit, emptyTree)) {
      for (const hit of scanAddedLine(added, privateList)) {
        hits.push({ commit, ...hit });
      }
    }
  }
  return { commits, hits };
}

function main(args: string[]): number {
  if (args[0] !== "--pre-push") {
    console.error("usage: privacy-scan.ts --pre-push <remote> <url> < refs");
    return 2;
  }
  const [, remote = "", url = ""] = args;
  try {
    const privateList = readPrivateList();
    const stdin = readFileSync(0, "utf8");
    const { commits, hits } = scanPush(url || remote, stdin, privateList);
    if (hits.length) {
      console.error(
        "privacy-scan: push refused. These commits add private values:"
      );
      for (const h of hits) {
        console.error(
          `  ${h.commit.slice(0, 12)} ${h.file}:${h.line} ${h.rule}`
        );
      }
      console.error(
        "The values are not shown. Remove them from those commits."
      );
      return 1;
    }
    console.error(
      `privacy-scan: scanned ${commits.length} commit(s), no private values`
    );
    return 0;
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`privacy-scan: push refused: ${error.message}`);
      return 1;
    }
    console.error(
      `privacy-scan: push refused: the scan failed (${(error as Error).message})`
    );
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
