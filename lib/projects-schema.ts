import { z } from "zod";
import { STATUS_KEYS } from "./statuses";

/** True for any form of github.com/studiosc (our account is StudioSC-dev). */
function pointsAtObsoleteAccount(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") return false;
  const account = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return account.toLowerCase().replace(/\.git$/, "") === "studiosc";
}

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
    .refine((url) => !pointsAtObsoleteAccount(url), {
      message:
        "githubUrl points at github.com/studiosc, which is not our account",
    })
    .optional(),
  liveUrl: z.string().optional(),
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
