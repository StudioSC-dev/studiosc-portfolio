PRV-20
# Life posts (owner-blocked)

**Planned:** Sonnet, S per post, after PRV-17

- **Goal:** The life section has none of the owner's real stories yet. Publish the owner's five backdated life
  posts through the `blog-post` skill, one PR each, as the owner supplies their notes and photos.
- **Precondition, per post:** the owner's backdated date, notes and photos (still owed). The content is theirs;
  we invent nothing.
- **Shape:** one grouped ticket. `docs/tickets/PRV-20.md` holds a checklist of the owner's five posts (2026-11-20),
  each ticked as it merges:
  1. Sea-to-Summit Trail Series
  2. First Out-of-country Hike
  3. Coffee/Cafe Hunting
  4. Coron Trip
  5. First Halloween in-costume Run
- **Files:** may touch only per post, `content/blog/<slug>.mdx`, `public/blog/<slug>/` and that post's tick in
  `docs/tickets/PRV-20.md`.
- **Each post** carries its backdated date and uses the `<Gallery>` and the `pages-post-life-*` template.
- **Per post:** Sonnet runs the `blog-post` skill with `category: life`. One PR per post, merged after the owner's
  read.
- **Publication gate:** the owner reads and approves each public post before its PR merges, as the estate rule
  requires. It is not an automated check.
- **Work-audit suite:** before dispatch, `prv-20.spec.ts` is provided in the work-audit harness outside the content
  PR, and run for each post with the candidate slug, supplied date, PR base, candidate head and the corresponding unchecked checklist item. The content PR's
  file allowlist applies to every post.
- **AC, per post:**
  1. Run `npm run preflight -- <slug>` for the candidate post. A nonzero exit fails the check, and the passing
     output is in the PR. T: `prv-20.spec.ts › candidate post passes pre-flight`.
  2. The new post appears exactly once on `/blog/life` with its own cover and the owner-supplied backdated date, in
     newest-first order, and is absent from `/blog/work`. Its link opens the life post template, which displays
     the supplied date and renders the post's `<Gallery>`. Compared with the PR base, `/blog/life` gains only the
     candidate post and `/blog/work` retains the same entries; compare entries across all pages if a listing is
     paginated. T: `prv-20.spec.ts › candidate post appears in the life
     list and opens with its gallery`.
  3. Each post's PR diff against the PR base touches only that post's `content/blog/<slug>.mdx`, its
     `public/blog/<slug>/` photos and its tick in `docs/tickets/PRV-20.md`. The candidate slug must be absent from the PR base. The PR must add its MDX file and change the supplied checklist item
     from unchecked to checked, preserving all other text and checkboxes in `docs/tickets/PRV-20.md`. Any other changed
     path fails. Every URL in
     `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its shared
     navigation links, except that `/blog/life` lists the new post; routes that later tickets build may still
     answer 404. T: `prv-20.spec.ts › changes stay within PRV-20 scope`.
- **No ui-verify:** content on templates PRV-14 and PRV-16 already verified.
