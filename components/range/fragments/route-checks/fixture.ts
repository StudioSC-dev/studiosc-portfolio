/**
 * The route checks' made-up run (range-light-desktop at 1440, range-phone at
 * 390). Every path is a real route of this site, but the Pass results are
 * drawn, not read from any run.
 */
export interface RouteCheck {
  path: string;
  page: string;
  /** Whether the phone table keeps the route (it draws four). */
  phone: boolean;
}

export const ROUTES: readonly RouteCheck[] = [
  { path: "/", page: "Home", phone: true },
  { path: "/work", page: "Work", phone: true },
  { path: "/work/tallyandtrace", page: "Case study", phone: false },
  { path: "/blog", page: "Writing", phone: true },
  { path: "/about", page: "About", phone: false },
  { path: "/contact", page: "Contact", phone: true },
];

export const PHONE_ROUTES = ROUTES.filter((r) => r.phone);

/** The first tick lands after 150 ms; each next one 70 ms later. */
export const FIRST_DELAY_MS = 150;
export const STEP_MS = 70;

export const TABLE_LABEL = "Route checks from a made-up run";
export const CAPTION =
  "Route checks from a made-up run of this site's Playwright suite, at both widths. The ticks land as the run reports in.";
export const PHONE_CAPTION =
  "Route checks from a made-up run of this site's Playwright suite.";
