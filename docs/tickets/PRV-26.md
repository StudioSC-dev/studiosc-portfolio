# Self-host the pinned Red Hat files

**Planned:** model from task-route (or orchestrator if no routing row), S, wave 2 fix (blocks every built fidelity row: PRV-4, PRV-5 and later)

- **Goal:** `lib/fonts.ts` (PRV-2) loads Red Hat Display and Red Hat Text through `next/font/google`. Google now serves files with a 300–900 / 300–700 weight axis whose bytes differ from the boards' pinned files in `docs/boards/fonts/` (the v21 / v19 releases, 400–800 / 400–700 axis, listed by `docs/boards/fonts/google.css`). The fidelity check then reports "expected a pinned red hat display file", and built text runs 3–7 px wider or narrower than the references. The PRV-4 writer confirmed that putting the pinned bytes in place makes the header and footer rows pass the font and width checks. Serve exactly the pinned Latin files instead, so the built type matches the boards and stops depending on what Google serves on a given day.
- **Depends on:** PRV-2, PRV-22 (both merged).
- **Scope:**
  - `lib/fonts.ts`: Red Hat Display and Red Hat Text move to `next/font/local`, using copies of the pinned Latin-subset files (the `unicode-range` Latin entries in `docs/boards/fonts/google.css`). The other faces are unchanged.
  - Add `app/fonts/red-hat-display/red-hat-display-latin.woff2`, `app/fonts/red-hat-display/OFL.txt`, `app/fonts/red-hat-text/red-hat-text-latin.woff2`, and `app/fonts/red-hat-text/OFL.txt`.
  - `e2e/design-tokens.spec.ts`: adapt the Red Hat assertions in `one superfamily, within size` for local loading and retain the other PRV-2 assertions. Extend the existing LCP scenario to validate the PRV-26 record and add the scenarios named in AC1 and AC5.
  - `docs/design-system.md` ("Type"): say where the files come from.
  - `docs/perf/prv-26.json`: the re-measured LCP.
  - `docs/tickets/PRV-26.md`: this ticket.
  - No change to `docs/boards/`, `scripts/boards/` or any page or component.
- **AC:**
  1. Both Red Hat declarations use `next/font/local` and reference the checked-in Latin copies. On a fresh load of the production build of `/`, the site serves exactly one successful font response per Red Hat family, and each response's SHA-256 matches that family's Latin pin in `docs/boards/fonts/`. Verify that both copied OFL licences match the originals and that the Type section of `docs/design-system.md` identifies the source of both fonts. T: `design-tokens.spec.ts › red hat files match the boards' pins`.
  2. PRV-2's AC3 still holds: headings compute to Red Hat Display and body to Red Hat Text, `display: swap`, a size-adjusted fallback face is declared for each family, and `/` requests at most two Red Hat files totalling at most 90 KiB and no Inter, Instrument Serif or JetBrains Mono file. Assert that the production `@font-face` rules declare normal style and the full pinned weight ranges, 400–800 for Red Hat Display and 400–700 for Red Hat Text. T: `design-tokens.spec.ts › one superfamily, within size`.
  3. Run the existing fidelity harness against the production build of `/`, using an in-memory `chrome/header` row marked built and a selector that matches the rendered header. Assert that the harness checked the row and returned zero font failures for either Red Hat family. For each family, a control run with unpinned bytes must produce a font failure for that family. T: `design-tokens.spec.ts › red hat files match the boards' pins`.
  4. Record three Lighthouse mobile runs against `next start` on `/` in `docs/perf/prv-26.json`. The median LCP is at most 3.8 s. On the PR that changes the record, assert that `measured_sha` is an ancestor of `PR_HEAD_SHA` and that no files under `app/`, `components/`, `content/`, `lib/` or `public/` differ between those commits. On every execution of the scenario, validate both records. For PRV-26, verify the route and Lighthouse version, exactly three runs with finite `perf`, `a11y`, `lcp_ms` and `cls` values and positive LCP, and stored medians that match the three runs. Apply the 3.8 s gate to the recomputed median LCP. T: `design-tokens.spec.ts › LCP within budget at the measured sha`.
  5. When a PR introduces `docs/tickets/PRV-26.md`, compare its base and head SHAs and fail if any changed path falls outside Scope. Include both paths of any rename. On the same base-to-head comparison, verify that the `jetbrainsMono`, `manrope` and `ibmPlexSans` declarations still use the same loaders, sources and options. T: `design-tokens.spec.ts › changes stay within PRV-26 scope`.

## Known gaps

- The ticket audit stopped after 2 rounds, per the portfolio ticket-audit cap (owner, 2026-11-24). Round 2's four warnings (exact asset paths, emitted weight ranges, full perf-record validation, other font declarations unchanged) are applied in this final fix pass and not re-audited.
