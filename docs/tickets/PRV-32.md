PRV-32
# Keep the hinting in the fragment sans

**Planned:** model chosen by the orchestrator (no routing row), S, wave 3 fix (unblocks the width rows on the Finance and AI plates)

- **Goal:** the site's fragment sans (`app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2`, "SSC Fragment Sans", 31,644 bytes) sets text 5–12px wider than the boards in Chromium on Linux. For example, "Customer message" at 13px/600 is 125px wide against the board's 113px.
  - **What a diagnosis found (2026-11-27):** the cut has the same outlines, advances, kerning and axes as the board's IBM Plex Sans v23 Latin file. The only difference is hinting: PRV-2's recipe dropped the TrueType hinting tables (`fpgm`, `prep`, `cvt `, `cvar`). Hinted renderers then round each glyph advance differently.
  - **The trial:** a re-cut from the board's own pinned files that keeps hinting is 34,904 bytes and matches the board widths exactly in the test Chromium. The re-cut keeps wght 400–600, Latin, and U+20B1 grafted from the Latin Extended file, and is renamed "SSC Fragment Sans".
  - **Owner ruling (2026-11-27):** "Switch to the hinted copy".
- **Depends on:** PRV-31 (D16, the `font` deviation that binds the cut's SHA-256).
- **Scope:**
  - **`app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2`:** replaced by the hinted re-cut, at the same path, served by the same `ibmPlexSans` declaration with unchanged options.
  - **`scripts/fonts/`:** the recipe that builds the cut from the two pinned files in `docs/boards/fonts/`, so the committed bytes are reproducible. It may use Python fontTools run from a pinned, documented environment outside `node_modules`; the repo's npm dependencies stay unchanged. The recipe:
    - instances wght to 400–600;
    - keeps hinting, `GPOS`, `GSUB`, `GDEF`, `fvar`, `gvar`, `HVAR`, `MVAR` and `avar`;
    - grafts U+20B1 from the Latin Extended file;
    - renames every name-table string so none contains "Plex", keeping the copyright (ID 0) and the licence URL (ID 14).
  - **`docs/boards/deviations.md`:** D16's built SHA-256 becomes the new file's. Every other cell, including `accepted`, stays as at the PR base. The owner approved this change in the ruling above.
  - **`docs/design-system.md` and the comment in `lib/fonts.ts`:** describe the new recipe (hinting kept) and its size.
  - **`e2e/design-tokens.spec.ts`:** PRV-2's IBM Plex Sans assertions move to the new bytes, plus the AC scenarios below.
  - **`e2e/fidelity-harness.spec.ts`:** only where PRV-31's tests hold the old SHA-256.
  - **`docs/tickets/PRV-32.md`:** this ticket.
  - No other change.
- **AC:**
  1. **The recipe reproduces the file.** Running it on the pinned board files reproduces the committed file byte for byte, and two runs give the same SHA-256.
     - T: `design-tokens.spec.ts › the fragment sans rebuilds from the board pins`.
     - **When CI may skip it:** only if the pinned recipe environment is unavailable, with the missing prerequisite named in the skip reason. A recipe error or byte mismatch fails the scenario.
     - **If CI skips it:** attach the passing local scenario result and both output hashes to the PR.
     - **Recording the hash:** the recipe's output SHA-256 goes in D16's built hash field.
     - **Every CI run:** `design-tokens.spec.ts › the committed fragment sans matches the recorded recipe hash` hashes the committed WOFF2 and fails if the digest differs from D16.
  2. **The file's contents.**
     - The file contains `fpgm`, `prep`, `cvt `, `cvar`, `GPOS`, `GSUB`, `GDEF`, `fvar`, `gvar`, `HVAR`, `MVAR` and `avar`.
     - Its `wght` axis has a minimum of 400 and a maximum of 600.
     - Its Unicode character map equals that of the pinned board Latin file plus U+20B1 from the pinned Latin Extended file.
     - No name-table string contains "Plex".
     - Name ID 0 and ID 14 equal the board file's.
     - The file is under the 40 KiB fragment-font gate.
     - `app/fonts/ibm-plex-sans/OFL.txt` stays.
     - T: `design-tokens.spec.ts › one superfamily, within size` (updated).
  3. **Widths match the boards.** Every sample in PRV-31's width table is tested: the AI plate's control and texts, and the Finance plate's controls and texts, including the ₱ total.
     - **Fixtures:** copy every sample row from PRV-31's `scratchpad/agent-prv-31/measure.out` into the named scenario as a fixture, keeping the plate, sample label, literal text, CSS size and numeric weight.
     - **The check:** in Linux Chromium, measure each row after the fonts load. The hinted cut must be within 0.5px of the pinned board Latin and Latin Extended pair.
     - **The control:** load the WOFF2 from the PR base. Every row whose recorded old-cut difference exceeds 0.5px must exceed the same tolerance. T: `design-tokens.spec.ts › the fragment sans sets the boards' widths`.
  4. **D16 binds the new bytes.** D16 accepts only the new SHA-256, and every other D16 cell equals the PR base. PRV-31's fixture and production cases pass with the new bytes and fail with the old ones. T: `fidelity-harness.spec.ts › font rows are exact and signed` and `design-tokens.spec.ts › the fragment sans matches both production board rows`.
  5. **Scope.** This applies on the PR that introduces `docs/tickets/PRV-32.md`.
     - **Inputs:** in CI, use the pull request event's base and head SHAs. For local evidence, pass the same SHAs explicitly. Git must have the history needed to resolve their merge base.
     - **The scenario fails if:**
       - either SHA or the merge base is unavailable;
       - `git diff --name-only --no-renames <base>...<head>` lists a path outside Scope;
       - the `ibmPlexSans` declaration or any of its options differs from the PR base. Completion also requires the CI `test` job to pass at the PR head. T: `design-tokens.spec.ts › changes stay within PRV-32 scope`.

## Known gaps

- Hinting affects only hinted renderers. On renderers that ignore hinting (macOS, for example), the old and new cuts lay out the same. The fidelity harness runs Linux Chromium, which is where the boards were drawn and where the difference shows.
- The ₱ glyph is grafted by hand, not by a standard tool. AC3's ₱ total measures its advance against the board's Latin plus Latin Extended pair.
- Ticket audit round 1 (Sol) returned GO-WITH-FIXES with four criteria warnings. Its replacement text was applied verbatim in a final fix pass, which was not re-audited (portfolio ticket-audit cap, owner 2026-11-24).
