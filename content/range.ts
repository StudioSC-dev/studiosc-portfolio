import { z } from "zod";
import { STATUSES, type ProjectStatus } from "../lib/statuses";

/**
 * The fragments the range plates draw, one per tab. PRV-5 to PRV-7 supply the
 * components under `components/range/fragments/`.
 */
export const FRAGMENT_IDS = [
  "central-command",
  "tallyandtrace",
  "habit-tracker",
  "form-helper",
  "turntable",
  "portfolio-site",
  "route-checks",
] as const;

export type FragmentId = (typeof FRAGMENT_IDS)[number];

const fragmentId = z.string().min(1);

const christineCheckSchema = z.strictObject({
  repo: z.string().regex(/^StudioSC-dev\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/, {
    message: "repo must be under StudioSC-dev (StudioSC-dev/<name>)",
  }),
  path: z.string().min(1),
  test: z.string().min(1),
  sha: z.string().regex(/^[0-9a-fA-F]{40}$/, {
    message: "sha must be 40 hex characters",
  }),
  text: z.string().min(1),
});

const realPlateSchema = z.strictObject({
  kind: z.literal("real"),
  slug: z.string().min(1),
  fragmentId,
  desktopDescription: z.string().min(1),
  phoneDescription: z.string().min(1),
  facts: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  links: z.array(z.strictObject({ label: z.string(), href: z.string() })),
  christineCheck: christineCheckSchema.optional(),
});

const labPlateSchema = z.strictObject({
  kind: z.literal("lab"),
  name: z.string().min(1),
  fragmentId,
  description: z.string().min(1),
  builtWith: z.array(z.string().min(1)).min(1),
  labLine: z.string().min(1),
});

const plateSchema = z.discriminatedUnion("kind", [
  realPlateSchema,
  labPlateSchema,
]);

export const rangeCategorySchema = z.strictObject({
  id: z.string().min(1),
  tab: z.string().min(1),
  word: z.string().min(1),
  plate: plateSchema,
});

export type ChristineCheck = z.infer<typeof christineCheckSchema>;
export type RealPlate = z.infer<typeof realPlateSchema>;
export type LabPlate = z.infer<typeof labPlateSchema>;
export type RangeCategory = z.infer<typeof rangeCategorySchema>;

/** The lab line every lab plate carries at 1440 (range-light-desktop). */
const LAB_LINE =
  "Nobody's hired us for one of these yet. We built this so you don't have to take our word for it.";

/**
 * The seven categories, in board order (range-light-desktop, range-phone).
 * PRV-5 builds the Central Command fragment; PRV-6 and PRV-7 fill the other
 * plates' fragments in place. Christine lines are added only with a pinned,
 * audited check.
 */
export const RANGE_CATEGORIES: RangeCategory[] = [
  {
    id: "dashboards",
    tab: "Dashboards",
    word: "dashboards",
    plate: {
      kind: "real",
      slug: "central-command",
      fragmentId: "central-command",
      desktopDescription:
        "A dashboard for one person's day, running on Cloudflare's free tier.",
      phoneDescription:
        "A dashboard for one person's day, running on Cloudflare's free tier.",
      facts: [
        { label: "Status", value: "In QA with Christine" },
        { label: "Built with", value: "Cloudflare Workers, Hono and React" },
        { label: "Started", value: "June 2026" },
      ],
      links: [
        { label: "Read the case study", href: "/work/central-command" },
        { label: "Open the demo", href: "https://centralcommand.studiosc.dev" },
      ],
    },
  },
  {
    id: "finance",
    tab: "Finance",
    word: "finance apps",
    plate: {
      kind: "real",
      slug: "tallyandtrace",
      fragmentId: "tallyandtrace",
      desktopDescription:
        "A money app for a household and a small business. It forecasts cash flow day by day and says which account comes up short before a bill is due.",
      phoneDescription:
        "A money app that forecasts cash flow day by day and says which account comes up short before a bill is due.",
      facts: [
        { label: "Status", value: "In QA with Christine" },
        { label: "Built with", value: "React, FastAPI and PostgreSQL" },
        { label: "Started", value: "February 2026" },
      ],
      links: [
        { label: "Read the case study", href: "/work/tallyandtrace" },
        { label: "Open the app", href: "https://tallyandtrace.studiosc.dev" },
      ],
    },
  },
  {
    id: "mobile",
    tab: "Mobile",
    word: "mobile apps",
    plate: {
      kind: "lab",
      name: "Pocket habit tracker",
      fragmentId: "habit-tracker",
      description:
        "A small phone-frame app with native-feel lists. Tick a habit and watch the count follow.",
      builtWith: ["React"],
      labLine: LAB_LINE,
    },
  },
  {
    id: "ai",
    tab: "AI features",
    word: "AI features",
    plate: {
      kind: "lab",
      name: "Form helper",
      fragmentId: "form-helper",
      description:
        "Drafts a reply and streams it in as it writes. Nothing is sent until you say so.",
      builtWith: ["React"],
      labLine: LAB_LINE,
    },
  },
  {
    id: "3d",
    tab: "3D & motion",
    word: "3D scenes",
    plate: {
      kind: "lab",
      name: "Turntable scene",
      fragmentId: "turntable",
      description: "A small 3D scene you can turn and pause.",
      builtWith: ["CSS 3D transforms"],
      labLine: LAB_LINE,
    },
  },
  {
    id: "sites",
    tab: "Sites",
    word: "websites",
    plate: {
      kind: "real",
      slug: "portfolio-site",
      fragmentId: "portfolio-site",
      desktopDescription:
        "This site. Case studies and posts written in MDX, with a Playwright suite that Christine keeps green.",
      phoneDescription: "This site. Case studies and posts written in MDX.",
      facts: [
        { label: "Status", value: "Live" },
        { label: "Built with", value: "Next.js, Tailwind and Playwright" },
        { label: "Started", value: "February 2026" },
      ],
      links: [
        { label: "Read the case study", href: "/work/portfolio-site" },
        {
          label: "Source on GitHub",
          href: "https://github.com/StudioSC-dev/studiosc-portfolio",
        },
      ],
    },
  },
  {
    id: "testing",
    tab: "Testing",
    word: "test suites",
    plate: {
      kind: "real",
      slug: "portfolio-site",
      fragmentId: "route-checks",
      desktopDescription:
        "The testing half of this site: a Playwright suite that Christine keeps green, run at both widths the site is built for.",
      phoneDescription:
        "This site, with a Playwright suite that Christine keeps green.",
      facts: [
        { label: "Status", value: "Live" },
        { label: "Tested with", value: "Playwright" },
      ],
      links: [
        { label: "Read the case study", href: "/work/portfolio-site" },
        {
          label: "Source on GitHub",
          href: "https://github.com/StudioSC-dev/studiosc-portfolio",
        },
      ],
    },
  },
];

