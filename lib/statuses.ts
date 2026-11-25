/**
 * The fixed set of project statuses. Every status shown anywhere on the site
 * comes from here, so a new word cannot appear without being added to this set.
 */
export const STATUS_KEYS = [
  "live",
  "in-qa",
  "in-development",
  "tested-by-us",
] as const;

export type ProjectStatus = (typeof STATUS_KEYS)[number];

export interface StatusInfo {
  /** The word shown on badges and /work group headings. */
  label: string;
  /** The wording used on a range plate. */
  plateLabel: string;
}

export const STATUSES: Record<ProjectStatus, StatusInfo> = {
  live: { label: "Live", plateLabel: "Live" },
  "in-qa": { label: "In QA", plateLabel: "In QA with Christine" },
  "in-development": {
    label: "In development",
    plateLabel: "In development",
  },
  "tested-by-us": { label: "Tested by us", plateLabel: "Tested by us" },
};

/** Display order, most finished first. */
export const STATUS_ORDER: readonly ProjectStatus[] = STATUS_KEYS;
