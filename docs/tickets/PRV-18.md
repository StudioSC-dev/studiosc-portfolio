PRV-18
# Clean-up, site-wide checks, final perf

**Planned:** Sonnet, M, wave 5

- **Goal:** Once every page is rebuilt, the old design's leftovers (Framer Motion, dead CSS, unused assets) remain,
  and nobody has checked the finished site as a whole. Remove the leftovers and prove the site: no generated-UI
  tells, reduced motion everywhere, the JS and font budgets, Lighthouse, and a final fidelity pass against the
  boards.
- **Dispatch:** after every visual ticket in waves 1-4 and PRV-23 have merged, including PRV-19 for the CV links.
  PRV-1 supplies the URL fixture, performance baseline and screenshot helper. PRV-22 supplies the fidelity suite,
  board references and deviation register. PRV-20 may land later.
- **Scope:**
  - **Files:** may touch only `package.json` and `package-lock.json` (the `framer-motion` removal only), the lines
    in `app/` and `components/` that import it, `LinkedInIcon`, `app/globals.css` (deletions only), unused
    `public/*.svg`, any `thumbnail` field in `content/projects/` that /work no longer uses, `perf-baseline.json`,
    `docs/perf/after.json`,
    `docs/perf/after/{home,about,work,case-tt,case-cc,blog,post-perf,contact,404}-{desktop,phone}{,-full}.png`,
    `e2e/tells.spec.ts`.
  - Remove `framer-motion`, dead `globals.css` rules (delete only), `LinkedInIcon`, unused `public/*.svg`, and any
    `thumbnail` that /work's preview no longer uses.
  - Lower `current` in `perf-baseline.json`.
  - Add `tells.spec.ts`.
  - A Sonnet agent measures and commits `docs/perf/after.json` (trimmed Lighthouse medians at the final code
    commit) and the after shots. At the `measured_sha` build the agent reproduces the approved plan's baseline
    capture script's route set, light theme, 1440x900 and 390x844 viewports, image masking, and viewport and
    full-page PNGs.
  - Delete the old token aliases nothing uses any more (PRV-2).
  - **Final fidelity pass, before merge,** on PRV-18's merge candidate: the fidelity spec over home, `/seth`,
    `/christine`, the 404 and every page with a page board, at both widths and both themes, against every board, with
    every moment in §2's motion table exercised. The verifier is chosen by Jev with a Sonnet floor (`task-route --step fidelity-final`). Its report
    goes to the owner, with each row a pass, an accepted deviation or a mismatch. A mismatch goes back to the
    ticket that built the section as a fix PR, and the pass runs again.
  - **Confirmation on main, after merge:** the same pass runs on main's merge commit. A mismatch opens a fix PR.
    This is the epic's done condition, not one of this PR's AC.
  - Before merge, the owner reads the verifier's report linked in the PR for that same candidate. Every report row
    must be a pass or an accepted, unexpired deviation. PRV-19's CV links are covered; owner-blocked PRV-20 is not
    a prerequisite.
- **AC:**
  1. `framer-motion` is gone and the build passes. T: `tells.spec.ts › no framer`.
  2. The scan covers each URL in the PR-base `e2e/fixtures/urls.json`, following redirects, plus one fixed unknown
     URL for the shared 404, at 1440px and 390px, excluding `.prose` descendants. Tracked uppercase means visible
     all-caps text with computed letter spacing above `0.01em`. Allowed project-status labels come from
     `lib/statuses.ts`, including its plate labels, and cards are found with PRV-1's card detector. Exact board copy
     is preserved where the board requires it. The scan finds:
     - no tracked uppercase text, and no text ending in "→";
     - no " · " in list rows (the credit lines, the Open-to lines and the post header's date and project line are
       board copy);
     - no "Sample", "[PLACEHOLDER]" or "Illustrative wording";
     - every rendered status from the set;
     - no card grid.

     T: `tells.spec.ts › no generated-UI tells`.
  3. Reduced motion is emulated before navigating to the AC2 route set. Motion is observed from navigation and from
     the start of each applicable action in §2's motion table, including Gallery controls, back and next, and both
     theme-switch directions. It fails if any animation, transition or View Transition starts, or if a motion
     fallback delays the final visible state. T: `tells.spec.ts › reduced motion everywhere`.
  4. Using PRV-1's first-load JS measurement, home transfers at most 75% of its `original` bytes. Every `original`
     entry matches the PR base, and each budget route's `current` equals its final measured bytes and is at most both its PR-base `current` and its fixed `original`. On the AC2
     route set, each page requests at most two Red Hat files totalling at most 90 KiB, and only pages that render
     code request the code face. T: `tells.spec.ts › JS and fonts`.
  5. In `docs/perf/after.json`, each budget route plus `/seth` and `/christine` has median perf ≥ 90, a11y 100,
     LCP ≤ 3.8 s and CLS ≤ 0.01, under the perf JSON rule. For each required route, require exactly three runs with finite numeric values for all
     four metrics. Recompute each median from those runs, fail if it differs from the stored median, and apply the
     thresholds to the recomputed medians. When binding `measured_sha` to the PR head under that
     rule, it also fails if `package.json` or `package-lock.json` differs between those commits. T:
     `tells.spec.ts › Lighthouse budget at the measured sha`.
  6. Verify that every expected PNG decodes and matches the output of the baseline capture run against `measured_sha`
     for its named route, viewport and capture mode. Viewport PNGs must be 1440×900 or 390×844 as named, and each
     `-full` PNG must match the full-page capture dimensions for that route and viewport. T: `tells.spec.ts › after shots are complete`.
  7. On the merge candidate, the recorded results from PRV-22's fidelity suite (`e2e/fidelity.spec.ts`) cover every
     required route, width, theme and motion moment in scope. It fails on a missing row, a different candidate
     head, or a mismatch without a matching accepted, unexpired deviation in `docs/boards/deviations.md`. T:
     `tells.spec.ts › final pass at the candidate head`.
  8. The diff against the PR base fails on changes outside the Files list or outside the permitted edits within
     each path. The dead CSS and PRV-2 aliases, `LinkedInIcon`, unused public SVGs and unused `thumbnail` fields
     identified on the PR base are removed, and surviving references still resolve. Every thumbnail that `/work`
     can select under its lead-image fallback is kept.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links; routes that later tickets build may still answer 404. T: `tells.spec.ts › changes
     stay within PRV-18 scope`.
