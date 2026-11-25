PRV-22
# Board references and the fidelity check

**Planned:** Opus, L, wave 1

- **Goal:** make §2 decision 13 checkable with numbers: the boards in the repo, committed references that need
  no runtime, and a fidelity check that fails on visual drift (layout, spacing, type, colour, copy, image frames,
  section order, visible motion, both themes).
- **Depends on:** PRV-1 (`shot()`, the image guard, the denylist and the pre-push hook). **Preconditions:** the
  designer's updated home and profile boards (Central Command first, the photo of the three of us after Holly)
  are published. The ledger amounts on the boards are made up and fine to publish (owner, 2026-11-20, §6 Q21).
  PRV-2's ui-verify depends on this ticket.
- **Initial import and later updates:** PRV-22 imports the five home and profile boards, the 20 version-24 page
  boards below and the photos, and makes every reference through `boards:regen`. A later update is a follow-up
  commit on main that replaces one board's export (and any photo it changes), updates that board's manifest pins
  and regenerates only that board's references and `spec.json` entries through `boards:regen`. No other reference
  changes in that commit. An update lands before the ui-verify of the ticket it gates.
- **Scope:**
  - **`docs/boards/`:** the five `range-*.dc.html` home and profile boards, the page boards below, the `range-*`
    stickies from `canvas.json` (as `stickies.json`) and the 12 photos in `img/`, copied from the published
    canvas. Nothing else from the canvas:
    the other directions stay out. Before the commit, the image guard passes on every photo and the denylist and
    pre-push check on every file. Checked on 2026-11-20 against v14: no photo holds Exif, XMP or a comment,
    Appendix A finds nothing, and the only addresses are the studio emails and public LinkedIn, GitHub and
    product links.
  - **Byte-exact exports:** `.prettierignore` excludes `docs/boards/`, and so do the lint-staged formatter
    entries (eslint and prettier) only, so formatting never rewrites a board. The staged-image metadata entry
    still covers `docs/boards/`, so every board photo is checked on every commit.
  - **References, committed and runtime-independent (§6 Q23):** `docs/boards/ref/` holds, for every reference
    state, a lossless WebP shot and the measured values in `spec.json`. CI and every verifier worktree use only
    these committed files, so nothing needs the runtime or a network fetch.
  - **Regeneration gate:** `npm run boards:regen` is the only way to change `ref/` and `spec.json`. It needs the
    canvas runtime (`support.js`, the canvas type's file, never committed) and the board fonts, each at the
    sha256 pinned in `docs/boards/manifest.json`. One rule covers the runtime: regen uses the copy in the
    gitignored `.cache/boards/` and, when the cache is empty, fetches it from the published canvas into it. Either
    way it checks the bytes against the pinned sha256 before rendering, and on a mismatch it exits non-zero and
    writes nothing. CI and verifiers never run regen and never need the runtime: they use the committed refs.
    The fonts the boards load from Google Fonts (Red Hat Display, Red Hat Text, IBM Plex Sans, Manrope) are
    committed under `docs/boards/fonts/` (OFL), pinned by sha256, and served to the board by request routing, so
    no font is fetched. Every reference records the board sha256, runtime sha256 and font sha256s it was made from.
    A CI check fails when a board's sha256 differs from the manifest or a reference was made from a different one.
  - **Pinned rendering, for boards and site alike:** Chromium only, viewports 1440×900 and 390×844, DPR 1, the
    pinned fonts loaded before capture, local images only, fixture data, and the clock fixed at
    2026-11-20T12:00:00+08:00 (`page.clock`), so Holly's age and any date render the same.
  - **Reference states:** for each section and width, light and dark. Dark comes from the boards' own rendered
    dark states: the dark desktop board, and the theme toggle on the phone and both profile boards. Interactive
    states: the state each drawn control leads to in the Controls check below (each tab, Holly's prints 1 to 6
    and after a treat, each Gallery photo, each contact state), and the theme reveal in flight.
    Reduced-motion references carry an `-rm` suffix on `<state>`; all others are captured with motion on.
  - **`docs/boards/sections.json`:** maps the boards' section ids (`range-title`, `people`, `holly-title`,
    `writing-title`, `work`, `contact-title`, `seth`, `christine` and the rest) to site sections, in board order.
    Each row names the ticket that builds it and carries a `built` flag, which that ticket sets. For a partial
    build, the row also names its ticket-specific reference state: the elements in scope now, and the elements
    a later ticket adds, each as an expiring deviation that names that ticket. Partial-build rules:
    - **Board selection:** each row names its site route and, for each width and theme, its source board and
      state. An undrawn width is skipped and listed for QA, never failed.
    - **Order:** the built rows are compared in the order those same rows have on the source board; unbuilt rows
      are skipped.
    - **Section gaps:** a gap is checked only between two built sections that are adjacent on the source board,
      never beside an unbuilt section.
    - **Inside a section:** every check applies the row's ticket-specific reference state.
  - **`e2e/fidelity.spec.ts`,** run in CI on every `built` row at both widths and both themes. Each check below
    must hold, with the stated tolerance:
    - **Order:** section order equals the board's, exactly.
    - **Geometry:** each section's box has x and width within ±2px and height within ±4px. Each key element (h1,
      tab pill, plate, peeks, controls, person panels, photos, buttons) is within ±2px of the board in x, y
      (relative to its section), width and height.
    - **Spacing:** the vertical gap between consecutive sections, and between each key element and the next, is
      within ±2px.
    - **Type:** family exact, size exact, line height ±0.5px, tracking ±0.005em, weight exact.
    - **Colour:** every token and every key element's text, background and border colour exact.
    - **Copy:** each section's text equal after whitespace normalisation.
    - **Imagery frames:** each image frame's box, aspect ratio, radius and border match the board. What is inside
      a frame (a photo, a screenshot) is not compared with the board (owner, 2026-11-20).
    - **Controls work (a simple check, not a behaviour matrix):** each drawn control does its visible job once,
      and the state it leads to passes the visual checks above: a tab, chip, back or next switches the plate; the
      theme toggle switches the theme; Holly's next and treat change the print; the Gallery's next advances; a
      filter narrows its list; a Writing view link opens its view; and the contact form reaches its error and sent
      states through its own controls (with the API mocked, never through the boards' mock-up strip). The lab
      demos' inner behaviour (ledger sort sequences, habit toggles, the draft-reply flow) is not part of the
      fidelity gate; each stays a functional AC of its own ticket.
    - **Motion, as the visible result:** for every motion in §2's table, the expected animation runs on the
      right element, its duration is within ±25% of the board's, and it moves in the board's direction (the
      plate enters from the side it came from, a print tucks to the back, the theme reveal grows from the
      toggle). Easing and delay are not asserted, and nothing is sampled frame by frame.
    - **Reduced motion:** under `prefers-reduced-motion: reduce`, no animation is computed, and every state
      matches the board's reduced-motion state.
  - **The verifier's pairs:** with `UI_VERIFY=1`, the spec also saves each committed reference next to the built
    section's shot, `fidelity/<section>-<state>-<width>-<theme>-{board,site}.png`, for a side-by-side read of
    anything the numbers miss. The pairs sit under Playwright's `test-results/`, which ui-verify-run collects.
    Writing them never relaxes a numeric check, and a verifier row that reports a visible mismatch in a pair is a
    FAIL row, even when the numeric checks pass.
  - **`docs/boards/deviations.md`:** each accepted difference is bound to a section, state, width, theme,
    property, the board's value and the expected built value, with the decision or question it comes from and
    the owner's acceptance. Only an accepted entry suppresses a mismatch. A deviation can expire, by naming the
    ticket that removes it. The expiry signal is `docs/boards/merged.json`, a tracked list of ticket ids that
    each gating ticket adds its own id to in its PR, read by CI and ui-verify alike. Once the named ticket is in
    that list, an unmet expired deviation fails. PRV-22 seeds `deviations.md` with these items,
    unaccepted until the owner signs, and starts `merged.json` empty. Nothing else is accepted in advance.
    - the turntable caption
    - the markers that never ship
    - the CV links hidden until PRV-19
    - Christine lines only when sourced
  - **Page boards (owner, 2026-11-20).** Published on the canvas (version 24) at 1440 and 390, light, with dark
    through the toggle, as `pages-<page>-desktop.dc.html` and `pages-<page>-phone.dc.html` in the canvas's
    "Pages" section (20 boards). The contact boards carry a mock-up-only state strip that is not part of the page.

    | Page and states | `<page>` | Gates |
    |---|---|---|
    | `/work` | `work` | PRV-11 |
    | `/work/[slug]`, drawn with T&T | `case` | PRV-12, PRV-13 |
    | `/blog/work` and `/blog/life` | `blog-work`, `blog-life` | PRV-14 |
    | `/blog/[slug]`, a technical post | `post-work` | PRV-14 |
    | `/blog/[slug]`, a life post with a Gallery | `post-life` | PRV-16 |
    | `/contact`: empty, error and sent | `contact` | PRV-15 |
    | `/about` | `about` | PRV-8 |
    | the 404 | `404` | PRV-9 (PRV-4's interim themed 404 is an expiring deviation ending at PRV-9) |
    | `/seth` and `/christine` at 390 | `seth` and `christine` (phone only) | PRV-10 |

    The designer is updating the boards for the owner's 2026-11-20 scope (BIS Karaoke, the wider skills, the
    profile galleries at both widths, and /work's preview images). Each updated board is regenerated through
    `boards:regen` before the ui-verify of the ticket it gates.

    `/blog` has no board and needs none: it redirects (308) to `/blog/work` (PRV-14). A ticket in the "Gates"
    column cannot pass ui-verify until its board is in `docs/boards/`.
  - **Undrawn states (owner, 2026-11-20: settled in QA):** a state that no board draws is listed in its ticket's
    PR with a shot, and the owner or QA decides on it in review. There is no approved-reference step, and the
    fidelity spec checks only what the boards draw.
- **AC:**
  1. `docs/boards/` holds exactly the five home and profile exports, the 20 version-24 page exports,
     `stickies.json`, the 12 photos under `img/`, `fonts/`, `ref/`, `spec.json`, `manifest.json`,
     `sections.json`, `deviations.md` and `merged.json`, and the manifest matches every input it pins. The check
     fails on a changed board or font byte, and on a reference whose recorded board, runtime or font sha256
     differs from the manifest. T: `fidelity-harness.spec.ts › boards pinned and stale references rejected`.
  2. The image guard, the denylist and the pre-push check pass on `docs/boards/`. T: `fidelity-harness.spec.ts ›
     committed boards pass the PRV-1 guards`, which runs PRV-1's image-metadata, docs-denylist and pre-push
     checks against `docs/boards/`.
  3. Committing a board file through the pre-commit hook leaves its sha256 unchanged, and staging a dirty copy
     of a board photo under `docs/boards/img/` is blocked by the image entry. T: `fidelity-harness.spec.ts ›
     exports stay byte-exact, photos still guarded`.
  4. `.cache/` is gitignored, and no committed file has the runtime's pinned sha256; a fixture tree that adds
     one fails the check. T: `fidelity-harness.spec.ts › runtime never committed`.
  5. In a fresh clone with an empty `.cache/`, the fidelity spec passes on the fixture site using the committed
     references only. Against a fixture canvas (a fixture board and a stand-in runtime served locally, pinned in
     a fixture manifest), `boards:regen` with an empty cache fetches the runtime, checks its sha256 and
     reproduces the fixture's references byte for byte; regenerating one changed board re-renders only that board,
     and every other board's references and `spec.json` entries stay byte-identical; and a fetched or cached
     runtime one byte off makes regen exit non-zero with the sha256 named and no reference written. T:
     `fidelity-harness.spec.ts › runs from an empty cache, regenerates exactly, refuses a mismatched runtime`.
  6. Against fixture pages that each differ from the references by one thing, the spec fails and names the
     section, state and value: a section moved 10px, swapped section order, a gap changed by 6px, a token, a font
     size, a word, an image frame 10px narrower, an animation that does not run, a duration doubled, a plate
     entering from the wrong side, an animation under reduced motion, a tab that does not switch the plate, and a
     Gallery next that does not advance. A fixture whose only change is the picture inside a frame passes, and so
     does the unchanged fixture. The scenario is parameterised over every property and tolerance in the scope
     (including frame aspect ratio, radius and border, and every listed control's visible result), at both widths
     and both themes, with at least one mismatch in a non-default state. For each numeric tolerance (±2px, ±4px,
     ±0.5px, ±0.005em, ±25%), a change at the limit passes and one just beyond it fails. Each failure names the
     section, state, width, theme, property, expected value and actual value. A partial-build fixture (an unbuilt
     row between two built ones) checks only the built rows' relative order, skips the gaps beside the unbuilt
     row, and fails when an in-scope element drifts. T: `fidelity-harness.spec.ts › catches each kind of drift`.
  7. Only an owner-accepted deviation matching the section, state, width, theme, property, board value and built
     value suppresses a mismatch; an unaccepted entry, or one differing in any of those fields, does not. Once
     the expiring ticket's id is in `merged.json`, the mismatch fails and a site value within the board's
     tolerance passes. T: `fidelity-harness.spec.ts › deviations are exact, accepted and expire`.
  8. Every row in `sections.json` names its building ticket, route and source board per width and theme, and
     every dark reference comes from a rendered board state; a drawn width and theme without a board fails, and
     an undrawn width is skipped and listed for QA. T: `fidelity-harness.spec.ts
     › sections mapped, dark from the boards`.
  9. With `UI_VERIFY=1`, the spec writes one readable PNG pair,
     `test-results/fidelity/<section>-<state>-<width>-<theme>-{board,site}.png`, the two of equal pixel size, for
     every checked section, state, width and theme. Against a drifted fixture it still writes the pair and still
     fails, and a verifier row reporting a visible mismatch while every numeric check passes fails the run. The
     diff touches only this ticket's paths (`docs/boards/`, the fidelity specs and fixtures, the boards scripts,
     `package.json`, `.gitignore`, `.prettierignore`, the hook and the CI workflow); any other path fails. T:
     `fidelity-harness.spec.ts › writes verifier pairs, fails on a mismatch, leaves the site unchanged`, plus
     `git diff --name-only <base>...HEAD` on the merge candidate.
- **No ui-verify:** it changes no page. Its checks are first applied on PRV-2's run.

## Known gaps

- **Accepted deviation, lossy reference shots (owner, 2026-11-25).** The Scope asks for "a lossless WebP
  shot"; `boards:regen` writes lossy WebP at quality 0.85 instead (23 MB in 704 files, measured at this regen, for every state, reduced motion
  and in-flight states included, against several times that lossless). The numbers the fidelity spec checks are
  measured, never read from the shots, so only the verifier's side-by-side read is affected: fine edges and
  colours in a board shot can differ slightly from the canvas. Each shot's sha256 is recorded in `spec.json`.
- **Fragment palettes are not compared.** The boards define the case-study fragment tokens (`--tt-*`,
  `--cc-*`) beside the page palette; the site's names for them (`--frag-*`) are set by PRV-6, so
  `sections.json` lists only the page palette for now. PRV-6 adds the pairs.
- **The canvas runtime has no committed URL.** It is served only behind the owner's canvas sign-in, so the
  manifest names its path (`runtime.url`) and `boards:regen` resolves it against `BOARDS_RUNTIME_BASE`, set
  by whoever regenerates; with an empty cache and no base it names the variable and stops. The fixture
  canvas exercises the same path against a local server.
