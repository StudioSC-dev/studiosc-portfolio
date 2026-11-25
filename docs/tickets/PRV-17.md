PRV-17
# The `blog-post` skill

**Planned:** Sonnet, then Opus, M, wave 5

- **Goal:** the owner writes a post by handing over notes and photos (no CMS, owner 2026-11-19). The skill does
  the rest up to a PR, and covers both kinds: life posts and work posts, including the epic posts the estate
  rule requires.
- **Depends on:** PRV-1 (committed denylist, shared privacy scanner and `e2e/fixtures/urls.json`), PRV-14 (post
  schema), PRV-16 (photo command and `<Gallery>`).
- **Writers, in order on one branch:** Sonnet writes the fixtures and the failing tests from the AC. Then Opus
  writes the skill, the voice guide and the pre-flight script to make them pass.
- **Files:** may touch only `.claude/skills/blog-post/`, `scripts/post-preflight.ts`, the `preflight` script in
  `package.json`, `e2e/fixtures/` (the fixture posts and photos) and `e2e/post-preflight.spec.ts`.
- **Scope:** `.claude/skills/blog-post/SKILL.md`, `voice-guide.md` beside it, and `scripts/post-preflight.ts`
  (`npm run preflight -- <slug>`). The flow:
  1. **Input:** the category; a few lines of notes, or the epic or ticket for a work post; photo paths; an
     optional `projectSlug`. Life posts require at least one photo; work posts may omit photos. Accept a supplied
     publication date, including a backdated one. If anything material is missing, it asks once.
  2. **Photos:** `npm run photos -- <slug> <files…>` runs before anything else is written into the repo (skipped for a work post with no photos). It
     drafts alt text from each photo, which the owner can edit in the PR.
  3. **Draft:** `content/blog/<slug>.mdx` with valid frontmatter (title, description, date, author, category,
     and `projectSlug` when given); the supplied publication date is preserved, and a life post includes its
     processed photos in PRV-16's `<Gallery>` with drafted alt text and captions. The voice guide sets the husband-and-wife "we" and plain words, and bans
     AI-tell patterns (lists of three, colon lists, "nothing ships until"). It invents no fact beyond the notes
     or the ticket. For a life post, a processed photo is the required `cover`, with `src`, `width`, `height` and
     `alt` taken from the processed variant and its drafted alt text.
  4. **Pre-flight:** deterministic, in the script, never left to the model. It prints one line per failure,
     with file, line and rule:
     - the frontmatter passes `lib/posts-schema.ts`;
     - every image the post uses, and every file in `public/blog/<slug>/`, passes `scripts/image-metadata.ts`;
     - every `<Photo>`, cover, case screenshot and Markdown image has alt text, with no `TODO` left (a case screenshot
       embedded in the post is checked on its actual `<Photo>` or Markdown image reference);
     - nothing matches PRV-1's committed denylist (`e2e/support/denylist.ts`);
     - nothing matches a literal in the private list: a file outside the repo, at the path in
       `PREFLIGHT_PRIVATE_LIST`, so it works in every worktree. The owner keeps it: the lab domain and
       hostnames, GSS-internal names and home addresses. CV-level client facts, as on `/seth`, pass. Pre-flight
       fails if the variable is unset, the file is missing, or the path is inside the repo (default, §6 Q15);
     - `--no-private-list` is the explicit CI mode: it skips only this check, and says so in its output;
     - no currency amount appears, unless the frontmatter sets `madeUpFigures: true`; then the PR body lists
       each amount for the owner (default, §6 Q16);
     - `npm run build` passes, run last.
  5. **Hand-off:** stage the draft and its generated photos, then branch `seth/post-<slug>`, a one-line lowercase commit with no body and no attribution, a
     push, and `gh pr create` asking for the owner's read. It never merges. `--dry-run` stops after pre-flight.
