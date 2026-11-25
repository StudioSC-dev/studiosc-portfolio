/**
 * The generic privacy denylist. These patterns are the only committed copy;
 * the literal private values (the lab domain itself, lab hostnames, client
 * names, addresses) never live in this repo. They sit in the owner's private
 * list, which scripts/privacy-scan.ts reads from PREFLIGHT_PRIVATE_LIST.
 *
 * `localhost` and `127.0.0.1` are allowed: public loopback in a technical post
 * is not private.
 */

export interface DenyRule {
  name: string;
  pattern: RegExp;
  /** Repo-relative paths the rule applies to. Every path when absent. */
  appliesTo?: (file: string) => boolean;
}

export interface DenyHit {
  file: string;
  line: number;
  rule: string;
}

/** These files define or exercise the patterns, so they cannot pass them. */
export const SELF_EXCLUDED: readonly string[] = [
  "e2e/support/denylist.ts",
  "e2e/support/denylist.fixtures.ts",
  "e2e/blog-columnar-pad.spec.ts",
];

const APP_DIRS = ["app/", "components/", "content/", "lib/", "public/"];

export const DENYLIST: readonly DenyRule[] = [
  {
    // An absolute server or home-directory path (never inside a repo path
    // such as components/home/), a user-config path, or a session temp path.
    name: "path",
    pattern:
      /(?<![\w.-])\/(?:srv|home)\/|~\/\.(?:config|claude)\/|\/tmp\/claude-\d+/,
  },
  {
    // The token that stands for the lab domain. The value itself is private.
    name: "lab domain",
    pattern: /\bLAB_DOMAIN\b/,
  },
  {
    name: "private IP",
    pattern:
      /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/,
  },
  {
    name: "lab host",
    pattern: /\b[\w-]+\.(?:lan|internal|home\.arpa)\b/,
  },
  {
    // Developer docs (README.md, CLAUDE.md, .gitignore) may name env files;
    // the site's own source and content may not.
    name: "env file",
    // `.env` at the start of a word, a quote, a bracket or a path segment:
    // ".env", './.env.local', `config/.env`. Never `process.env`.
    pattern: /(?:^|[\s"'`(\[{=:,/])\.env(\.\w+)?\b/,
    appliesTo: (file) => APP_DIRS.some((dir) => file.startsWith(dir)),
  },
  {
    name: "secret prefix",
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_\w{16,}|ghp_\w{30,}|github_pat_\w{20,}|xox[abp]-[\w-]{10,}|AKIA[0-9A-Z]{16}|lin_api_\w{20,}|re_[A-Za-z0-9]{20,})/,
  },
  {
    // Philippine mobile numbers, local and +63, and other +-prefixed
    // international numbers, spaced or in unspaced E.164 form.
    name: "phone",
    pattern:
      /(?<![\w.+-])(?:(?:\+63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]?\d{3,4}|\+[1-9]\d{7,14})(?![\w-])/,
  },
];

/** The rules that apply to a repo-relative path. */
export function rulesFor(file: string): DenyRule[] {
  if (SELF_EXCLUDED.includes(file)) return [];
  return DENYLIST.filter((rule) => !rule.appliesTo || rule.appliesTo(file));
}

/** Every denylist hit in one line of `file`. */
export function scanLine(file: string, text: string, line: number): DenyHit[] {
  return rulesFor(file)
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({ file, line, rule: rule.name }));
}

/** Every denylist hit in a text file, line by line. */
export function scanText(file: string, text: string): DenyHit[] {
  return text
    .split(/\r?\n/)
    .flatMap((content, i) => scanLine(file, content, i + 1));
}

/** Git's own test for binary content: a NUL byte in the first 8000 bytes. */
export function isBinary(content: Buffer): boolean {
  return content.subarray(0, 8000).includes(0);
}
