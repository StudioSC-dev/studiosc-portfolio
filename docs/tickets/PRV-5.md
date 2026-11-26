# The opener, the range and the Central Command plate

**Planned:** Opus, L, wave 2

- **Goal:** the current homepage introduces the studio without showing the breadth of its work. Give visitors a
  way to explore seven kinds of work from the opening screen and see a concrete example immediately. Open on
  Central Command in Dashboards and make the experience available at `/preview/home` ahead of the public
  homepage switch (owner, 2026-11-20).
- **Depends on:** PRV-2, PRV-3. **Precondition:** the orchestrator pins a CC sha only if a CC test runs the
  drawn check; otherwise the CC plate has no Christine line.
- **Scope:**
  - **`components/range/Opener.tsx`:** the h1, the intro, Start a project, Every project (to `#work`, as drawn;
    `/` keeps the old home until PRV-11 adds the list and flips the flag, so the public site has no dead link)
    and the dot fields (SVG, `aria-hidden`, accent stroke).
  - **The load moment** (§2): once per page load. Later interactions never replay it.
  - **`Range.tsx` (server) and `RangeSwitch` (client store):**
    - the whole shell as the board draws it: the seven tab pills (desktop) or seven chips with scroll buttons
      (phone), back, the "n of 7" counter and next, and both peeks. The board has no carousel Pause: its Pause
      belongs to the turntable plate, which PRV-7 builds;
    - the peeks, drawn from each plate's fixture, `aria-hidden` and `inert`;
    - every configured plate rendered on the server, with the non-selected ones `hidden`;
    - back, the counter (`aria-live="polite"`) and next, wrapping around;
    - the word swap and the directional slide. The counter's polite region also announces the new word, for
      example "Dashboards, 1 of 7: dashboards".
  - **`Plate.tsx`:** real and lab variants, the credit line, `ChristineLine`, and the `figure` with its caption.
    The credit line's names are plain text until PRV-8 adds the person anchors and links them.
  - **`fragments/central-command/`:** the day feed (server). Six made-up entries, four on a phone; one colour
    per source; each entry names its source; the fixture and the peek drawing.
  - **Content:** register all seven categories in `content/range.ts` in board order, using PRV-3's validated
    real and lab plate shapes and registered fragment IDs. Central Command is the only fragment implemented
    here. The other six entries render their board frame and title, including in desktop peeks. PRV-6 and PRV-7
    fill those existing entries in place. The PRV-3 validator remains in force.
  - **Home behind a flag:** `lib/flags.ts` holds `rangeHome: false`. The new home is composed in
    `components/home/RangeHome.tsx` and served at `/preview/home` (`noindex`, unlinked, out of the sitemap) while
    the flag is off. `/` stays the old home, and `homepage.spec.ts` is unchanged. Specs reach the new home through
    `e2e/support/home.ts`. `/preview/home` joins `urls.json` as a temporary route. PRV-11 flips the flag.
  - **Fidelity rows:** the opener, the range shell (tabs, chips, back, counter, next, peek frames and every
    plate frame and title) and the Dashboards plate in full (§2 decision 13), against the board itself, with no
    staged deviation. The other plates' interiors (fragment, facts, captions, peek drawings) are separate rows
    in `sections.json` that PRV-6 and PRV-7 build and mark `built`.
