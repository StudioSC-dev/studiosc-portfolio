# Range design system

The design system for studiosc.dev, taken from the approved Range boards. Every
value here is quoted from a board, and the boards win where this doc and a board
disagree on the visual look. Boards are cited by their canvas name, for example
`range-light-desktop`; PRV-22 commits the references under `docs/boards/`.

The code lives in three places:

- `app/globals.css`: every token, the product palettes, every keyframe, the
  reduced-motion rule and the focus ring.
- `lib/fonts.ts`: every face, self-hosted through `next/font`.
- `app/layout.tsx`: puts each face's CSS variable on `<body>`.

`e2e/design-tokens.spec.ts` checks the site against this doc, and this doc
against the plan and the boards, so a change to one needs a change to the other.

## Colour

Light is the default on `:root`. Dark is written out in full on
`:root[data-theme="dark"]`, and the same dark values are repeated under
`@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` for a visitor
without JavaScript. The boards hold these values in their `themes` table
(`range-light-desktop`, `range-dark-desktop`).

### Root colour tokens

| Token       | Light     | Dark      | Role                                                  | Board                                          |
| ----------- | --------- | --------- | ----------------------------------------------------- | ---------------------------------------------- |
| `--gallery` | `#E9EAEC` | `#141619` | page                                                  | `range-light-desktop`, `range-dark-desktop`    |
| `--plate`   | `#FFFFFF` | `#1D2024` | plates, panels, tab pill                              | `range-light-desktop`, `range-dark-desktop`    |
| `--peek`    | `#F4F5F6` | `#191B1F` | dimmed side plates, photo frames                      | `range-light-desktop`, `range-dark-desktop`    |
| `--ink`     | `#1D1F23` | `#ECEEF1` | text, primary button, person-frame rule               | `range-light-desktop`, `range-dark-desktop`    |
| `--muted`   | `#5E636B` | `#A3A9B2` | secondary text                                        | `range-light-desktop`, `range-dark-desktop`    |
| `--rule`    | `#D0D3D8` | `#30343A` | row rules, plate borders                              | `range-light-desktop`, `range-dark-desktop`    |
| `--accent`  | `#1F4FD1` | `#7FA2FF` | headline word, dot fields, focus ring                 | `range-light-desktop`, `range-dark-desktop`    |
| `--error`   | `#B3261E` | `#FF9B8F` | form error summary, invalid fields and their messages | `pages-contact-desktop`, `pages-contact-phone` |

`--dots-opacity` is `0.55` in light and `0.7` in dark: the dot fields are an
ordered dither in `--accent` at the page edges, at that opacity. There are no
gradients and no purple.

### Context tokens

A context token takes a different value inside one context. Each is read on the
fixture named here.

| Token     | Context                    | Light     | Dark      | Fixture                                        |
| --------- | -------------------------- | --------- | --------- | ---------------------------------------------- |
| `--focus` | `:root`                    | `#1F4FD1` | `#7FA2FF` | the page: `--focus` is `--accent`              |
| `--focus` | `[data-fragment]`          | `#1F4FD1` | `#1F4FD1` | every fragment fixture root (`--frag-focus`)   |
| `--focus` | `[data-stage="turntable"]` | `#7FA2FF` | `#7FA2FF` | the turntable stage (`--frag-turntable-focus`) |

Fragments keep their light colours in both themes, so their ring stays the
light accent. The turntable stage is dark in both themes, so its ring is the
dark accent.

### Status colours

Kept from the previous palette, with their own light and dark values, until the
pages that use them are rebuilt.

| Token      | Light     | Dark      | Role              |
| ---------- | --------- | --------- | ----------------- |
| `--ok`     | `#3C610B` | `#A3B18A` | status: good      |
| `--warn`   | `#7F4021` | `#D9A05B` | status: attention |
| `--info`   | `#59554F` | `#A8A29E` | status: neutral   |
| `--danger` | `#8C221D` | `#E0918A` | status: problem   |

### Legacy aliases

The old names alias the nearest Range token, so pages not yet rebuilt render in
the Range palette. PRV-18 deletes every alias left unused. The old `--dark-*`
constants are gone: `[data-theme="dark"]` carries the dark values itself.

