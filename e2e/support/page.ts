import type { Page } from "@playwright/test";

/**
 * Vercel's analytics scripts exist only on Vercel; `next start` answers 404.
 * The suite stubs exactly these two paths with an empty script, and nothing
 * else.
 */
export async function stubVercelInsights(page: Page): Promise<void> {
  await page.route(/\/_vercel\/(?:insights|speed-insights)\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    })
  );
}

/** Collects console errors and uncaught page errors as they happen. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
  return errors;
}

/**
 * Where a redirect leads: its full Location (path and query) resolved against
 * the URL that answered. Throws when it leaves `origin`, so a redirect off the
 * site can never pass by landing on a local path of the same name.
 */
export function nextHop(
  current: string,
  location: string | undefined,
  origin: string
): URL {
  if (!location) throw new Error("a redirect without a Location header");
  const next = new URL(location, current);
  if (next.origin !== origin) {
    throw new Error(`a redirect off the site, to ${next.origin}`);
  }
  return next;
}
