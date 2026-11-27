# Recognise the fragment sans as the boards' IBM Plex Sans

**Planned:** model chosen by the orchestrator (no routing row), S, wave 3 fix (blocks PRV-6's and PRV-7's fidelity rows)

- **Goal:** the PRV-6 and PRV-7 writers found that every IBM Plex Sans text and control in the Tally & Trace ledger and the form helper fails the fidelity check. The board expects family "ibm plex sans" and the built page reports `ibmplexsans`, and its bytes match no board pin.
  - **What the site serves:** a deliberate PRV-2 cut (`app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2`, 31,644 bytes: Latin plus U+20B1, weights 400–600). Under the OFL's Reserved Font Name "Plex", that Modified Version is named "SSC Fragment Sans" internally, and PRV-2's typography scenario forbids the `IBM_Plex_Sans` constant form.
  - **The board's version:** Google's v23 Latin and Latin Extended files, 76,676 bytes together, over the 40 KiB fragment-font gate.
  - **Owner ruling (2026-11-27), "Keep the trimmed copy, sign a font exception":** the site keeps the cut. The fidelity check must accept it as the boards' IBM Plex Sans through one owner-signed deviation, without loosening anything else.
- **Depends on:** PRV-26 (merged).
- **Scope:**
  - **`scripts/boards/check.ts` and `scripts/boards/inpage.js`:** add a `font` deviation kind.
    - **What a row holds:** the board family (`IBM Plex Sans`), the built family (the name the site's face renders under), and the built file's SHA-256.
    - **While accepted and not expired:** for the rows' sections, states, widths and themes, the check treats the built family as the board family when it compares computed `font-family`. It accepts that one served file, matched by SHA-256, as the family's pin in the font-pin check.
    - **Still checked:** the face must load from a file the site served, cover every weight the text uses, and not be a `local()` or fallback face.
    - **Unchanged:** every other family, tolerance and comparison.
  - **`docs/boards/deviations.md`:**
    - describe the `font` kind in the register's prose;
    - add one row, D16: kind `font`; board `IBM Plex Sans`; built family plus the cut's SHA-256; `from` = the cut keeps the fragment font under the 40 KiB gate with the peso sign (owner ruling 2026-11-27); `accepted` = `owner, 2026-11-27`; `expires` = `-`;
    - at widths 1440 and 390 in light and dark, D16 covers `home/plate-finance-interior` in `tab-finance` and `plate-next`, and `home/plate-ai-interior` in `tab-ai`, each with its `-rm` variant. The row's cells list the union of those sections and states;
    - for both the family comparison and the pin check, D16 applies only when the selected reference capture records IBM Plex Sans in that section and state;
    - no other row changes.
  - **`lib/fonts.ts`:** only if the built family name has to become stable or deterministic for D16 to bind to it. It must not contain "Plex" in a form PRV-2's scenario forbids. The cut, its options and where it applies stay as they are.
  - **`e2e/fidelity-harness.spec.ts`:** AC1–AC3 and AC5.
  - **`e2e/design-tokens.spec.ts`:** AC4, using its existing `swapFontProxy`. Update its existing IBM Plex Sans assertions only if `lib/fonts.ts` changes.
  - **`docs/tickets/PRV-31.md`:** this ticket.
  - No change to `docs/boards/ref/`, `spec.json`, `sections.json`, `manifest.json`, the tolerances, or any page or component.
- **AC:**
  1. **D16 and the register prose.** D16 is in the register, with exactly the fields in Scope and `accepted` = `owner, 2026-11-27`. The prose describes the `font` kind. Every pre-existing row equals the PR base. T: `fidelity-harness.spec.ts › font rows are exact and signed`.
  2. **Fixture with the cut.** On the harness's fixture site, a row drawn in IBM Plex Sans on the board passes when D16 applies and the fixture serves the cut under the built family.
     - With D16 removed, the run reports an IBM Plex Sans `font-family` mismatch.
     - With D16 applicable, the run reports an IBM Plex Sans font-pin failure in each of these cases, asserted one by one:
       - different valid bytes load under the same family name;
       - the source is `local()`;
       - the font request fails;
       - a used weight falls outside the loaded face's range;
       - only a fallback face is available.
     - T: `fidelity-harness.spec.ts › the fragment sans stands for IBM Plex Sans`.
  3. **Bounds of D16.** D16 changes nothing outside its sections, states, widths and themes.
     - **One field at a time:** use a fixture copy of D16 and vary its section, state, width and theme one at a time. For each mismatch, the IBM Plex Sans failures equal those of the run without D16, including when an eligible row and an ineligible row share a page.
     - **Unsigned:** clear the `accepted` cell in a fixture copy; the family mismatch returns.
     - **Expiry:** give another signed fixture copy an expiry ticket. The same comparison passes before that ticket appears in the in-memory merged list and fails once it appears.
     - **Other families:** Red Hat, Manrope and JetBrains Mono rows are checked exactly as at the PR base.
     - T: `fidelity-harness.spec.ts › font rows change only their own family`.
  4. **Production build.** Inject the existing Tally & Trace ledger and form-helper fixtures into the production build of `/` through the existing test proxy. Run the fidelity harness with an in-memory built row for each and the committed register.
     - Assert that each row was drawn and compared, with zero font-family and font-pin failures for IBM Plex Sans.
     - Assert that the peso sign in the ledger renders from the cut.
     - **Use the real sections:** keep the real board section ids, and use in-memory section and merged-ticket overrides to compare against the full `tab-finance` and `tab-ai` reference captures. The partial captures on main omit the IBM Plex Sans keys.
     - **Prove the comparison ran:** for each fixture, verify that at least one IBM Plex Sans key from the reference was paired with a rendered key. Repeat with D16 removed from the in-memory deviations, and assert a `font-family` mismatch for that key.
     - T: `design-tokens.spec.ts › the fragment sans matches both production board rows`.
  5. **Scope and CI.** On the PR that introduces `docs/tickets/PRV-31.md`, `git diff --name-only --no-renames <base>...<head>` lists only Scope paths. The scenario checks:
     - that the tolerances, `spec.json`, `ref/`, `sections.json` and `manifest.json` equal the PR base;
     - that PRV-2's `one superfamily, within size` still passes.

     Completion also requires the CI `test` job to pass at the PR head. T: `fidelity-harness.spec.ts › PRV-31 changes only scoped paths`.

## Known gaps

- The owner accepted that text set in the cut may measure slightly differently from the board's Google files. Any width or position failure that remains after D16 is reported per row. It is not suppressed by D16, and it goes to the owner as a separate signed row if it cannot be fixed.
- Round 1 of the ticket audit reviewed an earlier design that served the board's files. That design was replaced by the owner's 2026-11-27 ruling, so this version starts its audit at round 2.
- The ticket audit stopped after 2 rounds, per the portfolio ticket-audit cap (owner, 2026-11-24). Round 2's five warnings are applied in this final fix pass and not re-audited: D16's exact sections and states, AC4 in design-tokens.spec.ts with `swapFontProxy`, failure-specific AC2 cases, AC3's one-at-a-time bounds with unsigned and expiry cases, and AC4's proof that the IBM Plex Sans keys were compared.