| Alias           | Resolves to |
| --------------- | ----------- |
| `--paper`       | `--gallery` |
| `--surface`     | `--plate`   |
| `--sunken`      | `--peek`    |
| `--line`        | `--rule`    |
| `--line-strong` | `--rule`    |
| `--body`        | `--ink`     |

### Product palettes

Used only inside a fragment, under `components/range/fragments/`. They keep
these light values in both themes, as the light and dark boards draw them
identically.

| Token                           | Value     | Role                                         | Board                 |
| ------------------------------- | --------- | -------------------------------------------- | --------------------- |
| `--frag-tt-band`                | `#1F4D3A` | Tally & Trace ledger header band             | `range-light-desktop` |
| `--frag-tt-on-band`             | `#FFFFFF` | text on the band                             | `range-light-desktop` |
| `--frag-tt-ink`                 | `#1C2420` | ledger text, header rule                     | `range-light-desktop` |
| `--frag-tt-muted`               | `#58615B` | column heads, "Paid from"                    | `range-light-desktop` |
| `--frag-tt-rule`                | `#DCE3DE` | ledger row rules, frame                      | `range-light-desktop` |
| `--frag-tt-pad`                 | `#F6F9F6` | ledger pad                                   | `range-light-desktop` |
| `--frag-tt-sheet`               | `#FFFFFF` | ledger table                                 | `range-light-desktop` |
| `--frag-tt-red`                 | `#B3261E` | overdue, and nothing else                    | `range-light-desktop` |
| `--frag-tt-green`               | `#23613F` | Tally & Trace green                          | `range-light-desktop` |
| `--frag-cc-bg`                  | `#EEF1F6` | Central Command feed background              | `range-light-desktop` |
| `--frag-cc-panel`               | `#FFFFFF` | feed entry panels                            | `range-light-desktop` |
| `--frag-cc-ink`                 | `#1A2233` | feed text                                    | `range-light-desktop` |
| `--frag-cc-muted`               | `#4F5A70` | the date line                                | `range-light-desktop` |
| `--frag-cc-line`                | `#D9DFEA` | feed frame                                   | `range-light-desktop` |
| `--frag-cc-accent`              | `#2F6FED` | Central Command accent                       | `range-light-desktop` |
| `--frag-cc-sleep`               | `#DB4C75` | source colour: Sleep                         | `range-light-desktop` |
| `--frag-cc-weather`             | `#3A9ABB` | source colour: Weather                       | `range-light-desktop` |
| `--frag-cc-calendar`            | `#9B4ED6` | source colour: Calendar                      | `range-light-desktop` |
| `--frag-cc-fitness`             | `#2E9E5B` | source colour: Fitness                       | `range-light-desktop` |
| `--frag-cc-tickets`             | `#D94640` | source colour: Tickets                       | `range-light-desktop` |
| `--frag-cc-news`                | `#5B72A8` | source colour: News                          | `range-light-desktop` |
| `--frag-habit-bg`               | `#EEF3F1` | habit tracker backdrop                       | `range-light-desktop` |
| `--frag-habit-line`             | `#D5E2DD` | backdrop frame                               | `range-light-desktop` |
| `--frag-habit-device`           | `#111315` | phone frame                                  | `range-light-desktop` |
| `--frag-habit-screen`           | `#FFFFFF` | phone screen                                 | `range-light-desktop` |
| `--frag-habit-ink`              | `#17201C` | habit text                                   | `range-light-desktop` |
| `--frag-habit-muted`            | `#4F5E58` | day and count lines, a done habit            | `range-light-desktop` |
| `--frag-habit-rule`             | `#E3EAE7` | habit row rules                              | `range-light-desktop` |
| `--frag-habit-done`             | `#0E7C66` | a ticked habit's ring and fill               | `range-light-desktop` |
| `--frag-habit-ring`             | `#6B7A74` | an open habit's ring                         | `range-light-desktop` |
| `--frag-form-bg`                | `#F7F6F3` | form helper panel                            | `range-light-desktop` |
| `--frag-form-line`              | `#E2DFD8` | panel and message frames                     | `range-light-desktop` |
| `--frag-form-field`             | `#FFFFFF` | message and draft fields                     | `range-light-desktop` |
| `--frag-form-draft-line`        | `#C9C4BA` | draft field frame                            | `range-light-desktop` |
| `--frag-form-ink`               | `#1F1D1A` | text, the "Draft a reply" button             | `range-light-desktop` |
| `--frag-form-on-ink`            | `#FFFFFF` | button label                                 | `range-light-desktop` |
| `--frag-form-muted`             | `#5C574F` | field labels, the empty-draft line           | `range-light-desktop` |
| `--frag-turntable-stage`        | `#0F1113` | turntable stage                              | `range-light-desktop` |
| `--frag-turntable-grid`         | `#2A2E33` | floor grid                                   | `range-light-desktop` |
| `--frag-turntable-edge`         | `#7FA2FF` | cube edges (faces at 10% of it)              | `range-light-desktop` |
| `--frag-turntable-control-line` | `#5A616B` | Pause and Play frame                         | `range-light-desktop` |
| `--frag-turntable-control-ink`  | `#E6E8EB` | Pause and Play label                         | `range-light-desktop` |
| `--frag-site-gallery`           | `#E9EAEC` | the site drawn small: page                   | `range-light-desktop` |
| `--frag-site-plate`             | `#FFFFFF` | the site drawn small, route-check table      | `range-light-desktop` |
| `--frag-site-peek`              | `#F1F2F4` | the site drawn small: panel                  | `range-light-desktop` |
| `--frag-site-ink`               | `#1D1F23` | route-check text, header rule, ticks         | `range-light-desktop` |
| `--frag-site-muted`             | `#5E636B` | route-check column heads, page names         | `range-light-desktop` |
| `--frag-site-rule`              | `#D0D3D8` | route-check row rules, frame                 | `range-light-desktop` |
| `--frag-site-line`              | `#C4C8CE` | the site drawn small: outlines               | `range-light-desktop` |
| `--frag-site-faint`             | `#9AA0A8` | the site drawn small: text lines (a drawing) | `range-light-desktop` |
| `--frag-focus`                  | `#1F4FD1` | focus ring inside a fragment                 | `range-light-desktop` |
| `--frag-turntable-focus`        | `#7FA2FF` | focus ring on the turntable stage            | `range-dark-desktop`  |

