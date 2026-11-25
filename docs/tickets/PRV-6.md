PRV-6
# Tally & Trace, Sites and Testing plates

**Planned:** Sonnet, M, wave 3

- **Goal:** PRV-5 leaves Finance, Sites and Testing as empty plate shells. Complete those plates so visitors can
  see Tally & Trace's ledger, the portfolio site and how the studio tests it, inside the existing Range.
- **Depends on:** PRV-5. **Precondition:** before dispatch, the orchestrator supplies the pinned 40-character commit
  SHA for each verified line and records any line whose provenance is incomplete (PRV-1 AC10).
- **Scope:**
  - **`fragments/tallyandtrace/`:**
    - the ledger (client, sorting only): Bill, Due and Amount sort with `aria-sort`, defaulting to Due
      ascending;
    - right-aligned tabular amounts;
    - an overdue row says "overdue" in words and is the only red;
    - the total row equals the rows' sum;
    - the fixture and the peek drawing. The bill and account labels are the made-up ones drawn on the Range
      boards (the controlling boards win), from a local synthetic fixture, with no real financial data.
  - **`fragments/portfolio-site/`:** the site drawn small, with the board's caption.
  - **`fragments/route-checks/`:** at 1440, the table shows six routes and the ticks land 70 ms apart each time
    Testing is selected. At 390, the table shows four routes with static Pass text in both result columns, as
    drawn.
  - **Content:** Finance (with T&T's sourced line), Sites and Testing in `content/range.ts`, in board order.
  - **Fidelity:** the Finance, Sites and Testing interior rows (fragment, facts, captions, peek drawings) are
    marked `built` in `docs/boards/sections.json` and checked by PRV-22's `e2e/fidelity.spec.ts`.
  - **Edit boundary:** the diff stays inside the three fragment folders, their entries in `content/range.ts` and
    the existing Range integration in `components/range/`, the three fidelity rows in
    `docs/boards/sections.json`, `docs/boards/merged.json` (this ticket's id), `e2e/range.spec.ts` and
    `e2e/real-plates.spec.ts`. `e2e/fixtures/urls.json` is a read-only input. The home flag, route
    implementations, shared Range behaviour and the other four plates are untouched.
- **AC:**
  1. Finance, Sites and Testing render their completed interiors and peeks in their existing slots. The seven tab
     labels and their order, the initial Dashboards selection, and the content and behaviour of the other four
     plates match the PR base. T: `range.spec.ts › the whole shell`. The full `range.spec.ts` suite also passes. During the PRV-6 work audit, run this comparison against the
     audited PR base and head. In routine CI, `the whole shell` checks the stable shell and the three completed
     interiors, including their desktop peeks.
  2. Every rendered row, entry and route comes from a synthetic fixture, and each caption is the board's. T:
     `real-plates.spec.ts › made-up fixtures`.
  3. The Testing plate shows the board's six route rows at 1440 and four at 390, excluding the header. Every
     path in the route-check fixture is in `e2e/fixtures/urls.json`. T: `real-plates.spec.ts › real routes`.
  4. At 1440 and 390, the ledger starts in Due ascending order. Bill, Due and Amount each sort the correct values
     in both directions. Selecting the active header again reverses the order, and `aria-sort` identifies the
     active column and direction. In every order, the tabular amounts share one right edge (±1px) and the total
     equals the sum of the data rows. Only overdue rows contain red text, and each says "overdue". T:
     `real-plates.spec.ts › ledger`.
  5. Each time Testing is selected at 1440, all 12 drawn ticks compute `tick-in` in table order, with delays 70
     ms apart, and finish at opacity 1. Under reduced motion, all 12 ticks are immediately visible with no
     computed animation. At 390, all eight Pass results are visible when Testing opens and compute no tick
     animation under either motion preference. T: `real-plates.spec.ts › ticks land`.
  6. The Sites folder holds no `"use client"`, every plate fits 390, and the range's client JS, ledger included,
     stays ≤ 8 KiB gzip (PRV-5 AC10's limit). T: `real-plates.spec.ts › static, phone-fit, small`.
  7. Finance cites `StudioSC-dev/tally-and-trace`, `frontend/e2e/amounts.spec.ts` and `amount styling preserves
     transaction layout`. Testing cites `StudioSC-dev/studiosc-portfolio`, `e2e/guards.spec.ts` and `every route
     renders without a console error`. Each citation uses its orchestrator-pinned 40-character SHA. For each line independently, the scenario
     verifies that complete provenance renders the line with its specified repo, file, test title and pinned SHA,
     and that incomplete provenance omits the entire line. No "Illustrative wording" text appears. T:
     `real-plates.spec.ts › lines are real`.
  8. At 1440 and 390, the ledger renders the bill and account labels drawn on the Range board for that width,
     from the synthetic fixture. T: `real-plates.spec.ts › ledger labels match the boards`.
  9. The `real-plates.spec.ts` scenario `PRV-6 fidelity rows` asserts that the Finance, Sites and Testing
     interior rows are marked `built`. On the same head, PRV-22's existing `e2e/fidelity.spec.ts` must run and
     pass the checks for those three rows at 1440 and 390 in light and dark. T:
     `real-plates.spec.ts › PRV-6 fidelity rows`.
  10. The diff against the PR base touches only the paths in the edit boundary above; any other path fails. Within `content/range.ts` and `docs/boards/sections.json`, changes are limited to the
      three named plate entries and their interior rows. The only change to `docs/boards/merged.json` is the
      addition of `PRV-6`. The scenario fails on any other change to those files, and exercises the allowlist with
      allowed and disallowed fixture diffs. During the PRV-6 work audit, run this check against the audited PR
      base and head. T:
      `real-plates.spec.ts › changes stay within scope`.
