import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const SLUG = "tallyandtrace-columnar-pad-redesign";
const FILE = path.join(process.cwd(), "content", "blog", `${SLUG}.mdx`);
const source = readFileSync(FILE, "utf8");
const { data, content } = matter(source);

test.describe("Tally & Trace columnar pad post", () => {
  test("frontmatter is valid and links the T&T project", () => {
    expect(String(data.title).trim().length).toBeGreaterThan(0);
    expect(String(data.description).trim().length).toBeGreaterThan(0);
    expect(typeof data.date === "string" ? data.date : "").toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
    expect(data.author).toBe("Seth");
    expect(data.category).toBe("technical");
    expect(data.projectSlug).toBe("tallyandtrace");
  });

  test("post builds and is listed", async ({ page, request }) => {
    const res = await request.get(`/blog/${SLUG}`);
    expect(res.status()).toBe(200);

    await page.goto(`/blog/${SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: String(data.title) })
    ).toBeVisible();

    await page.goto("/blog");
    await expect(page.locator(`a[href="/blog/${SLUG}"]`).first()).toBeVisible();
  });

  test("post contains nothing private", () => {
    const denied: Record<string, RegExp> = {
      paths: /\/srv\/|\/home\/|\/Users\//,
      labDomain: /LAB_DOMAIN/,
      hosts: /localhost|\.lan\b|\.local\b|\.internal\b|192\.168\./,
      ipv4: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
      ten: /\b10\./,
      env: /\.env\b/,
      secrets: /sk-|ghp_|Bearer /,
      tools:
        /\b(Trailhead|Linear|harness|ui-verify|Jev|Sol|Codex|DeepSeek|Hermes|Vaultwarden|GSS)\b/i,
      tickets: /\b(T4-\d+|STU-\d+|PHB-\d+)\b/,
      fileRef: /\w\.(tsx?|jsx?|mdx?|py|css):\d+/,
      handles: /@/,
    };
    for (const [name, re] of Object.entries(denied)) {
      expect(source, `denylist hit: ${name}`).not.toMatch(re);
    }

    // Every paragraph or list item with a peso figure must say it is made up.
    const blocks = content.split(/\n\s*\n/);
    for (const block of blocks) {
      if (/₱\s?\d/.test(block)) {
        expect(block, `unlabelled figure: ${block.slice(0, 60)}`).toMatch(
          /made[- ]up|invented/i
        );
      }
    }
    expect(content).toMatch(/made up/i);
  });

  test("post covers the redesign story", () => {
    const sections = content.split(/^## /m).slice(1);
    const bySection = new Map(
      sections.map((s) => {
        const [head, ...rest] = s.split("\n");
        return [head.trim(), rest.join("\n")] as const;
      })
    );
    const required = [
      "What looks generated",
      "How the audit measured it",
      "Two directions",
      "Why the ledger pad",
      "Five decisions",
      "How each change was proved",
      "What is left",
    ];
    for (const heading of required) {
      const body = bySection.get(heading);
      expect(body, `missing H2: ${heading}`).toBeDefined();
      const words = (body ?? "").split(/\s+/).filter(Boolean).length;
      expect(words, `${heading} too short`).toBeGreaterThanOrEqual(40);
    }
    const decisions = bySection.get("Five decisions") ?? "";
    expect(decisions.match(/^### /gm)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  test("images are safe and described", () => {
    const md = source.match(/!\[[^\]]*\]\([^)]*\)/g) ?? [];
    const html = source.match(/<img\b[^>]*>/gi) ?? [];
    // No images: the post carries none. If images are added, each needs alt text.
    expect(md.length + html.length).toBe(0);
  });

  // Scope check against the branch base; set POST_SCOPE_BASE to run it.
  test("post change stays within scope", () => {
    const base = process.env.POST_SCOPE_BASE;
    test.skip(!base, "POST_SCOPE_BASE not set");
    const files = execFileSync(
      "git",
      ["diff", "--name-only", `${base}...HEAD`],
      { encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);
    const allowed = new Set([
      `content/blog/${SLUG}.mdx`,
      "e2e/blog-columnar-pad.spec.ts",
    ]);
    for (const f of files) {
      expect(allowed.has(f), `out of scope: ${f}`).toBe(true);
    }
    expect(files).toContain(`content/blog/${SLUG}.mdx`);
  });
});