### Text pairings

Every text pairing, at 4.5:1 or more. The §2 accent pairs come first. Fragment
pairings hold in both themes because the palettes do not change.

| Text                           | Surface                  | Light   | Dark    | Where                             |
| ------------------------------ | ------------------------ | ------- | ------- | --------------------------------- |
| `--accent`                     | `--gallery`              | 5.63:1  | 7.35:1  | Headline word, Holly's title line |
| `--accent`                     | `--plate`                | 6.78:1  | 6.63:1  | Accent text on a plate            |
| `--accent`                     | `--peek`                 | 6.21:1  | 6.99:1  | Accent text on a peek             |
| `--error`                      | `--plate`                | 6.54:1  | 8.05:1  | Form errors on the contact plate  |
| `--error`                      | `--gallery`              | 5.43:1  | 8.92:1  | Form errors on the page           |
| `--ink`                        | `--gallery`              | 13.71:1 | 15.59:1 | Body and headings                 |
| `--ink`                        | `--plate`                | 16.50:1 | 14.07:1 | Body and headings                 |
| `--ink`                        | `--peek`                 | 15.12:1 | 14.83:1 | Body and headings                 |
| `--muted`                      | `--gallery`              | 5.02:1  | 7.66:1  | Secondary text                    |
| `--muted`                      | `--plate`                | 6.05:1  | 6.91:1  | Secondary text                    |
| `--muted`                      | `--peek`                 | 5.54:1  | 7.29:1  | Secondary text                    |
| `--gallery`                    | `--ink`                  | 13.71:1 | 15.59:1 | Primary button label              |
| `--ok`                         | `--gallery`              | 6.00:1  | 7.95:1  | Status text                       |
| `--ok`                         | `--plate`                | 7.22:1  | 7.17:1  | Status text                       |
| `--warn`                       | `--gallery`              | 6.56:1  | 7.88:1  | Status text                       |
| `--warn`                       | `--plate`                | 7.90:1  | 7.11:1  | Status text                       |
| `--info`                       | `--gallery`              | 6.15:1  | 7.19:1  | Status text                       |
| `--info`                       | `--plate`                | 7.40:1  | 6.48:1  | Status text                       |
| `--danger`                     | `--gallery`              | 7.39:1  | 7.41:1  | Status text                       |
| `--danger`                     | `--plate`                | 8.89:1  | 6.69:1  | Status text                       |
| `--frag-tt-ink`                | `--frag-tt-pad`          | 14.97:1 | 14.97:1 | Tally & Trace ledger              |
| `--frag-tt-ink`                | `--frag-tt-sheet`        | 15.88:1 | 15.88:1 | Tally & Trace ledger              |
| `--frag-tt-muted`              | `--frag-tt-pad`          | 6.04:1  | 6.04:1  | Tally & Trace ledger              |
| `--frag-tt-muted`              | `--frag-tt-sheet`        | 6.41:1  | 6.41:1  | Tally & Trace ledger              |
| `--frag-tt-on-band`            | `--frag-tt-band`         | 9.63:1  | 9.63:1  | Tally & Trace ledger              |
| `--frag-tt-red`                | `--frag-tt-sheet`        | 6.54:1  | 6.54:1  | Tally & Trace ledger, overdue     |
| `--frag-tt-green`              | `--frag-tt-sheet`        | 7.36:1  | 7.36:1  | Tally & Trace ledger              |
| `--frag-cc-ink`                | `--frag-cc-bg`           | 14.05:1 | 14.05:1 | Central Command feed              |
| `--frag-cc-ink`                | `--frag-cc-panel`        | 15.90:1 | 15.90:1 | Central Command feed              |
| `--frag-cc-muted`              | `--frag-cc-bg`           | 6.12:1  | 6.12:1  | Central Command feed              |
| `--frag-cc-muted`              | `--frag-cc-panel`        | 6.93:1  | 6.93:1  | Central Command feed              |
| `--frag-habit-ink`             | `--frag-habit-screen`    | 16.67:1 | 16.67:1 | Habit tracker                     |
| `--frag-habit-muted`           | `--frag-habit-screen`    | 6.83:1  | 6.83:1  | Habit tracker                     |
| `--frag-form-ink`              | `--frag-form-bg`         | 15.56:1 | 15.56:1 | Form helper                       |
| `--frag-form-ink`              | `--frag-form-field`      | 16.81:1 | 16.81:1 | Form helper                       |
| `--frag-form-muted`            | `--frag-form-bg`         | 6.63:1  | 6.63:1  | Form helper                       |
| `--frag-form-muted`            | `--frag-form-field`      | 7.16:1  | 7.16:1  | Form helper                       |
| `--frag-form-on-ink`           | `--frag-form-ink`        | 16.81:1 | 16.81:1 | Form helper button                |
| `--frag-turntable-control-ink` | `--frag-turntable-stage` | 15.41:1 | 15.41:1 | Turntable Pause and Play          |
| `--frag-site-ink`              | `--frag-site-plate`      | 16.50:1 | 16.50:1 | Route-check table                 |
| `--frag-site-muted`            | `--frag-site-plate`      | 6.05:1  | 6.05:1  | Route-check table                 |

