/**
 * The CV build check, run by `npm run build` before `next build`: a CV marked
 * ready in content/people.ts must exist under public/, so a ready CV never
 * links to a missing file.
 *
 *   npx tsx scripts/check-cv.ts
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { PEOPLE, type Person } from "../content/people";

/** One line per ready CV whose file is missing under `root`/public. */
export function missingCvs(people: readonly Person[], root: string): string[] {
  return people
    .filter((person) => person.cv.ready)
    .filter(
      (person) =>
        !existsSync(path.join(root, "public", ...person.cv.path.split("/")))
    )
    .map(
      (person) =>
        `${person.name}'s CV is marked ready, but public${person.cv.path} is missing`
    );
}

if (require.main === module) {
  const missing = missingCvs(PEOPLE, process.cwd());
  for (const line of missing) console.error(`CV check: ${line}`);
  process.exit(missing.length ? 1 : 0);
}