- **AC:**
  1. In an isolated checkout, the skill's documented dry-run flow runs for a life post with an EXIF photo and for
     a work post sourced from an epic or ticket. Photo processing runs before the draft is written, the variants
     are clean and the original stays outside the checkout. Both drafts pass pre-flight with the build stubbed
     (proven in AC7). The life draft preserves the supplied backdated date, uses a processed variant for its cover, and includes the
     processed photos in a `<Gallery>` with filled alt text and captions. The work example supplies no photos, skips
     the photo command, and preserves the supplied `projectSlug`. Both stop before branch creation, commit, push or
     PR creation. `SKILL.md` directs both drafting flows to apply `voice-guide.md` and limits factual claims to the
     supplied notes, epic or ticket; the guide requires the husband-and-wife "we" and plain wording and bans each
     pattern named in Draft. T: `post-preflight.spec.ts › dry run strips and
     passes`.
  2. With required input missing, the skill asks once and stops before writing if it is still missing. A failed
     photo command stops before drafting. Failed pre-flight stops before hand-off. T: `post-preflight.spec.ts ›
     incomplete input and failed steps stop the flow`.
  3. In local and `--no-private-list` modes, run valid post fixtures containing one synthetic match for each
     applicable PRV-1 committed denylist rule. Each fails through PRV-1's shared scanner and reports the post's file,
     line and rule. A fixture with permitted CV-level client facts passes in both modes. T: `post-preflight.spec.ts › private path fails clearly`.
  4. Independently omitting the alt text, leaving it blank, or setting it to `TODO` on a `<Photo>`, a cover, a case
     screenshot embedded in the fixture post and a Markdown image each exits non-zero and names the file, line and offending image. T:
     `post-preflight.spec.ts › missing alt fails clearly`.
  5. A metadata-bearing image referenced by the post from elsewhere in `public/` and a metadata-bearing
     unreferenced image under `public/blog/<slug>/` each fail pre-flight independently, naming the file and rule. T: `post-preflight.spec.ts › dirty images
     fail`.
  6. With the build stubbed, pre-flight validates frontmatter through `lib/posts-schema.ts`. Fixtures with
     `category: blog`, an invalid ISO date, an unknown `projectSlug`, or a missing required life cover each fail
     independently and identify the rejected field. The category error also names the allowed values. T:
     `post-preflight.spec.ts › bad category fails`.
  7. With no command override, pre-flight runs `npm run build` as its final check on a valid fixture and passes
     its result through. An earlier validation failure stops the build from running. With `PREFLIGHT_BUILD_CMD`
     set to a failing command, pre-flight exits non-zero and names the build step. T:
     `post-preflight.spec.ts › build gate`.
  8. With `PREFLIGHT_PRIVATE_LIST` unset, missing, or pointing inside the repo, local pre-flight exits non-zero and
     says how to fix it. A synthetic literal from an external test list fails with the post's file, line and
     rule. The same otherwise-valid post passes under `--no-private-list` and prints the skip notice. A currency
     amount fails in both modes when `madeUpFigures` is absent or false, and passes in both when it is true. T:
     `post-preflight.spec.ts › private list and figures`.
  9. After a successful non-dry run, the documented hand-off uses branch `seth/post-<slug>`, a lowercase one-line
     commit with no body or attribution, a push, and `gh pr create` asking for the owner's read. The PR body
     lists every currency amount when `madeUpFigures: true`. The hand-off holds zero merge commands. Run
     the documented local Git commands in an isolated fixture checkout and verify that the commit contains the draft
     and generated photos. Stub the push and `gh pr create` to verify their arguments and the PR body. T:
     `post-preflight.spec.ts › hand-off never merges`.
  10. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Compare `package.json` with the PR base and fail if any value outside `scripts.preflight` changes.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links; routes that later tickets build may still answer 404. T: `post-preflight.spec.ts ›
     changes stay within PRV-17 scope`.
- **No ui-verify:** no page changes.