## Type

| Face            | Where                                                                            | Weights               | Loading                                         |
| --------------- | -------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| Red Hat Display | `h1` to `h3`, tabs, chips, the wordmark, plate and person names (`font-display`) | 400, 600, 700         | variable, Latin, `display: 'swap'`, preload     |
| Red Hat Text    | body text, and `h4` and below (the boards set "What I did here" in it)           | 400, 500, 600         | variable, Latin, `display: 'swap'`, preload     |
| JetBrains Mono  | `pre` and `code` only                                                            | 400                   | Latin, `preload: false`                         |
| IBM Plex Sans   | `[data-fragment="tallyandtrace"]` and `[data-fragment="form-helper"]` only       | 400 to 600 (variable) | self-hosted cut: Latin plus ₱, `preload: false` |
| Manrope         | `[data-fragment="central-command"]` and `[data-fragment="habit-tracker"]` only   | 400, 600, 700, 800    | Latin, `preload: false`                         |

- Both Red Hat faces set `adjustFontFallback`, so the swap does not shift the
  layout. Together they are two files and at most 90 KiB on any route.
- A fragment face applies only under its `[data-fragment]` root, and each is at
  most 40 KiB per route unless an owner-accepted deviation says otherwise (see
  Font fallback). It is fetched only on a page that renders its fragment.