- **AC:**
  1. Seven tabs (1440) and seven chips (390) in board order, one plate per category, with exactly one visible:
     Dashboards on load. The counter reads "n of 7". Each plate not built yet shows only its frame and title, as
     drawn. With JavaScript disabled, all seven plates are present in the server HTML and the six unselected
     plates have `hidden`. At 1440, the two peeks show the previous and next categories, including the wrap from
     Testing to Dashboards. At 390, the phone board shows the active plate without side peeks. The scenario loads the shipped
     `content/range.ts`, runs PRV-3's validator, and asserts exactly seven categories in board order with their
     registered fragment IDs, matching the rendered controls and plates. T:
     `range.spec.ts › the whole shell`.
  2. A tab, chip, back or next shows that plate and sets `aria-pressed` and the counter; back and next wrap.
     After each selection, exactly one plate is visible and exactly one category in the active control row has
     `aria-pressed="true"`. The counter and desktop peeks match the new selection. The selection advances only
     on visitor input. T: `› every control picks a plate`.
  3. The h1 reads "We build <word>. We break them first.", with each category's word in `--accent`, and is the
     page's only h1. On load the word is "dashboards". T: `› the word follows the tab`.
  4. After a change, the word animates for 280 ms, the plate for 240 ms, and the desktop peeks fade for 240 ms.
     Next enters from the right and Previous from the left, including when wrapping. A direct category pick
     enters from the right for a higher board index and from the left for a lower one. The plate's animation is
     `plate-from-left` or `plate-from-right`, matching the side it came from. Once its animations finish, the
     plate's transform is none and its opacity 1. Under reduced motion, no change computes an animation and the
     final state applies at once. The polite region announces the new word. T: `› swap motion, fallback and
     announcement`.
  5. On load, without reduced motion, the headline lines compute `rise` at 560 ms (the second with a 90 ms
     delay), the dot fields `fade-in` at 900 ms. At 1440, tabs fade for 420 ms after 360 ms and the stage enters for
     640 ms after 220 ms. At 390, chips fade for 420 ms after 300 ms, and the stage has no load animation. After
     the load animations, the headline, category controls and stage are at full opacity with no animation
     transform. Dot artwork retains the board's settled theme opacity and orientation. No later
     tab, back, next or theme action computes any of these animations again on that page. Under reduced motion,
     none is computed, and the first screenshot already shows the final state. T: `› load moment plays once`.
  6. The peeks are `aria-hidden` and hold nothing focusable. Both desktop peeks are `inert`. Tab order runs
     through the tabs, the plate, then back and next. At 390, keyboard focus reaches the scroll-back button, the
     chips, the scroll-forward button, any links in the selected plate, then Previous plate and Next plate. T:
     `› peeks are drawings`.
  7. At 390, each scroll button moves the chip row in its labelled direction when there is room to scroll and
     leaves the selected category unchanged. Selecting a chip centres it within ±8 px where the scroll range
     allows. At either end, the row stops at the nearest scroll limit and keeps the selected chip visible. The
     page has no horizontal scroll. T: `› phone chip row`.
  8. The day feed is in time order, with six entries at 1440 and four at 390, every one from the synthetic
     fixture and naming its source in words, one colour per source. The `central-command` folder holds no
     `"use client"`, and the plate fits 390. The production HTML contains the day-feed entries with JavaScript disabled. T: `› day
     feed`.
  9. The Central Command credit reads "Built by Seth · Tested by Christine" in plain text, with no links yet.
     With a valid, audit-pinned Central Command `christineCheck`, the plate renders the supplied check text.
     With the check absent, the entire Christine line is absent and the credit remains. "Illustrative wording"
     is absent in both cases. T: `› credit and Christine lines`.
  10. On the production build, sum the gzip sizes of distinct client chunks introduced by the Range, including
      its client dependencies and chunks first loaded during selection. Count shared chunks only if the Range
      introduces them to the preview route. The total is ≤ 8 KiB. On `/preview/home`, the Chromium
      layout-shift sum is 0 over PRV-1's no-interaction window, from navigation to five seconds after `load`.
      `docs/perf/prv-5.json` records a median mobile Lighthouse LCP of ≤ 3.8 s under the epic's perf JSON rule.
      T: `› small client, LCP holds`.
  11. While `rangeHome` is off, `/` retains the existing homepage content, links and navigation behaviour, and
      the unmodified `homepage.spec.ts` passes. `/preview/home` serves the new home with `noindex`, has no
      public navigation links to it, and is absent from the public sitemap. `e2e/fixtures/urls.json` includes
      it as a temporary route and `e2e/support/home.ts` targets it. At 1440 and 390, Start a project points to `/contact`, Every project to
      `#work`, Read the case study to `/work/central-command`, and Open the demo to
      `https://centralcommand.studiosc.dev`. T: `› home behind the flag`.
  12. Mark the opener, range shell and complete Dashboards plate as built in `docs/boards/sections.json` for
      `/preview/home`. PRV-22's fidelity suite (`e2e/fidelity.spec.ts`) must pass for those rows at 1440 and
      390 in light and dark, including drawn interaction states and the applicable owner-accepted deviations.
      Interior rows assigned to PRV-6 and PRV-7 remain unbuilt. The named scenario checks the row assignments
      and that the fidelity suite ran on them. T: `range.spec.ts › PRV-5 fidelity rows`.
  13. The diff against the PR base touches only these paths: `components/range/`, `components/home/RangeHome.tsx`,
      `content/range.ts`, `lib/flags.ts`, `app/preview/home/`, `e2e/range.spec.ts`, `e2e/support/home.ts`,
      `e2e/fixtures/urls.json`, `docs/boards/sections.json`, `docs/boards/merged.json` and
      `docs/perf/prv-5.json`. Any other path fails, and `e2e/homepage.spec.ts` is unchanged. Against the PR base, `urls.json` gains only the
      `/preview/home` entry, `sections.json` changes only the PRV-5 rows in AC12, and `merged.json` gains only
      `PRV-5`. T:
      `range.spec.ts › changes stay within scope`.

## Known gaps

- The day-feed module could still enter the client graph through an import while its HTML renders: the PR diff auditor should confirm no client component or chunk on `/preview/home`, including chunks loaded during selection, imports `fragments/central-command/`.
