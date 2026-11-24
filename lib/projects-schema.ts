import { z } from "zod";
import { STATUS_KEYS } from "./statuses";

/** The old, wrong account: github.com/studiosc (not StudioSC-dev). */
const OBSOLETE_GITHUB_ACCOUNT = /github\.com\/studiosc(?![\w-])/i;

/**
 * Project frontmatter. Strict, so a leftover key (for example one of the old
 * status booleans) fails instead of being ignored.
 */
export const projectFrontmatterSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  date: z.string(),
  tags: z.array(z.string()),
  status: z.enum(STATUS_KEYS),
  summary: z.string().min(1).max(80),
  builtWith: z.array(z.string().min(1)).min(1).max(3),
  thumbnail: z.string().optional(),
  githubUrl: z
    .string()
    .refine((url) => !OBSOLETE_GITHUB_ACCOUNT.test(url), {
      message:
        "githubUrl points at github.com/studiosc, which is not our account",
    })
    .optional(),
  liveUrl: z.string().optional(),
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