- IBM Plex Sans is self-hosted with `next/font/local`, because Google's Latin
  file has no peso sign and its Latin Extended file adds about 25 KiB for that
  one glyph. The file is a cut of the OFL release (the Google Fonts source,
  version 3.201) made with fonttools: `varLib.instancer` pins width at 100 and
  trims weight to 400 to 600, then `pyftsubset` keeps the Latin range plus
  U+20B1, drops hinting and writes woff2. That is one file of 31,644 bytes. A
  cut is a Modified Version under the OFL, which reserves the name "Plex", so the
  file is named "SSC Fragment Sans" inside; the licence sits beside it.
- The boards draw inline code in a system monospace stack
  (`pages-post-work-desktop`: `font-family: ui-monospace, SFMono-Regular, Menlo,
Consolas, monospace`). The site sets JetBrains Mono there instead, as §2 of the
  plan decides, so code reads the same on every platform. The `font-mono`
  utility stays a system stack, so nothing outside `pre` and `code` fetches the
  code face. It is the board's stack with "Liberation Mono" named before the
  generic `monospace`, so Linux resolves one face for good: the bare generic
  can resolve to one face and then, on a later layout, another, which re-wraps
  the line.
- Labels and headings are in sentence case. `.label`, `.subhead` and the old
  display class `.font-serif` (now the display face) compute to
  `text-transform: none`, and `.label` has no letter-spacing.

### Type scale

| Role                  | Size/line | Tracking | Board                                                                      |
| --------------------- | --------- | -------- | -------------------------------------------------------------------------- |
| Display (h1), desktop | 92/92     | -0.04em  | `range-light-desktop`: "We build dashboards. / We break them first." (600) |
| Display (h1), phone   | 42/46     | -0.035em | `range-phone`: the same headline                                           |
| Section title         | 32/40     | -0.015em | `range-light-desktop`: "The two of us", "Writing", "Every project" (600)   |
| Section title, phone  | 24/32     | 0        | `range-phone`: the same titles and every plate name (600)                  |
| Person name           | 36/44     | -0.02em  | `range-light-desktop`: "Seth Palileo", "Christine Nacar-Palileo" (600)     |
| Person name, phone    | 28/36     | -0.02em  | `range-phone`: the same names (600)                                        |
| Title                 | 20/28     | 0        | `range-light-desktop`: "Or hire us both for your project or idea"          |
| Lead                  | 18/28     | 0        | `range-light-desktop`: "Husband and wife, developer and tester. …"         |
| Body                  | 16/26     | 0        | `range-light-desktop`: the page's base size                                |
| Small                 | 15/24     | 0        | `range-light-desktop`: nav, facts, credit line, buttons                    |
| Meta                  | 13/20     | 0        | `range-light-desktop`: peek category, figcaptions                          |
| Caption               | 12/18     | 0        | `range-light-desktop`: the "Lab demo" tag                                  |

Utilities: `text-display`, `text-display-phone`, `text-section`,
`text-section-phone`, `text-person`, `text-person-phone`, `text-title`,
`text-lead`, `text-copy`, `text-small`, `text-meta` and `text-caption`. The
boards also set a few one-off sizes inside a component (Holly 44/48, the
contact title 48/52); those are listed with the component.

### Font fallback

If a font gate fails, these steps apply in order, and `docs/perf/prv-2.json`
records which of steps 1 to 3 were applied (an empty list today):

1. Trim the weight axes to the weights in use.
2. Set headings in Red Hat Text 600 to 700. The owner is told.
3. Set `display: 'optional'` on the heading face.
4. If a perf gate fails because of a fragment face, the ticket that measured it
   records a deviation for that face in `docs/boards/deviations.md`, with the
   measured cost, for the owner to sign. Nothing else changes.

