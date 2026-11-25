PRV-2
# Design system, tokens and motion (Range)

**Planned:** Opus, M, wave 1

- **Goal:** the Range system written down and wired, so later tickets only compose.

- **Depends on:** PHB-28, PRV-1 and PRV-22 must merge before PRV-2 runs its first ui-verify. Use PRV-22's
  fidelity check in that run.
- **Scope:**
  - `docs/design-system.md`: the §2 tokens in both themes, type, shape, layout, the motion table with its
    fallbacks, focus, and the components (tab pill, chip row, plate, peek, credit line, Christine line, lab tag,
    person frame, Holly's pile, ruled list, buttons), quoting the boards.
  - `app/globals.css`:
    - **tokens:** light on `:root`, dark on `:root[data-theme="dark"]`, and the dark values again under
      `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`, the no-JS fallback that exists today;
    - the `--frag-*` palettes;
    - **the old tokens until they are retired:** `--paper`, `--surface`, `--sunken`, `--line`, `--line-strong`
      and `--body` alias the nearest Range token (`--gallery`, `--plate`, `--peek`, `--rule`, `--rule`, `--ink`),
      so pages not yet rebuilt render in the Range palette. `--ok`, `--warn`, `--info` and `--danger` keep their
      light and dark values. The `--dark-*` set goes, since `[data-theme="dark"]` now carries the dark values;
      the four status tokens' dark values (`#a3b18a`, `#d9a05b`, `#a8a29e`, `#e0918a`) are written inline in the
      `[data-theme="dark"]` block and in the media-query fallback. PRV-18 deletes every alias left unused;
    - every board keyframe: `rise`, `stage-in`, `fade-in`, `word-in`, `plate-from-left`, `plate-from-right`,
      `plate-fade`, `tick-in`, `stream-in`, `turn`, `wiggle-a`, `wiggle-b`, `ears-a`, `ears-b`, `tuck-a`,
      `tuck-b`, `untuck-a`, `untuck-b`, `theme-reveal`, and the view-transition rules;
    - the reduced-motion rule (`[data-motion]` animations off, `[data-fade]` transitions off, no
      view-transition animation);
    - grain and mottle removed; `.label`, `.subhead` and the display class in sentence case;
    - **focus:** a 2px ring in `--focus` at a 3px offset. `--focus` is `--accent` on the page, and
      `[data-fragment]` and the turntable stage set their own `--focus` that meets 3:1 on their surfaces.
  - `app/layout.tsx`: Red Hat Display and Red Hat Text (Latin, `display: 'swap'` unless fallback step 3 applies to the heading face, `adjustFontFallback`) in place
    of all three faces. JetBrains Mono 400 with `preload: false`, on `pre` and `code` only. `lib/fonts.ts` also
    exports the fragment faces the board draws, IBM Plex Sans and Manrope (Latin subset, the weights the board's
    fragments use, `preload: false`), used only under `components/range/fragments/`. Lucide remains the only icon library. The existing `LinkedInIcon` stays until PRV-18 removes it.
  - Tests and records: `design-tokens.spec.ts`, its supporting fixtures and `docs/perf/prv-2.json`.
- **Font fallback, in order:**
  1. Trim the weight axes to the weights in use.
  2. Set headings in Red Hat Text 600 to 700. The owner is told.
  3. Set `display: 'optional'` on the heading face.
  4. If a perf gate fails because of a fragment face, the ticket that measured it records a deviation for that
     face in `docs/boards/deviations.md`, with the measured cost, for the owner to sign. Nothing else changes. `docs/boards/deviations.md` may change only to record a fragment-font deviation measured by PRV-2 under fallback step 4.
- **AC:**
  1. In each explicit theme, every documented root colour token matches its computed value on `:root`, and every
     documented context-specific colour token matches on its specified fixture. The six legacy aliases resolve to
     their listed Range tokens, the four status colours keep their listed values, and declarations for the retired
     `--dark-*` set are absent. T: `design-tokens.spec.ts › tokens match the doc`.
  2. Every text pairing in the doc is at least 4.5:1, including the accent pairs in §2 and each product palette's
     text. A fixture pairing below 4.5:1 makes the check fail. T: `design-tokens.spec.ts › pairings meet contrast`.
  3. Headings compute to Red Hat Display by default, or to Red Hat Text at the selected weight from 600 to 700 if
     fallback step 2 is used. Body text computes to Red Hat Text. Record which of steps 1 to 3 were applied in `docs/perf/prv-2.json`, using an empty list for the default configuration. Assert the resulting heading family, weight and `display` setting, and verify that step 1 limits the font weights to those in use when applied. Verify the scoped Latin subsets, Red Hat `adjustFontFallback` settings, and the board weights and `preload: false` for both fragment faces. In either
     case, `/` requests zero Inter, Instrument Serif or JetBrains Mono files and at most two Red Hat files totalling
     at most 90 KiB. On fixture fragments, text under `[data-fragment="tallyandtrace"]` and `"form-helper"` computes
     to IBM Plex Sans, and under `"central-command"` and `"habit-tracker"` to Manrope. A fragment-font limit may be exceeded only when an owner-accepted deviation identifies the face, the failed gate and the measured cost. Each fragment face is at most 40 KiB per route and is requested only on a page that renders its fragment. On a code fixture, JetBrains Mono
     400 applies only to `pre` and `code`, and its font declaration uses `preload: false`. T:
     `design-tokens.spec.ts › one superfamily, within size`.
  4. On the six routes in §1's performance baseline, `.label`, `.subhead` and `.font-serif` compute to `text-transform: none`, and
     `.label` letter-spacing is at most 0.01em. A fixture `.label` with 0.02em fails. T:
     `design-tokens.spec.ts › labels are sentence case`.
  5. Under reduced motion, animations are disabled on `[data-motion]`, transitions are disabled on `[data-fade]`,
     and view transitions run without animation. Without reduced motion, the same elements animate. T:
     `design-tokens.spec.ts › reduced motion`.
  6. In both themes, keyboard focus shows a 2px ring at a 3px offset using the element's computed `--focus`. On the
     page, `--focus` resolves to `--accent`. A mouse click on the same control shows no focus ring. T:
     `design-tokens.spec.ts › focus ring on keyboard only`.
  7. With JavaScript disabled and no `data-theme` attribute, the root colour tokens, legacy aliases and status
     colours match the corresponding explicit theme under both light and dark system preferences. T:
     `design-tokens.spec.ts › no-JS theme fallback`.
  8. On fixtures, the computed ring colour is at least 3:1 against the surface behind every focusable element
     inside `[data-fragment]` and on the turntable stage, in both themes. A fixture ring below 3:1 fails. Later
     fragment tickets re-run this test on their real fragments. T: `design-tokens.spec.ts › focus ring contrast`.
  9. `docs/perf/prv-2.json`: the median of 3 Lighthouse runs on `/` has LCP at most 3.8 s, under the perf JSON rule.
     T: `design-tokens.spec.ts › LCP within budget at the measured sha`.
  10. `app/globals.css` contains every keyframe listed in Scope and the board's view-transition rules. A missing
      keyframe fails. T: `design-tokens.spec.ts › board motion rules are present`.
  11. The shared styles contain no grain or mottle rules, and the diff introduces no new icon library or icon source. T:
      `design-tokens.spec.ts › shared surfaces and icons match Range`.
  12. `docs/design-system.md` covers the scoped type, shape, layout, focus and motion entries and fallbacks, and
      every listed component, with the corresponding board references. The inventory includes every scoped root and fragment colour token, all six legacy aliases, all four status colours and the required text pairings for both themes, checked against §2, the boards and Scope. An entry removed from the doc fails. T:
      `design-tokens.spec.ts › design system documentation covers the scoped inventory`.
  13. Relative to the PR base, the diff touches only the files and verification artifacts listed in Scope, and it
      preserves existing route content and navigation behavior: `/`, `/work`, `/work/tallyandtrace`, `/blog`, `/about` and `/contact` keep their rendered text and link destinations compared with the PR base. Same-origin navigation links that resolve on the base must still resolve to the same destination with a final status of 200. A link to a route assigned to a later ticket may retain its existing 404. External and non-HTTP link destinations are compared by `href`. A changed
      file outside Scope, or a removed route, fails. T: `design-tokens.spec.ts › changes stay within PRV-2 scope`.

## Known gaps

- Goal states the outcome without naming the current problem (no shared Range foundation); the PR diff auditor should check that tokens, typography, focus and motion are all documented and wired, not only some.