/**
 * The name a real plate shows, by project slug, where the boards name the
 * project differently from its frontmatter title (range-light-desktop draws
 * "Tally & Trace"). Any other real plate shows its project's title.
 */
export const PLATE_NAMES: Readonly<Record<string, string>> = {
  tallyandtrace: "Tally & Trace",
};

/**
 * Check a Range list. Throws one Error naming every offending category.
 * `slugs` is the set of project slugs that exist; `fragmentIds` defaults to
 * the registry above.
 */
export function validateRange(
  categories: unknown,
  projects: readonly string[] | Readonly<Record<string, ProjectStatus>>,
  fragmentIds: readonly string[] = FRAGMENT_IDS
): asserts categories is RangeCategory[] {
  if (!Array.isArray(categories)) {
    throw new Error(
      "Invalid range in content/range.ts: categories must be an array"
    );
  }

  // With statuses known, a real plate's Status fact must be its project's
  // plate label; with slugs only, just the slugs are checked.
  const slugs = Array.isArray(projects) ? projects : Object.keys(projects);
  const statusBySlug = Array.isArray(projects)
    ? undefined
    : (projects as Readonly<Record<string, ProjectStatus>>);

  const problems: string[] = [];
  const seen = new Set<string>();

  // A plain loop, so holes in a sparse array are validated too.
  for (let index = 0; index < categories.length; index++) {
    const raw: unknown = categories[index];
    const rawId =
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as { id?: unknown }).id === "string"
        ? (raw as { id: string }).id
        : undefined;
    const name = rawId ? `category "${rawId}"` : `category #${index}`;

    const parsed = rangeCategorySchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(
          `${name}: ${issue.path.join(".") || "(root)"}: ${issue.message}`
        );
      }
      continue;
    }

    const category = parsed.data;
    if (seen.has(category.id)) {
      problems.push(`${name}: duplicate category id`);
    }
    seen.add(category.id);

    if (!fragmentIds.includes(category.plate.fragmentId)) {
      problems.push(
        `${name}: fragment "${category.plate.fragmentId}" is not in FRAGMENT_IDS`
      );
    }
    if (
      category.plate.kind === "real" &&
      !slugs.includes(category.plate.slug)
    ) {
      problems.push(
        `${name}: project slug "${category.plate.slug}" does not exist`
      );
    }
    if (category.plate.kind === "real" && statusBySlug) {
      const status = statusBySlug[category.plate.slug];
      if (status) {
        const expected = STATUSES[status].plateLabel;
        for (const fact of category.plate.facts) {
          // The plate label as a whole word, then optionally a qualifier
          // after a space or a comma ("Live, tested").
          const matches =
            fact.value === expected ||
            fact.value.startsWith(`${expected} `) ||
            fact.value.startsWith(`${expected},`);
          if (fact.label === "Status" && !matches) {
            problems.push(
              `${name}: Status fact "${fact.value}" does not start with "${expected}", the plate label of project "${category.plate.slug}"`
            );
          }
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid range in content/range.ts:\n- ${problems.join("\n- ")}`
    );
  }
}
