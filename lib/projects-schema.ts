import { z } from "zod";
import { STATUS_KEYS } from "./statuses";

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
  githubUrl: z.string().optional(),
  liveUrl: z.string().optional(),
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
