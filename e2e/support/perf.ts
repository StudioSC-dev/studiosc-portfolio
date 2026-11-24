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
export async function firstLoadJs(
  browser: Browser,
  baseURL: string,
  route: string
): Promise<number> {
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
    await page.goto(route, { waitUntil: "networkidle" });
    const finished = [...scripts];
    let total = 0;
    for (const request of finished) {
      total += (await request.sizes()).responseBodySize;
    }
    return total;
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