## Shape

| Element       | Radius | Edge                                                             | Board                 |
| ------------- | ------ | ---------------------------------------------------------------- | --------------------- |
| Plate         | 14px   | 1px `--rule` border and the one plate shadow                     | `range-light-desktop` |
| Peek          | 12px   | on `--peek`, 1px `--rule` border                                 | `range-light-desktop` |
| Person frame  | 14px   | 1px `--ink` border, split by a 1px `--ink` rule                  | `range-light-desktop` |
| Photo         | 14px   | 1px `--rule` border on `--peek` (the person photo itself is 4px) | `range-light-desktop` |
| Holly's frame | 2.5rem | softer, because she is not staff                                 | `range-light-desktop` |
| Control       | 6px    | buttons, back and next, fragment frames                          | `range-light-desktop` |
| Tab and chip  | 999px  | pills: tabs, chips, the theme toggle and the treat button        | `range-light-desktop` |

- The plate shadow: `0 1px 2px rgba(0,0,0,0.08), 0 28px 56px -28px
rgba(0,0,0,0.35)` (`shadow-plate`); on a phone `0 20px 40px -20px` replaces
  the second layer (`shadow-plate-phone`). The tab pill casts `0 8px 20px -12px
rgba(0,0,0,0.35)` (`shadow-pill`).
- Tags are 4px with a dashed border. Lists are ruled rows, never cards.
- Utilities: `rounded-plate`, `rounded-peek`, `rounded-person`, `rounded-photo`,
  `rounded-holly`, `rounded-control`, `rounded-fragment`, `rounded-tag`,
  `rounded-pill`.

## Layout

- One container, as the boards build it: `box-sizing: content-box`, 75rem
  (1200px) of content and 2.5rem gutters, so 1280px wide in all. The recipe is
  `box-content max-w-page px-gutter mx-auto`; with Tailwind's default border
  box the content would shrink to 1120px. The header is 5.5rem tall and
  sections are 5rem apart (`range-light-desktop`).
- A phone uses one centred axis with 16px gutters (`px-gutter-phone`). Tables
  and lists inside fragments stay left-aligned (`range-phone`).

## Focus

- Keyboard focus shows a 2px ring in `--focus` at a 3px offset
  (`:focus-visible`); a mouse click shows none. The boards draw
  `:focus-visible{outline:2px solid var(--accent);outline-offset:3px}`.
- On the page `--focus` is `--accent`. A `[data-fragment]` root and the
  turntable stage (`[data-stage="turntable"]`) set their own `--focus`, which
  holds 3:1 against their surfaces in both themes (see Context tokens).
- Peeks are drawings only: `aria-hidden` and never focusable.

## Motion

House ban 7 is lifted for the portfolio. Nothing autoplays: no content advances
or changes unless the visitor acts, and the load moment plays once. Every
element that animates carries `data-motion` (or `data-fade` for a transition),
so the reduced-motion rule stops it at its final state.

| Moment            | Spec (from the boards)                                                                                                                                                                                                                          | Under reduced motion                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Load              | headline lines `rise` (560 ms, second line +90 ms), dots `fade-in` (900 ms), tabs `fade-in` (420 ms at 360 ms), stage `stage-in` (640 ms at 220 ms); about 0.9 s in all                                                                         | final state at first paint                     |
| Tab, back or next | the word swaps with `word-in` (280 ms); the plate slides in from the side it came from, `plate-from-left` or `plate-from-right` (240 ms); the peeks `plate-fade` (240 ms)                                                                       | instant swap                                   |
| Theme toggle      | View Transitions circular reveal from the button, `theme-reveal` (560 ms)                                                                                                                                                                       | instant; also instant without View Transitions |
| Testing plate     | ticks land one by one with `tick-in` when the plate is picked                                                                                                                                                                                   | all ticks shown                                |
| Form helper       | the words `stream-in` after "Draft a reply"                                                                                                                                                                                                     | the full reply at once                         |
| Turntable         | the cube `turn`s while its plate is shown; Pause stops it                                                                                                                                                                                       | still                                          |
| Post Gallery      | previous, next or a thumbnail crossfades to the picked photo (200 ms, ease)                                                                                                                                                                     | instant                                        |
| Holly's pile      | next or a treat tucks the top print to the back (`tuck-a`/`tuck-b`), back untucks the bottom one (`untuck-a`/`untuck-b`) (300 ms); a treat also runs the rear wiggle (`wiggle-a`/`wiggle-b`, 360 ms) and ear twitch (`ears-a`/`ears-b`, 300 ms) | the print changes instantly, no wiggle         |

