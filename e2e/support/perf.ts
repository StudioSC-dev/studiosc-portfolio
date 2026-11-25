import type { Browser, Request } from "@playwright/test";
import { stubVercelInsights } from "./page";

/** The routes with a first-load JS budget and a layout-shift budget. */
export const BUDGET_ROUTES = [
  "/",
  "/work",
  "/work/tallyandtrace",
  "/blog",
  "/blog/tallyandtrace-performance",
  "/about",
] as const;

const STUBBED = /\/_vercel\/(?:insights|speed-insights)\//;

/**
 * First-load JS: the total transferred (encoded) response-body bytes of the
 * script requests that finish between navigation and the first network idle,
 * in a fresh Chromium context. The stubbed Vercel scripts are not counted.
 */
export interface FirstLoad {
  /** The navigation's HTTP status. */
  status: number;
  /** How many script responses were counted. */
  scripts: number;
  bytes: number;
}

export async function firstLoadJs(
  browser: Browser,
  baseURL: string,
  route: string
): Promise<FirstLoad> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await stubVercelInsights(page);
    const scripts: Request[] = [];
    page.on("requestfinished", (request) => {
      if (request.resourceType() === "script" && !STUBBED.test(request.url())) {
        scripts.push(request);
      }
    });
    const response = await page.goto(route, { waitUntil: "networkidle" });
    const finished = [...scripts];
    let bytes = 0;
    for (const request of finished) {
      bytes += (await request.sizes()).responseBodySize;
    }
    return { status: response?.status() ?? 0, scripts: finished.length, bytes };
  } finally {
    await context.close();
  }
}

/**
 * The summed layout-shift score from navigation to `settleMs` after the load
 * event, with no interaction, in a fresh context.
 */
export async function layoutShift(
  browser: Browser,
  baseURL: string,
  route: string,
  settleMs = 5000
): Promise<number> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await stubVercelInsights(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __layoutShift: number };
      w.__layoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) w.__layoutShift += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(settleMs);
    return await page.evaluate(
      () => (window as unknown as { __layoutShift: number }).__layoutShift
    );
  } finally {
    await context.close();
  }
}

/**
 * The largest budget a route may have: far above any real first load, and
 * small enough that the 3% threshold stays a finite, meaningful number.
 */
export const MAX_BUDGET_BYTES = 10 * 1024 * 1024;

/**
 * Why a perf baseline is invalid: `measured_sha` must be a commit id, and
 * `original` and `current` must each hold exactly the budget routes, every
 * value a positive whole number of bytes no more than MAX_BUDGET_BYTES.
 * Empty when it is valid.
 */
export function baselineProblems(baseline: unknown): string[] {
  const problems: string[] = [];
  const b = (baseline ?? {}) as Record<string, unknown>;
  if (
    typeof b.measured_sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(b.measured_sha)
  ) {
    problems.push("measured_sha is not a full commit id");
  }
  const routes = [...BUDGET_ROUTES].sort();
  for (const key of ["original", "current"]) {
    const map = b[key];
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      problems.push(`${key} is not an object`);
      continue;
    }
    const keys = Object.keys(map).sort();
    if (JSON.stringify(keys) !== JSON.stringify(routes)) {
      problems.push(`${key} does not hold exactly the budget routes`);
    }
    for (const [route, value] of Object.entries(map)) {
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > MAX_BUDGET_BYTES
      ) {
        problems.push(
          `${key} ${route} is not a whole number of bytes from 1 to ${MAX_BUDGET_BYTES}`
        );
      }
    }
  }
  return problems;
}
