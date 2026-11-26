import type { FragmentId } from "@/content/range";
import { centralCommand } from "./central-command";
import { portfolioSite } from "./portfolio-site";
import { routeChecks } from "./route-checks";
import { tallyandtrace } from "./tallyandtrace";
import type { Fragment } from "./types";

/**
 * The fragments built so far, by id. A plate whose fragment is missing here
 * draws only its frame and title; PRV-6 and PRV-7 add the rest.
 */
export const FRAGMENTS: Partial<Record<FragmentId, Fragment>> = {
  "central-command": centralCommand,
  tallyandtrace,
  "portfolio-site": portfolioSite,
  "route-checks": routeChecks,
};
