PRV-13
# Tally & Trace case study, current screens

**Planned:** Sonnet, S, wave 4

- **Goal:** The Tally & Trace case study shows February screens that no longer look like the product. Fill the case
  study's lead frame and Screenshots slots with current screens, built on made-up data, and keep a provenance
  record for each file.
- **Depends on:** PRV-8 (the photo script), PRV-12. **Precondition:** the orchestrator runs T&T ui-verify
  (`StudioSC-dev/tally-and-trace` at `main`, package `frontend`, out-dir `$S/uiv-PRV-13-<nonce>`, with `mockApi`
  serving the made-up `household` fixture). The handoff identifies the source PNG for each slot and includes the
  T&T commit SHA and run nonce, and stays available through the work audit. It hands over the four screens the board's slots need: the dashboard
  (the lead), Accounts and Transactions (`desktop`), and one screen in light mode. A slot whose screen is missing
  from the run blocks the ticket until a run provides it; no slot is dropped.
- **Scope:**
  - **Files:** may touch only `public/work/tallyandtrace/`, `docs/provenance/tallyandtrace.md`,
    `content/projects/tallyandtrace.mdx` (the `thumbnail`, `lead` and `screenshots` fields only),
    `e2e/case-tt.spec.ts`, and `docs/boards/sections.json`, `docs/boards/merged.json`.
  - WebP files ≤ 150 KB each under `public/work/tallyandtrace/`, with metadata stripped by PRV-8's script.
  - `docs/provenance/tallyandtrace.md`, outside `public/`, with one row per file: its sha256, the source PNG's
    sha256, the T&T sha and the run's nonce. It records no path.
  - Remove T&T's February `thumbnail` and set `lead` to the new dashboard WebP. PRV-11 uses that lead for the
    `/work` preview and verifies it in `home.spec.ts › work previews`.
  - The dashboard fills the lead frame, and the other three fill the Screenshots section's slots in the board's
    order, with the board's captions (Accounts, Transactions, Light mode). The Screenshots section stays, as
    drawn. The frames, their size and their captions follow the board; the pictures inside them are not
    compared with it (owner, 2026-11-20). Each alt text says the figures are made up; the visible captions are the board's words only.
- **AC:**
  1. T&T's `thumbnail` field is absent, and the rendered T&T case study and `/work` listing contain no
     `Screen_Shot_2026-02-24` image references. T: `case-tt.spec.ts › no February screens`.
  2. The lead frame loads the dashboard WebP. The Screenshots section loads exactly three WebPs in this order, with
     the visible captions "Accounts", "Transactions" and "Light mode". All four images have alt text that says the
     figures are made up. T: `case-tt.spec.ts › slots filled as drawn`.
  3. Each of the four published files is a WebP of at most 150 KB and has no embedded metadata after processing
     with PRV-8's photo script. At 1440 and 390, each screenshot's rendered image content aspect ratio is within 1%
     of the WebP's intrinsic ratio. AC6 checks the surrounding frames. T: `case-tt.spec.ts › light and true`.
  4. The provenance file contains exactly one row per published WebP. Each row gives the computed WebP SHA-256, the
     source PNG SHA-256, the T&T commit SHA and the run nonce. The file contains no filesystem paths. The work audit
     runs the scenario with the handoff and checks each row's source PNG hash, commit SHA and nonce against it. For each rendered slot (lead, Accounts, Transactions and Light mode), the work audit reruns PRV-8's photo script on that slot's handoff PNG using the publication settings. The regenerated SHA-256 must match the WebP the slot loads and the WebP hash in its provenance row. T:
     `case-tt.spec.ts › provenance matches`.
  5. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links; routes that later tickets build may still answer 404. The diff under `public/work/tallyandtrace/` consists of exactly four file additions, one for each WebP loaded in AC2. Within
     `content/projects/tallyandtrace.mdx`, only `thumbnail`, `lead` and `screenshots` may differ from the PR base.
     The only changes to the board files are the `built` flags for PRV-13's T&T screenshot rows and the addition
     of `PRV-13` to `merged.json`. T: `case-tt.spec.ts › changes
     stay within PRV-13 scope`.
  6. The rows this ticket builds (the T&T screenshot rows) are marked `built` in `docs/boards/sections.json`,
     `PRV-13` is added to `docs/boards/merged.json`, and PRV-22's fidelity suite (`e2e/fidelity.spec.ts`) passes
     for those rows at 1440 and 390 in light and dark, including the applicable owner-accepted deviations. Fidelity
     covers the visual look only: layout, spacing, type, colour, copy, image frames, section order, visible motion
     and both themes. It does not cover demo behaviour or exact easing. A width that no board draws is skipped and
     listed in the PR for QA. T: `case-tt.spec.ts › PRV-13 fidelity rows`.
