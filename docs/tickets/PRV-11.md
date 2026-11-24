PRV-11
# Every project, /work and the home order

**Planned:** Sonnet, M, wave 4

- **Goal:** The live homepage and work list are built on a hero and cards that the new design retires, and the new
  home is only reachable behind a flag at `/preview/home`. Build the project list and `/work`, set home's final
  section order as drawn, and flip the flag so the new home goes live at `/`.
- **Depends on:** PRV-5, PRV-6, PRV-7 (all seven categories filled), PRV-8, PRV-9, PRV-12 and PRV-13 (the
  case screenshots), PRV-14, and PRV-23, which
  must merge before this ticket flips the home flag, so the counters are live when `/` changes.
- **Scope:**
  - **Files:** may touch only `components/home/`, `components/work/`, the file that defines `PostTeaser` (its card
    styling only), `app/page.tsx`, `app/work/page.tsx`, the removal of `app/preview/home/`, `lib/flags.ts`,
    `e2e/fixtures/urls.json`, `e2e/home.spec.ts` (replacing `e2e/homepage.spec.ts`), `e2e/support/home.ts`,
    `perf-baseline.json`, `e2e/range.spec.ts`, `e2e/lab.spec.ts` and `e2e/outcomes.spec.ts` (each only where its assertions depend on `/preview/home` or the pre-cutover flag state: retarget continuing coverage to `/` and replace preview-only assertions with the cutover checks in AC1; preserve the existing Range, demo-loading and counter behavior coverage), and `docs/boards/sections.json`, `docs/boards/merged.json`.
  - **Perf baseline:** after the change, record the measured per-route first-load JavaScript values in
    `perf-baseline.json` under `current`, update `measured_sha`, and preserve `original` (PRV-1's rule).
  - **`ProjectList`:** the four real projects in the updated boards' order (v14: T&T, Central Command, Portfolio, Fitness Rival),
    each with name, status word and summary.
    - On home it is compact, with "All case studies".
    - On `/work` it is filterable with `FilterGroup` (All, Live, In QA, In development) and a live count. Tested
      by us shows under All only (default, §6 Q5).
    - **On `/work`, each project has a preview image (owner, 2026-11-20),** in the frame the updated board draws:
      the project's `lead` screenshot (PRV-12), else its existing `thumbnail`, else the board's neutral empty
      frame. Images go through PRV-8's loader.
  - **Home's final order, as on board v14 with the owner's 2026-11-20 move:** opener, range, the two of us,
    Holly, the photo of the three of us, Writing, Every project (`#work`), the contact call, footer. Writing is the board's: the "Writing" title, then "How we build" (to
    `/blog/work`) with "Notes from the projects on this page", and "Off the clock" (to `/blog/life`) with "Trips,
    food, Holly, and whatever we got up to lately".
  - **The flip:** `rangeHome` becomes true, so `/` serves the new home and `/preview/home` is removed, from the
    app and from `urls.json`.
    `homepage.spec.ts` gives way to `home.spec.ts`, and `e2e/support/home.ts` points at `/`.
  - Delete `Hero`, `ProjectCard`, `LatestBlogPosts` and the `PostTeaser` card styling.
- **AC:**
  1. `/` serves the new home with its sections in the order above, the Writing copy is the board's, and the two
     Writing links reach their views. `/preview/home` answers 404. `rangeHome` is true, and a fresh visit to `/` sends exactly one `home-view` beacon,
     verified by intercepting the request. A production response for `/` has no `noindex` directive in its robots metadata or `X-Robots-Tag` header. T: `home.spec.ts › section order and the flip`.
  2. On `/` and on `/work` with All selected, Every project lists the four real projects in the stated order, with
     each name, status word and summary and no "Sample" marker. Each project name and each drawn Case study link
     point to that project's case route. Where drawn, the home "All case studies" link points to `/work`. At both drawn widths on `/work`, each project row's Seth and Christine credit links point to `/seth` and `/christine` respectively. T:
     `home.spec.ts › every project`.
  3. Where drawn on `/` and `/work`, the contact call shows the board copy and Start a project links to `/contact`.
     The home recruiter links reach the `#seth` and `#christine` sections. The `/work` recruiter links point to
     `/seth` and `/christine`. T: `home.spec.ts › contact call`.
  4. On `/work`, All shows all four projects and announces "4 projects". In QA shows T&T and Central Command and
     announces "2 of 4 projects". Live shows the Portfolio and In development shows Fitness Rival, each announcing
     "1 of 4 projects". Selecting All again restores all four. A fixture with a Tested by us project shows it under
     All only. With JavaScript disabled, the initial page still lists all four projects. On a fresh visit with JavaScript enabled, All is selected before any interaction. On initial load and after each filter change, exactly the active button has `aria-pressed="true"`. T:
     `home.spec.ts › work filter`.
  5. Headings on `/` and `/work` skip no level, and the detector finds no card grid. Home's JS stays within the
     baseline. T: `home.spec.ts › structure and budget`.
  6. With the flag on, `lab.spec.ts › demos load on pick` passes on `/`, and the opener's Every project link reaches
     `#work`. T: `home.spec.ts › demos load on pick at /, Every project link`.
  7. On `/work`, test a project with both `lead` and `thumbnail`, a project with only `thumbnail`, and a project
     with neither. The first uses `lead`, the second uses `thumbnail`, and the third renders the board's neutral
     frame without an image. Every frame matches its drawn size. Each image uses PRV-8's loader and has explicit
     width, height and descriptive alt text. T&T displays the dashboard lead supplied by PRV-13. T:
     `home.spec.ts › work previews`.
  8. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except that `/` now serves the new home and `/preview/home` answers 404; routes that
     later tickets build may still answer 404. Compared with the PR base, `e2e/fixtures/urls.json` changes only by
     removing the `/preview/home` entry. `Hero`, `ProjectCard`, `LatestBlogPosts`, `app/preview/home/` and `e2e/homepage.spec.ts` are removed, and `e2e/support/home.ts` targets `/`. Compared with the PR base, the `PostTeaser` diff removes only its card styling, and `lib/flags.ts` changes only `rangeHome`. T: `home.spec.ts › changes stay within PRV-11 scope`.
  9. Compared with the PR base, `docs/boards/sections.json` changes only by marking PRV-11's `/work`, Writing, Every project, and home contact-call rows `built` and by repointing every row mapped to `/preview/home` to `/`. Every other built flag and field stays as it was. The named scenario verifies that no row was added or removed and that the sole change to `docs/boards/merged.json` is the addition of `PRV-11`. PRV-22's fidelity suite
     (`e2e/fidelity.spec.ts`) passes for every built home row at `/` and every built `/work` row at 1440 and 390 in light and
     dark, including the applicable owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour, copy, image
     frames, section order, visible motion and both themes. It does not cover demo behaviour or exact easing. A
     width that no board draws is skipped and listed in the PR for QA. The named scenario verifies that no
     section-map row still points to `/preview/home`. T: `home.spec.ts › PRV-11 fidelity rows`.
  10. On the audited production build, remeasure first-load JavaScript for `/` and `/work` using PRV-1's Chromium method. Each corresponding `current` entry in `perf-baseline.json` equals the measured byte count. Preserve `original` and update `measured_sha` under the inherited PR binding rule. T: `home.spec.ts › recorded JS matches measurements` for byte equality and `guards.spec.ts › JS within baseline` for the ceiling and PR binding.
