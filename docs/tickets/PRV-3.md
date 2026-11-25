PRV-3
# Content model and its build-time check

**Planned:** Sonnet, M, wave 1

- **Goal:** project status is spread across three booleans, and the current loaders can hide malformed
  frontmatter. Use a single typed project status and a typed Range model, and fail the build on invalid project or
  Range content.
- **Scope:**
  - `lib/statuses.ts`: the fixed set (Live, In QA, In development, Tested by us), each with a plate label ("In QA
    with Christine" for In QA).
  - `lib/projects-schema.ts` (zod) for frontmatter:
    - `status` replaces the three booleans;
    - `summary` (the list line, ≤ 80 characters) and `builtWith` (1 to 3 items);
    - `thumbnail` stays optional; /work's preview image may use it (PRV-11). The four status keys are `live`, `in-qa`, `in-development` and `tested-by-us`. Require `title`, `description` and `date` as strings and `tags` as an array of strings, alongside the new fields. Keep `githubUrl`, `liveUrl` and `thumbnail` optional strings.
  - `content/range.ts` and `validateRange()`. A category has an id, its tab label, its headline word, and a plate.
    A plate is either:
    - **real:** a project slug, a fragment id, the board copy (desktop and phone descriptions, facts, links)
      and an optional `christineCheck` (`repo` under StudioSC-dev, `path`, `test`, a 40-hex `sha`, `text`);
    - **lab:** a name, a fragment id, a description, `builtWith` and the lab line.

    The validator checks unique ids, slugs that exist, fragment ids in `FRAGMENT_IDS`, and the
    `christineCheck` shape. The categories list starts empty; PRV-5 to PRV-7 fill it.
  - Define and export `FRAGMENT_IDS` in `content/range.ts`. Its seven entries are the fragments the plan's §2
    Plates table and the boards draw, one per tab: `central-command` (Dashboards), `tallyandtrace` (Finance),
    `habit-tracker` (Mobile), `form-helper` (AI features), `turntable` (3D & motion), `portfolio-site` (Sites) and
    `route-checks` (Testing). PRV-5 through PRV-7 supply the corresponding fragment components under
    `components/range/fragments/`.
  - Run both project frontmatter and Range validation during `npm run build`, including while the shipped Range
    list is empty. Wire validation into `npm run build` through the listed App Router entry points or `next.config.ts`; any change to `next.config.ts` is limited to invoking content validation.
  - In `lib/mdx.ts`, update `getProjects()` and `getProject()` to parse project frontmatter through the schema and rethrow, never returning `[]` on bad
    content. The directory is a parameter for tests.
  - Migrate the four project files: T&T and Central Command `in-qa`, the Portfolio `live`, Fitness Rival
    `in-development`. Summaries come from the board's Every project lines. Use the Work board's stack values for `builtWith`: Tally & Trace `[React, FastAPI, PostgreSQL]`, Central Command `[Cloudflare Workers, Hono, React]`, Portfolio `[Next.js, Tailwind]` and Fitness Rival `[React, TypeScript, Node.js]`.
  - **Repository URL correction (plan §1, item 18):** the Portfolio's `githubUrl` in
    `content/projects/portfolio-site.mdx` points at `github.com/studiosc`, an account that is not ours. It belongs
    here because it is a defect in the project content this ticket migrates and validates, and the same edit
    touches that file; it is fixed to `https://github.com/StudioSC-dev/studiosc-portfolio`, with no other change.
  - Replace the three status booleans (`qaVerified`, `qaInProgress`, `underDevelopment`) in the shared `Project`
    type in `types/index.ts`, `components/home/ProjectCard.tsx`, `components/ui/StatusBadge.tsx`, and their
    callers `app/page.tsx`, `app/work/page.tsx` and `app/work/[slug]/page.tsx`. Preserve the existing page
    layouts, project membership and ordering while updating the status badges and `/work` group labels.
- **Audit baseline:** for the PRV-3 work audit, run the migration comparisons in AC1 and AC4 and the actual diff check in AC8 with the audited PR base and head available, comparing against that base's files and rendered pages. Exercise the file allowlist with allowed and disallowed path fixtures in routine suite runs. The empty Range assertion and comparisons to the PRV-3 base apply to the PRV-3 work audit only, so PRV-5 can populate Range and later tickets can change page layouts.
- **AC:**
  1. The four files pass the schema, with no old boolean left. The test asserts the four scoped status
     assignments, the board's Every project summaries, the four scoped `builtWith` arrays, preserved `tags` values and an empty shipped Range list. It compares the MDX bodies
     and frontmatter outside the migration fields with the pre-migration versions. A file that keeps a boolean
     fails. T: `content-model.spec.ts › content matches the schema`.
  2. On fixtures, the validators reject each of: an unknown status, a duplicate category id, an unknown slug, an
     unregistered fragment, a short sha, and a repo outside StudioSC-dev. They accept a valid set. Summaries of 80
     characters pass and of 81 fail; `builtWith` accepts one and three items and rejects zero and four; omitted
     thumbnails are accepted. The valid fixtures include a lab plate, a real plate without `christineCheck` and a real plate with a complete `christineCheck`. Separate invalid fixtures reject an incomplete `christineCheck`, a 40-character SHA containing a non-hex character, and a wrong type for an existing project frontmatter field. T: `content-model.spec.ts › rejects bad content`.
  3. With valid and malformed files in the same fixture directory, `getProjects()` and `getProject()` for the
     malformed slug both reject and name the bad file. `getProject()` returns the valid project for its slug and
     `null` for an absent slug. T: `content-model.spec.ts › loader throws`.
  4. On `/`, `/work` and each project case page, every expected project renders its assigned status label, and
     the `/work` group headings use the same labels. Project membership, ordering, layout structure and post
     titles match the pre-migration pages. T: `content-model.spec.ts › status words from the set`.
  5. `npm run build` succeeds with the shipped content. In isolated fixtures, invalid project frontmatter and
     invalid Range data each cause that same build command to exit nonzero and identify the offending file or
     category. T: `content-model.spec.ts › build rejects invalid content`.
  6. The Portfolio case links to `https://github.com/StudioSC-dev/studiosc-portfolio`, and no project file links
     to `github.com/studiosc`. A fixture project still carrying the old link fails. T:
     `content-model.spec.ts › portfolio repo link`.
  7. `FRAGMENT_IDS` equals exactly the seven ids in Scope, and a Range fixture using an eighth id is rejected. T:
     `content-model.spec.ts › fragment registry entries`.
  8. Relative to the PR base, the diff touches only the files listed in Scope, the four project files, the tests and
     their fixtures, and it preserves existing routes: using the public page URLs from the PR base, `/`, `/work`, every project case, `/blog`, every blog post, `/about`, `/contact` and `/privacy/hermes-personal-assistant` still return 200 and retain the same shared navigation destinations. A changed file outside Scope, or a removed
     route, fails. T: `content-model.spec.ts › changes stay within PRV-3 scope`.