### Keyframes

`app/globals.css` holds every board keyframe: `rise`, `stage-in`, `fade-in`,
`word-in`, `plate-from-left`, `plate-from-right`, `plate-fade`, `tick-in`,
`stream-in`, `turn`, `wiggle-a`, `wiggle-b`, `ears-a`, `ears-b`, `tuck-a`,
`tuck-b`, `untuck-a`, `untuck-b` and `theme-reveal`. Each `-a`/`-b` pair is
identical: alternating the name restarts the animation.

The view-transition rules, as the boards write them:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
::view-transition-new(root) {
  animation: theme-reveal 560ms ease-in-out;
}
```

Under `prefers-reduced-motion: reduce`, `[data-motion]` has no animation,
`[data-fade]` has no transition, and view transitions run without animation.

## Components

Each component quotes the board it comes from. Copy is the board's, verbatim;
the boards' own markers ("[PLACEHOLDER]", "Sample", "Illustrative wording")
never ship.

### Tab pill

Board: `range-light-desktop`, "The range".

- A group labelled "Choose a category" on `--plate`, with a 1px `--rule`
  border, a pill radius, 0.3125rem padding, a 0.25rem gap and the pill shadow.
  It overlaps the top of the stage by 1.5rem.
- Tabs are buttons with `aria-pressed`: Red Hat Display 600, 15/20, 2.5rem
  tall, pill radius. The picked tab is `--ink` with `--gallery` text; the rest
  are transparent with `--ink` text.
- The tabs, in order: "Dashboards", "Finance", "Mobile", "AI features",
  "3D & motion", "Sites", "Testing".

### Chip row

Board: `range-phone`, "Category chips".

- One row that scrolls sideways between two round 2.75rem scroll buttons with a
  1px `--rule` border, "Scroll the categories back" and "Scroll the categories
  forward". The picked chip scrolls to the middle.
- Chips are 2.75rem pills with a 1px `--rule` border, Red Hat Display 600,
  15/20, no wrapping; picked is `--ink` on `--gallery` text, as in the tab pill.

### Plate

Board: `range-light-desktop`, "The range"; `range-phone` for the phone layout.

- `--plate`, 14px radius, 1px `--rule` border, the plate shadow, padding
  3.25rem 2.5rem 2.5rem, two columns (19rem and the fragment).
- A slide: `aria-roledescription="slide"`, labelled like "1 of 7: Dashboards,
  Central Command".
- The name is Red Hat Display 600, 32/40, -0.015em (`text-section`); 24/32
  on a phone (`text-section-phone`). Facts are a ruled `dl`
  (Status, Built with or Tested with, Started) at 15/24, with `--muted` terms;
  Status is 600.
- The fragment is a `figure` in a 6px frame, with a 13/20 `--muted` caption,
  for example "A working fragment with made-up figures. Sort by bill, due date
  or amount. Red means overdue, and nothing else."
- Under the stage: back and next (2.75rem, 6px, 1px `--ink` border) around an
  "n of 7" counter, 15/24 600, announced politely.
- On a phone the plate pads 1rem, centres its text, and uses the phone shadow.

### Peek

Board: `range-light-desktop`, "Previous plate, dimmed at the edge: a drawing
only, never focusable".

- `aria-hidden`, never focusable. On `--peek` with a 1px `--rule` border and a
  12px radius, inset 9% top and bottom.
- It shows the category (13/20), the name (Red Hat Display 600, 18/24) and the
  status, all in `--muted`, and a drawing of the fragment at 0.75 opacity. It
  fades with `plate-fade` when the plate changes.

### Credit line

Board: `range-light-desktop`, each real plate.

- "Built by Seth · Tested by Christine", 15/24, with "Seth" and "Christine"
  linking to the person panels (`#seth`, `#christine`).

