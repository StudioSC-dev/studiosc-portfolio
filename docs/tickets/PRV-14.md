PRV-14
# Writing in two views, and the post template

**Planned:** Sonnet, L, wave 3

- **Goal:** Writing is one mixed list with a technical and non-technical split, a search box and animated cards,
  which the new design retires. Split posts into the two views "How we build" and "Off the clock" with the drawn
  list and post templates, and validate frontmatter with a schema that fails the build on bad data.
- **Depends on:** PRV-4 (`Header`, `FilterGroup`), PRV-8 (the photo script, for the life covers), PRV-22 (the
  board rows and the fidelity suite AC 9 uses).
- **Scope:**
  - **Files:** may touch only `lib/posts-schema.ts`, the post loader in `lib/`, `types/index.ts`, the frontmatter
    of `content/blog/*.mdx`, `app/blog/`, `components/blog/`, the Writing link logic in
    `components/layout/Header.tsx`, the `.prose` block of `app/globals.css`, the covers under `public/blog/`, the
    redirects in `next.config.*`, `e2e/fixtures/urls.json`, `e2e/writing.spec.ts`, `e2e/blog-rework.spec.ts` and
    `e2e/blog-columnar-pad.spec.ts` (only the assertions AC 7 names), `perf-baseline.json`, and
    `docs/boards/sections.json`, `docs/boards/merged.json`.
  - **Perf baseline:** after the change, record the measured per-route first-load JavaScript values in
    `perf-baseline.json` under `current`, update `measured_sha`, and preserve `original` (PRV-1's rule).
  - **`lib/posts-schema.ts` (zod):** title, description (the summary), an ISO date, author, a required
    `category: "work" | "life"`, an optional `projectSlug` that must exist, an optional `madeUpFigures` (PRV-17),
    and a `cover` (`src`, `width`, `height`, `alt`) that is required when `category` is `life`. The post loader
    parses through the schema and rethrows validation errors with the filename. A lookup for an absent post slug still returns `null`. The slugs `work` and `life` are reserved.
  - **Migrate the 22 posts:** `technical` becomes `work`. "Our First Marathon Experience" and "Welcome to
    StudioSC" become `life` (default, §6 Q13), with the board's photos as covers (`holly-chair` and `us-three`),
    made by PRV-8's photo script into `public/blog/<slug>/`. The `Post` type follows.
  - **`/blog` redirects (308) to `/blog/work`:** no board draws a combined list. The redirect joins `redirects()`
    and `urls.json`. The header's Writing link stays `/blog`, as drawn, and is marked current on every Writing
    page.
  - **Two lists, both static:**
    - the board's two view links, "How we build" and "Off the clock", with `aria-current` on the current one.
      There is no "All" link and no search box;
    - **`/blog/work`** ("How we build", with "Notes from the projects on this page"): the project filter, using PRV-4's shared `FilterGroup` (All,
      Tally & Trace, Central Command, This site, Our workflow, where Our workflow is the posts with no project)
      with its polite count ("n posts", or "n of N posts" when filtered), and the board's ruled rows: date, title
      with its summary, and the project link when the post has one. `?project=<slug>` opens with that filter
      pressed (the case pages link it);
    - **`/blog/life`** ("Off the clock", with "Trips, food, Holly, and whatever we got up to lately"): the
      board's photo-led entries, two columns at 1440 and one at 390: the cover, the date, the title and the
      summary;
    - no reading time, no "Read more →" and no Framer. Both views join `urls.json`.
  - **Post page, as `pages-post-work-*` draws it:** the view's back link, the date and project line, the h1 and
    the summary, the prose at the board's measure, the "On this page" rail on desktop (from the post's H2s),
    "From the project" with the case-study link and the credit line when the post has a project, older and newer
    post, and "All of <view>". Prose is on the tokens (the `.prose` carve-out), and code is in the code face. Life
    posts use the same template with their own back link; `pages-post-life-*` is checked with PRV-16, which adds
    the Gallery.
