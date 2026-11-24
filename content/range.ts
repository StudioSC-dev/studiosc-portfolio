import { z } from "zod";

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

/** PRV-5 to PRV-7 fill this in. */
export const RANGE_CATEGORIES: RangeCategory[] = [];

/**
 * Check a Range list. Throws one Error naming every offending category.
 * `slugs` is the set of project slugs that exist; `fragmentIds` defaults to
 * the registry above.
 */
export function validateRange(
  categories: unknown,
  slugs: readonly string[],
  fragmentIds: readonly string[] = FRAGMENT_IDS
): asserts categories is RangeCategory[] {
  if (!Array.isArray(categories)) {
    throw new Error("Invalid range: categories must be an array");
  }

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
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid range in content/range.ts:\n- ${problems.join("\n- ")}`
    );
  }
}
