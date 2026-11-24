PRV-12
# Case-study template

**Planned:** Sonnet, L, wave 3

- **Goal:** Case studies are free-form pages with no structured place for the lead screenshot, Runs on, the credit
  line or the two of us. Give every case study the drawn template, built from its existing file, with schema checks
  that fail the build on bad screenshot data.
- **Depends on:** PRV-5 (`ChristineLine`, credit line), PRV-8 (the people's photo variants).
- **Follows `pages-case-*` exactly** (drawn with Tally & Trace), at both widths. The board's sections map to the
  case files' existing sections. Use the existing MDX for mapped case prose wherever it matches the reference. On
  Tally & Trace, use board copy and board entries where they differ, including the title and Features list.
  Render the contact call at 1440 and omit it at 390, as drawn. Map Project Overview to Why we built it, The Build and The Break to the contributor panels, Features to What it does, and Tech Stack to Stack. Each available contributor panel includes its photo variant or stand-in and its More about link. AC4 and AC5 define the writing and project navigation sections.
- **Missing data:** show Open and Code on GitHub only when their corresponding URL exists. Use `Planned Features`
  as the source for What it does on Fitness Rival. Render the available case sections and contributor panels from
  the existing MDX. Use `Not specified` for Runs on where the project has no documented deployment. Record
  undrawn layouts for QA.
- **Files:** may touch only `app/work/[slug]/page.tsx`, `components/case/`, `types/index.ts`, the project schema
  and loader files PRV-3 added, the frontmatter of `content/projects/` (the new `runsOn`, `lead` and `screenshots`
  fields only), `e2e/fixtures/` (the bad-screenshot fixtures), `e2e/case-template.spec.ts`, `perf-baseline.json`,
  and `docs/boards/sections.json`, `docs/boards/merged.json`.
- **Perf baseline:** after the change, record the measured per-route first-load JavaScript values in
  `perf-baseline.json` under `current`, update `measured_sha`, and preserve `original` (PRV-1's rule).
- **Content:** the project schema (PRV-3's) gains `runsOn` (1 to 3 items) for the Runs on fact, `lead` (`src`,
  `width`, `height`, `alt`) and `screenshots` (up to three, each `src`, `width`, `height`, `alt` and `caption`).
  A bad or missing numeric value fails the build, naming the file. Until PRV-13 merges, the T&T case shows its
  existing screenshots in the board's frames; the T&T screenshot rows in `sections.json` are PRV-13's, and
  PRV-12's rows cover the rest of the page. A case with no screenshots omits the lead frame and the Screenshots
  section; no board draws that state, so the PR notes it and QA decides (PRV-22).
- "← BACK TO WORK" and the old tag list are dropped. Mermaid diagrams in a case body still render.
- **AC:**
  1. At 1440 and 390, Tally & Trace follows the board's section order, headings and copy under the source rule above. The contact call appears at 1440 with its action linking to `/contact` and is absent at 390. On the other three cases, verify that available mapped sections use their own MDX, including Planned Features on Fitness Rival. T: `case-template.spec.ts › sections as drawn`.
  2. On all four cases, verify the Case study label, h1, description, credit line, Status, Started, Stack and Runs on. The Every project link targets `/work`. Open and Code on GitHub each use their corresponding source URL when supplied and are absent otherwise. Runs on shows the documented deployment or `Not specified` when none is documented. T: `case-template.spec.ts › header facts`.
  3. Tally & Trace displays its existing lead image and three captioned gallery images. Central Command retains its three existing screenshots across the template's image sections. Fixtures with one or two gallery entries display exactly the supplied entries. A fixture with no screenshot data builds and omits both image sections. T: `case-template.spec.ts › screenshot slots`. A production build fails and names the project file for each fixture with a missing required lead or gallery field, a width or height that is not a positive integer, more than three gallery entries, or a supplied `runsOn` list outside one to three items. T: `case-template.spec.ts › invalid case frontmatter`.
  4. Show up to three matching work posts, newest first, with each post's date and linked title. Exercise `technical` before PRV-14 and `work` after migration. Exclude other projects' posts and posts outside the work category. A project with zero matches displays no post rows. "All n posts" counts every match and links to `/blog/work?project=<slug>`. T: `case-template.spec.ts › writing about the project`.
  5. Previous and next follow the board's Every project order before and after PRV-11: Tally & Trace, Central Command, Portfolio, Fitness Rival. Both links wrap at the ends. Assert both destinations on all four cases. T: `case-template.spec.ts › project nav`.
  6. Render a case through the normal case route using an inline MDX fixture with a Mermaid block. Assert that its diagram SVG appears and that no Mermaid error is reported. T: `case-template.spec.ts › diagrams render`.
  7. The credit line links Seth to `/seth` and Christine to `/christine`. In each rendered contributor panel, More about Seth targets `/seth` and More about Christine targets `/christine`. T: `case-template.spec.ts › credit links the people`.
  8. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except the "← BACK TO WORK" link and the old tag list, which are dropped; routes that
     later tickets build may still answer 404. Run the live diff and route comparisons only for the PRV-12 work
     audit, using its actual PR base and head. Compare changed project files with the base and fail if any MDX body
     or any frontmatter field outside `runsOn`, `lead` and `screenshots` changes. The old back-link label and tag
     list are absent on case pages. In routine suite runs, exercise the allowlist and protected-content checks
     with inline fixtures. T: `case-template.spec.ts › changes stay within PRV-12 scope`.
  9. The rows this ticket builds (every case-page row except the T&T screenshot rows, which are PRV-13's) are
     marked `built` in `docs/boards/sections.json`, `PRV-12` is added to `docs/boards/merged.json`, and PRV-22's
     fidelity suite (`e2e/fidelity.spec.ts`) passes for those rows at 1440 and 390 in light and dark, including the
     applicable owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour,
     copy, image frames, section order, visible motion and both themes. It does not cover demo behaviour or exact
     easing. A width that no board draws is skipped and listed in the PR for QA. During the PRV-12 work audit, compare both board manifests with the actual PR base. In `sections.json`, the only changes are the transitions to `built` for the rows assigned to PRV-12. In `merged.json`, the only change is the addition of `PRV-12`. T: `case-template.spec.ts › PRV-12
     fidelity rows`.
  10. The remeasured `current` values for the budget routes this ticket changes are recorded in
      `perf-baseline.json` with `measured_sha` updated and `original` preserved. They bind to the PR under the
      inherited budget guard. During the PRV-12 work audit, the committed `current` entries for the affected budget
      routes match exactly the byte totals captured by the PRV-1 measurement at `measured_sha`. T:
      `guards.spec.ts › JS within baseline` (inherited cap and provenance) and `case-template.spec.ts › recorded JS
      matches measurements`.
