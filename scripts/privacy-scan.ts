/**
 * Pre-push privacy scan. Before a push, it scans every commit the push makes
 * newly reachable on the destination. For each commit it takes the files that
 * commit adds or changes against its first parent (a root commit against the
 * empty tree) and scans their full content as that commit leaves it, so a
 * value added and removed within one push is still caught, and so is one that
 * line wrapping or two commits split across lines. Text is checked against
 * the generic denylist (e2e/support/denylist.ts) and the owner's private
 * list, read from the file PREFLIGHT_PRIVATE_LIST names; binary content
 * against the private list.
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
import {
  DENYLIST,
  isBinary,
  scanLine,
  scanText,
} from "../e2e/support/denylist";

export class Refusal extends Error {}

export interface PrivateEntry {
  /** The entry's line number in the private list. */
  line: number;
  value: string;
}

export interface ScanHit {
  file: string;
  line: number;
  rule: string;
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
  } catch {
    // Git's own message can carry the destination URL or a path, so it is
    // never shown.
    throw new Refusal(`git ${args[0]} failed`);
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

/** Lowercases and folds every whitespace run, newlines included, to one space. */
function fold(text: string): { folded: string; lines: number[] } {
  let folded = "";
  const lines: number[] = [];
  let line = 1;
  let inSpace = false;
  for (const char of text) {
    if (/\s/.test(char)) {
      if (!inSpace && folded) {
        folded += " ";
        lines.push(line);
      }
      inSpace = true;
    } else {
      folded += char.toLowerCase();
      lines.push(line);
      inSpace = false;
    }
    if (char === "\n") line++;
  }
  return { folded, lines };
}

/**
 * Private-list hits in a text, case-insensitive. A value matches even when
 * line wrapping or extra spaces split it at whitespace; the hit names the
 * line the value starts on.
 */
export function findPrivate(
  file: string,
  text: string,
  privateList: PrivateEntry[]
): ScanHit[] {
  const { folded, lines } = fold(text);
  const hits: ScanHit[] = [];
  for (const entry of privateList) {
    const needle = fold(entry.value).folded;
    if (!needle) continue;
    const seen = new Set<number>();
    for (
      let at = folded.indexOf(needle);
      at !== -1;
      at = folded.indexOf(needle, at + 1)
    ) {
      if (seen.has(lines[at])) continue;
      seen.add(lines[at]);
      hits.push({
        file,
        line: lines[at],
        rule: `private list entry on line ${entry.line}`,
      });
    }
  }
  return hits;
}

/**
 * Hits in one file's content as a commit leaves it. Text is scanned whole:
 * every line against the denylist and the full text against the private list,
 * so a value split across lines or between commits is still found. Binary
 * content is checked against the private list only.
 */
export function scanContent(
  file: string,
  content: Buffer,
  privateList: PrivateEntry[]
): ScanHit[] {
  const text = content.toString("utf8");
  if (isBinary(content)) {
    const lower = content.toString("latin1").toLowerCase();
    return privateList
      .filter(
        (e) =>
          lower.includes(e.value.toLowerCase()) ||
          text.toLowerCase().includes(e.value.toLowerCase())
      )
      .map((e) => ({
        file,
        line: 0,
        rule: `private list entry on line ${e.line} (binary file)`,
      }));
  }
  return [...scanText(file, text), ...findPrivate(file, text, privateList)];
}

/** Hits in a file's path itself: a name can publish a value too. */
export function scanName(file: string, privateList: PrivateEntry[]): ScanHit[] {
  return [
    ...scanLine(file, file, 0),
    ...findPrivate(file, file, privateList),
  ].map((hit) => ({ file, line: 0, rule: `${hit.rule} in the file name` }));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A path safe to print: private values and denylist matches masked. */
export function redactPath(file: string, privateList: PrivateEntry[]): string {
  let safe = file;
  for (const entry of privateList) {
    const words = entry.value.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (words.length) {
      safe = safe.replace(new RegExp(words.join("\\s+"), "gi"), "[private]");
    }
  }
  for (const rule of DENYLIST) {
    const flags = rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags}g`;
    safe = safe.replace(new RegExp(rule.pattern.source, flags), "[redacted]");
  }
  return safe;
}

export interface ChangedFile {
  path: string;
  blob: string;
}

/**
 * The files a commit adds or changes against its first parent (a root commit
 * against the empty tree), read from git's NUL-delimited raw output so no
 * path or line can be misparsed. Submodule entries carry no content.
 */
export function changedFiles(commit: string, emptyTree: string): ChangedFile[] {
  const short = commit.slice(0, 12);
  let raw: string;
  try {
    const parents = git(["rev-list", "--parents", "-n", "1", commit])
      .trim()
      .split(" ")
      .slice(1);
    raw = git([
      "diff-tree",
      "-r",
      "-z",
      "--raw",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      parents[0] ?? emptyTree,
      commit,
    ]);
  } catch {
    throw new Refusal(`cannot diff commit ${short}`);
  }
  const fields = raw.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(
      fields[i]
    );
    if (!m) throw new Refusal(`cannot read the diff of ${short}`);
    const [, , newMode, , newBlob, status] = m;
    if (status === "D" || newMode === "160000") continue;
    files.push({ path: fields[i + 1], blob: newBlob });
  }
  return files;
}

/** Reads blobs by id. Any blob that cannot be read refuses the push. */
export function readBlobs(ids: string[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  const unique = [...new Set(ids)];
  if (!unique.length) return blobs;
  let out: Buffer;
  try {
    out = execFileSync("git", ["cat-file", "--batch"], {
      input: unique.join("\n") + "\n",
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    throw new Refusal("cannot read the pushed files");
  }
  let pos = 0;
  for (const id of unique) {
    const eol = out.indexOf(0x0a, pos);
    const header = out.toString("utf8", pos, eol).split(" ");
    if (eol === -1 || header[0] !== id || header[1] !== "blob") {
      throw new Refusal("cannot read the pushed files");
    }
    const size = Number(header[2]);
    blobs.set(id, out.subarray(eol + 1, eol + 1 + size));
    pos = eol + 1 + size + 1;
  }
  return blobs;
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
  } catch {
    throw new Refusal("cannot list the destination's refs");
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
        } catch {
          throw new Refusal("cannot fetch a ref from the destination");
        }
      }
      if (!gitSucceeds(["cat-file", "-e", sha])) {
        throw new Refusal("a destination ref cannot be resolved");
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
  } catch {
    throw new Refusal("cannot work out which commits the push adds");
  }

  const emptyTree = git(["hash-object", "-t", "tree", "--stdin"], "").trim();
  const hits: PrivacyHit[] = [];
  for (const commit of commits) {
    const files = changedFiles(commit, emptyTree);
    const blobs = readBlobs(files.map((f) => f.blob));
    for (const file of files) {
      for (const hit of scanName(file.path, privateList)) {
        hits.push({ commit, ...hit });
      }
      for (const hit of scanContent(
        file.path,
        blobs.get(file.blob)!,
        privateList
      )) {
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
        const file = redactPath(h.file, privateList);
        console.error(
          h.line
            ? `  ${h.commit.slice(0, 12)} ${file}:${h.line} ${h.rule}`
            : `  ${h.commit.slice(0, 12)} ${file} ${h.rule}`
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
    console.error("privacy-scan: push refused: the scan failed");
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
