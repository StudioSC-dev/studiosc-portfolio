PRV-21
# Blog post (epic definition of done)

**Planned:** Sonnet, S, wave 6

- **Goal:** Every epic gets its own post on studiosc.dev, and this one is not Done without it. Publish a public
  post on the revamp, `category: work`, written with the `blog-post` skill. Its `projectSlug` is `portfolio-site`,
  the Portfolio's actual slug (from `content/projects/portfolio-site.mdx`; three posts use it today).
- **Depends on:** PRV-17, PRV-18.
- **Sections:**
  - what looked generated;
  - the three directions and why the owner picked Range;
  - the plates and the honest lab demos;
  - motion with reduced-motion fallbacks;
  - the two of us and Holly;
  - how posts get written now: the photo script and the skill;
  - how each change was proved;
  - before and after numbers.
- **Files:** may touch only `content/blog/studiosc-revamp.mdx`, `public/blog/studiosc-revamp/` and
  `e2e/studiosc-revamp.spec.ts`.
- **Scope:** `content/blog/studiosc-revamp.mdx` and its spec, modelled on `blog-columnar-pad.spec.ts` (full
  denylist, scope and structure). Before-and-after figures use only values from the revamp's committed synthetic demo fixtures. The
  `covers the story` scenario identifies the source file and field for each value. The owner reads it before merge.
- **AC:**
  1. Frontmatter is valid, with `category: work`, and links `portfolio-site`. T: `studiosc-revamp.spec.ts › frontmatter`.
  2. The post renders, and is listed on `/blog/work` (under This site) and the Portfolio case. T: `studiosc-revamp.spec.ts › builds and is
     listed`.
  3. `npm run preflight -- studiosc-revamp --no-private-list` exits zero in CI. The full local run, with the
     private list enabled, also exits zero, and its successful output is pasted into the PR. T:
     `studiosc-revamp.spec.ts › nothing private` verifies the CI run.
  4. All eight entries under Sections appear as H2s, ignoring capitalization and trailing list punctuation. Each
     section has at least 40 body words, counted from below its H2 to the next H2 or the end of the post. The
     before-and-after values match the cited fixture fields and are visibly labelled as made up. Check the rendered
     body for the subjects named in each section. The directions section names all three alternatives and gives the
     recorded reason Range was selected. The proof section identifies the check and result for each change it
     discusses. The numbers section shows at least one explicitly labelled before-and-after pair for the same
     measure, with both values checked against their cited fixture fields. T:
     `studiosc-revamp.spec.ts › covers the story`.
  5. Images are optional. For each supplied image, its source is a PRV-18 after shot and the shipped variants match
     the output of `npm run photos -- studiosc-revamp` for that source. Every image in the post has nonempty alt
     text. The complete file set under `public/blog/studiosc-revamp/` must match the variants generated from the
     PRV-18 after shots used in the post. The scenario fails on any extra file, including an original, and requires the
     directory to contain no files when the post uses no images. T: `studiosc-revamp.spec.ts › images safe`.
  6. The diff against the PR base touches only the post, its photos and its spec, the paths in this ticket's Files
     scope bullet. Any other path fails. Run this scenario on every PR in CI. Resolve the actual PR base from CI event
     metadata. Fail if the base revision or its baseline build is unavailable (the `blog-columnar-pad.spec.ts` skip
     when `POST_SCOPE_BASE` is unset does not apply). Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except that `/blog/work` and the Portfolio case list the new post; routes that later
     tickets build may still answer 404. T: `studiosc-revamp.spec.ts › changes stay within PRV-21 scope`.