- **AC:**
  1. Every post passes the schema, and no `technical` or `non-technical` value is left. Run invalid fixtures
     through the production build's post-loading path. Each case fails with the offending filename: missing
     category, either retired category, an invalid ISO date, an unknown `projectSlug`, either reserved slug (`work`
     or `life`), and a life post with an absent or malformed cover. Also run separate invalid fixtures with `title`, `description` or `author` omitted. Each fails through the production build's post-loading path and names the offending file. T: `writing.spec.ts › post schema`.
  2. `/blog` answers 308 to `/blog/work`. `/blog/work` and `/blog/life` list exactly their category's posts,
     newest first, at unchanged post URLs. Of the 22 existing posts, only `/blog/first-marathon` and `/blog/welcome` appear in Life,
     with the `holly-chair` and `us-three` covers respectively. The other 20 appear in Work. T: `writing.spec.ts › two lists and the redirect`.
  3. The h1s read "How we build" and "Off the clock", with the board's lines. The two view links are the only
     view switch, the current one has `aria-current`, there is no search box, and each view renders without JS.
     The shared header's Writing link keeps `href="/blog"` and has `aria-current="page"` on both lists and on work
     and life post pages. It is not current on a non-Writing page. The production build reports both `/blog/work` and `/blog/life` as statically prerendered routes. T: `writing.spec.ts › views as drawn`.
  4. On `/blog/work`, each filter value narrows the rows to its posts, the count reads as drawn, and
     `?project=tallyandtrace` opens with that filter pressed. The result count is announced through a polite live region. Open `/blog/work?project=<slug>` separately for `tallyandtrace`, `central-command` and `portfolio-site`. On first render the matching filter is pressed, only that project's rows are visible, and the count matches those rows. With JavaScript disabled, the same URL shows all work rows and the unfiltered count. T: `writing.spec.ts › project filter`.
  5. Work rows hold date, title, summary and the project link, ruled as drawn. Life entries lead with their
     cover, then date, title and summary. Neither shows a reading time or an arrow, and the detector finds no
     card grid. Each project-linked row points to `/work/<projectSlug>`. Rows without a project omit that link. Both Life cover images load and decode on the production build. T: `writing.spec.ts › rows and entries as drawn`.
  6. On a post, `.prose p` keeps the board's measure at 1440, `pre code` uses the code face, the rail lists the
     post's H2s at 1440, and, for work and life posts, the back and "All of" links target the post's own view. Assert the board's
     older and newer destinations on the illustrated work post and the single available neighbour on each of the
     two life posts. The contents links reach their H2 anchors. A project-linked work post has the correct
     case-study link and credit line, and a work post without a project omits that block. Request a `/blog/<slug>` with no matching MDX file and assert HTTP 404. T: `writing.spec.ts › post as drawn`.
  7. Nothing animates on load. No Writing list or post template imports or uses `framer-motion`, including through the components it renders. The `blog-rework` and `blog-columnar-pad` specs pass, updated only where they
     assert the old category value, the old filter, search or the combined list. T: `writing.spec.ts › still, and old specs
     pass`.
  8. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except that `/blog` now answers 308 to `/blog/work` and `/blog/life` is new; routes
     that later tickets build may still answer 404. Compare against the PR base and enforce the Files bullet's edit
     limits within each allowed path, including unchanged MDX bodies, unchanged CSS outside `.prose`, unchanged
     Next config outside `redirects()`, and legacy spec edits limited by AC 7. The URL fixture retains every
     existing entry, records `/blog` as a 308 to `/blog/work`, and adds `/blog/work` and `/blog/life` as 200
     entries. For each non-Writing page that renders `PostTeaser` at the PR base, compare its rendered teaser text, order and destinations against the base. T: `writing.spec.ts › changes stay within PRV-14 scope`.
  9. The rows this ticket builds (the `blog-work`, `blog-life` and `post-work` rows; `post-life` is PRV-16's) are
     marked `built` in `docs/boards/sections.json`, `PRV-14` is added to `docs/boards/merged.json`, and PRV-22's
     fidelity suite (`e2e/fidelity.spec.ts`) passes for those rows at 1440 and 390 in light and dark, including the
     applicable owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour,
     copy, image frames, section order, visible motion and both themes. It does not cover demo behaviour or exact
     easing. A width that no board draws is skipped and listed in the PR for QA. Against the PR base, `sections.json` changes only the `built` flags for `blog-work`, `blog-life` and `post-work`. The sole change to `merged.json` is the addition of `PRV-14`. T: `writing.spec.ts › PRV-14
     fidelity rows`.
  10. Remeasure all six PRV-1 budget routes using its Chromium method on the audited production build. Retain the
      `/blog` key and measure that navigation through the redirect to `/blog/work`. Each `current` value equals the
      byte count from that run, `original` matches the PR base, and `measured_sha` binds to the PR under the
      inherited guard. T: `writing.spec.ts › measured JS matches current`. The inherited
      `guards.spec.ts › JS within baseline` also passes.
