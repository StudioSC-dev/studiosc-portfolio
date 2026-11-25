/**
 * True and false fixtures for every denylist rule. All values are synthetic.
 * Secret-shaped strings are assembled at runtime so no file in the repo holds
 * one that a secret scanner would mistake for a real key.
 */

/** A synthetic key body of `n` characters. */
const body = (n: number) => "EXAMPLE0".repeat(Math.ceil(n / 8)).slice(0, n);

export interface RuleFixtures {
  /** The repo-relative file the samples are checked as. */
  file: string;
  matches: string[];
  passes: string[];
}

export const DENYLIST_FIXTURES: Record<string, RuleFixtures> = {
  path: {
    file: "content/blog/example.mdx",
    matches: [
      "/srv/Personal/project",
      "cd /home/someone/work",
      "keys live in ~/.config/keys/",
      "see ~/.claude/settings.json",
      "scratch at /tmp/claude-1000/session",
      "(/srv/data)",
    ],
    passes: [
      "components/home/RangeHome.tsx",
      "/preview/home",
      "app/preview/home/page.tsx",
      "https://example.com/home/",
      "/tmp/build-output",
      "~/.bashrc",
    ],
  },
  "lab domain": {
    file: "docs/example.md",
    matches: [
      "LAB_DOMAIN",
      "grafana.${LAB_DOMAIN}",
      "set LAB_DOMAIN in the env",
    ],
    passes: ["lab domain", "LAB_DOMAINS", "MY_LAB_DOMAIN_NAME", "labdomain"],
  },
  "private IP": {
    file: "content/blog/example.mdx",
    matches: [
      "10.0.0.5",
      "http://192.168.1.20:8080",
      "172.16.0.1",
      "172.31.255.254",
    ],
    passes: [
      "127.0.0.1",
      "localhost:3000",
      "172.32.0.1",
      "11.0.0.1",
      "v10.2.3",
      "8.8.8.8",
    ],
  },
  "lab host": {
    file: "content/blog/example.mdx",
    matches: ["nas.lan", "http://grafana.internal/", "pi.home.arpa"],
    passes: [
      "localhost",
      "studiosc.dev",
      "lantern.example.com",
      "internal tools",
      "an .internal suffix",
    ],
  },
  "env file": {
    file: "app/example.tsx",
    matches: [
      ".env",
      "cp .env.local first",
      ".env.production",
      'readFileSync(".env")',
      "load('./.env.local')",
      "path.join(root, `.env.test`)",
      "config/.env",
    ],
    passes: [
      "process.env.RESEND_API_KEY",
      "import.meta.env.MODE",
      "environment",
      "the dotenv package",
      "a .envrc file",
    ],
  },
  "secret prefix": {
    file: "content/blog/example.mdx",
    matches: [
      "sk-" + body(24),
      "sk_live_" + body(20),
      "ghp_" + body(36),
      "github_pat_" + body(24),
      "xox" + "b-" + body(12),
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "lin_api_" + body(24),
      "re_" + body(24),
    ],
    passes: [
      "sk-short",
      "task-runner-configuration-value",
      "re_render",
      "AKIA",
      "ghp_short",
    ],
  },
  phone: {
    file: "content/blog/example.mdx",
    matches: [
      "09171234567",
      "0917 123 4567",
      "0917-123-4567",
      "+639171234567",
      "+63 917 123 4567",
      "+1 415 555 0134",
      "+44 20 7946 0958",
      "+14155550134",
      "call +442079460958 today",
    ],
    passes: [
      "2026-11-19",
      "2026-11-19T10:00:00+08:00",
      "1,234,567.89",
      "₱12,345.00",
      "v20.11.1",
      "port 3000",
      "build 0917",
      "1e+10",
      "+08:00",
      "+1234",
    ],
  },
};

/** Files the env-file rule does not apply to, even with an env file name. */
export const ENV_RULE_EXEMPT = ["README.md", "CLAUDE.md", ".gitignore"];