### Christine line

Board: `range-light-desktop`, the Tally & Trace and Testing plates.

- A full-width row under the plate, above a 1px `--rule` rule, 14/22: a check
  mark, then "**Checked by Christine.** Amounts keep one right edge on desktop
  and phone."
- A line ships only when it names a StudioSC-dev repo, a test file, a test title
  and a pinned 40-character sha. The board's "Illustrative wording" marker never
  ships.

### Lab tag

Board: `range-light-desktop`, the Mobile, AI features and 3D & motion plates.

- "Lab demo": inline, 0 0.375rem padding, a 1px dashed `--muted` border, a 4px
  radius, Red Hat Text 500, 12/18, no letter-spacing, `--muted`.
- The lab line under it, 14/22 `--muted`: "Nobody's hired us for one of these
  yet. We built this so you don't have to take our word for it."

### Person frame

Board: `range-light-desktop`, "The two of us: a deliberate pair in one frame,
split by an ink rule"; `range-profile-seth-desktop` and
`range-profile-christine-desktop` for the person pages.

- One frame on `--plate` with a 1px `--ink` border and a 14px radius, split by a
  1px `--ink` rule; stacked on a phone.
- Each panel pads 2.5rem: a 7rem photo (1px `--rule` border, 4px radius), the
  name (Red Hat Display 600, 36/44, -0.02em, `text-person`; 28/36 on a phone,
  `text-person-phone`), the role (16/24, 600), the fact
  line (15/24, `--muted`), the pitch (17/26), "Open to", "What I did here" (a
  14/20 600 `--muted` heading over a ruled list), Download CV and Email, then
  LinkedIn and GitHub.
- Under it, centred, Red Hat Display 600, 20/28: "Or hire us both for your
  project or idea".

### Holly's pile

Board: `range-light-desktop`, "Holly: the studio dog. Not staff, so a softer
radius than the people blocks".

- A 13rem square group (12rem on a phone, `range-phone`) labelled "Photos of Holly. The left and right arrow keys
  flip through them.", focusable. Six prints, each with a 1px `--rule` border,
  a 2.5rem radius, on `--plate`; the next two show behind at 4° and -3°.
- Back and next (2.75rem, 6px) around an "n / 6" counter.
- "And" (Red Hat Display 400, 44/48) bridges from "The two of us"; "Holly"
  (Red Hat Display 600, 44/48, -0.02em); "Chief Morale Officer" (20/28, 600,
  `--accent`).
- "Very flexible rates: anything beef or duck will do." and a "Give Holly a
  treat" pill (2.75rem, 1px `--ink` border), with "Treats today: n" announced.
- Motion as in the Motion table: `tuck-a`/`tuck-b`, `untuck-a`/`untuck-b`,
  `wiggle-a`/`wiggle-b` and `ears-a`/`ears-b`.

### Ruled list

Board: `range-light-desktop`, "Every project, compact" and the person panels.

- `list-style: none`; each row has a 1px `--rule` top border and the list a 1px
  `--rule` bottom border. Rows pad 0.875rem (Every project) or 0.625rem (What I
  did here).
- A project row: the name (Red Hat Display 600, 18/24) and the status (14/20, 600) on one line, the one-line description (14/22, `--muted`) under it. Two
  columns on desktop, 3rem apart. Never cards.

### Buttons

Board: `range-light-desktop`.

- Primary: `--ink` fill, `--gallery` text, 6px radius, 15/24 600, 3rem tall
  with 1.375rem padding ("Start a project"); 2.75rem in the header and the
  person panels.
- Secondary: transparent, 1px `--ink` border, `--ink` text ("Every project",
  "Email Seth").
- Icon buttons: 2.75rem square, 6px, 1px `--ink` border (back and next). The
  theme toggle is a 2.75rem circle with a 1px `--rule` border.
- Text links: `--ink`, a 1px underline offset 0.2em, `--muted` on hover.
- No arrow glyph on any button or link. Lucide is the only icon set.
