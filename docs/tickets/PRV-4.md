# Shared chrome and the theme switch

**Planned:** Sonnet, M, wave 2

- **Goal:** give the portfolio a consistent frame across pages. The current header, content and footer do not
  align, the default 404 breaks the theme, and the footer and contact page advertise a placeholder Instagram
  link. Bring the shared navigation, footer and controls into line with the approved boards, apply the visitor's
  theme before first paint, and carry that theme through to missing pages.
- **Depends on:** PRV-2, PRV-3.
- **Scope:**
  - **Files:** update the shared layout in `app/layout.tsx`, the theme logic in `lib/theme.ts` and
    `components/ui/ThemeToggle.tsx`, and the shared components under `components/layout/` and `components/ui/`.
    Update existing callers where needed for those shared changes. Provide `FilterGroup` as a reusable
    primitive. PRV-11 wires it into `/work`, and PRV-14 wires it into `/blog/work`.
  - **`Header`:**
    - the wordmark, and the nav from a list: Work, Writing and a filled "Start a project" now. PRV-10 adds Seth
      and Christine, so no link points to a missing page;
    - `aria-current` on the current page;
    - on a phone, the toggle, the centred wordmark and Menu, with the menu as a Popover API panel (Escape, light
      dismiss, closed on route change).
    - After removing Framer Motion from `Header`, record the measured per-route first-load JavaScript values in
      `perf-baseline.json` under `current`, update `measured_sha`, and preserve `original`.
  - **Theme:**
    - an inline `<head>` script applies the stored choice, or else the system setting, before first paint;
    - with no stored choice, the theme follows system changes;
    - the round toggle is labelled "Switch to the dark theme" or "... light theme";
    - in a browser with View Transitions, it reveals a circle from the button over 560 ms;
    - under reduced motion, or without `startViewTransition`, the change is instant;
    - the choice is stored in `localStorage`, guarded by try/catch.
  - **`Footer`:** as drawn.
  - **Instagram links dropped (owner, 2026-11-20):** the `INSTAGRAM` placeholder export leaves `lib/links.ts`, and
    every use of it goes, in `Footer.tsx` and `ContactForm.tsx` alike. No board draws an Instagram link.
  - **Primitives:** `CtaLink` (filled ink or outlined, 6px, at least 48px tall, no arrow glyphs); `PageHeader`
    (no eyebrow); `StatusText` (the word only); `FilterGroup` (pill buttons with `aria-pressed`, the selected one
    filled ink).
  - **Interim 404:** add the themed generic 404 in `app/not-found.tsx` and update `e2e/navigation.spec.ts`.
    PRV-9 owns the illustrated 404 from the boards.
  - **Fidelity rows:** mark the shared header and footer rows built in `docs/boards/sections.json`, and add this
    ticket's id to `docs/boards/merged.json`.
- **AC:**
  1. On `/` and `/work`, the left edges of the desktop wordmark or phone theme toggle, the main content column
     (measured at the left edge of its first visible heading), and the footer content column align within 1px at 1440 and 390. T: `chrome.spec.ts › one left edge`.
  2. The wordmark links to `/`. The primary nav shows Work (`/work`), Writing (`/blog`), and a filled Start a
     project (`/contact`), in that order. Only the matching link has `aria-current="page"` on those routes,
     including after client navigation. T: `chrome.spec.ts › nav and current page`.
  3. At 390 in all five Playwright projects, the theme toggle sits left of the centred wordmark and Menu sits
     right. Menu opens a native popover by click and keyboard. The open panel contains the same three ordered links and
     destinations as the desktop nav in AC2; activating one reaches its destination, closes the panel, and it
     has `aria-current="page"` when the panel is reopened. Escape closes it and returns focus to Menu.
     Clicking outside or navigating while it is open also closes it. T: `chrome.spec.ts › phone menu in every
     project`.
  4. With no saved choice, the theme follows the emulated system setting on load and when it changes while the
     page is open. The round toggle is labelled "Switch to the dark theme" or "Switch to the light theme" as
     appropriate. A saved choice persists across reloads and overrides the system setting. With hydration scripts held
     back, the first animation frame shows the correct `--gallery` for saved dark with a light system setting,
     saved light with a dark system setting, and each system setting with no saved choice; with storage reads
     blocked and a dark system setting, it shows dark `--gallery`. If storage reads or writes throw, the page can still
     initialise from the system setting and the toggle still changes the current theme without an uncaught
     error. T: `chrome.spec.ts › theme follows, stores, no flash`.
  5. In Chromium, the new-root view transition is a circular reveal centred on the toggle with a computed
     duration of 560 ms. With reduced motion or without `startViewTransition`, the theme changes without
     animation or an error. T: `chrome.spec.ts › theme reveal and its fallbacks`.
  6. On `/`, `/work` and the existing project case pages, every rendered project status shows the label
     assigned by PRV-3 as plain text with no dot or status-specific colour, and all four valid statuses are
     exercised in the shared renderer. T: `chrome.spec.ts › status as a word`.
  7. No header, footer or CTA text ends in an arrow glyph. Chrome imports no `framer-motion`, and only the theme
     toggle and the menu's route handler are client components. T: `chrome.spec.ts › plain chrome`.
  8. `lib/links.ts` exports no `INSTAGRAM`, and `Footer` and `ContactForm` contain no Instagram hyperlink. No
     authored hyperlink under `app/`, `components/`, `content/` or `lib/` targets `instagram.com` or its
     subdomains, except the existing Instagram post URL in `content/blog/first-marathon.mdx`, which PRV-16 owns.
     T: `chrome.spec.ts › no Instagram links`.
  9. At 1440 and 390 in both themes, the footer matches the shared footer on the approved Work boards, including
     its copy, link order and destinations, and responsive layout. T: `chrome.spec.ts › footer matches the
     boards`.
  10. `CtaLink` renders filled-ink and outlined variants with a 6px radius, a height of at least 48px, and no
      arrow glyphs. `PageHeader` renders without an eyebrow. `FilterGroup` renders pill buttons with
      `aria-pressed`, and only the selected button is pressed and filled ink. T: `chrome.spec.ts › shared
      primitives`.
  11. An unknown URL responds with HTTP 404 and shows the generic not-found heading within the shared header and
      footer. The page uses the active light or dark theme, and the shared home link returns to `/`. T:
      `navigation.spec.ts › themed generic 404`.
  12. The diff against the PR base touches only these paths: `app/layout.tsx`, `app/not-found.tsx`,
      `lib/theme.ts`, `lib/links.ts`, `components/layout/`, `components/ui/`,
      `components/contact/ContactForm.tsx`, `perf-baseline.json`, `e2e/guards.spec.ts` (only for the AC13 assertion), `docs/boards/sections.json`,
      `docs/boards/merged.json`, `e2e/chrome.spec.ts`, `e2e/navigation.spec.ts`, and, only for lines that call a
      changed primitive or the removed `INSTAGRAM` export, `app/work/page.tsx`, `app/work/[slug]/page.tsx`,
      `app/blog/page.tsx`, `app/about/page.tsx`, `app/contact/page.tsx`,
      `app/privacy/hermes-personal-assistant/page.tsx`, `components/home/Hero.tsx`,
      `components/home/ProjectCard.tsx` and `app/page.tsx` (these three also for outer content wrappers, solely to
      apply the shared alignment). Any other path fails. Existing route paths and redirects, page-specific
      content, and contact-form validation and submission behaviour match the PR base outside the listed
      changes. T: `chrome.spec.ts › changes stay within scope`.
  13. Remeasure first-load JavaScript on the audited production build for all six PRV-1 budget routes using
      PRV-1's method; each recorded `current` equals the measured byte count, `measured_sha` binds to the
      candidate, `original` equals the PR base, and the inherited ceiling still passes. T: `guards.spec.ts › JS within baseline`.
  14. The shared header and footer rows in `docs/boards/sections.json` are marked built, and this ticket's id is
      in `docs/boards/merged.json`. PRV-22's fidelity suite (`e2e/fidelity.spec.ts`) passes for those rows at
      1440 and 390 in light and dark, including the applicable owner-accepted deviations; the desktop header uses PRV-22's
      ticket-specific PRV-4 reference (the Seth and Christine links are an expiring deviation naming PRV-10),
      and a missing or skipped result for any assigned row, width or theme fails; the named scenario
      checks the row assignments and that the suite ran on them. T: `chrome.spec.ts › PRV-4 fidelity rows`.

## Known gaps

- AC12 allows any edit inside its permitted paths: the PR diff auditor should check allowed paths change only scoped behaviour (no root metadata, analytics or unrelated shared component edits), `sections.json` changes only PRV-4's built flags and `merged.json` only adds PRV-4.
- AC12 allows outer-wrapper edits only in the three home files, but AC1's single left edge on `/work` needs that page's own outer wrapper to move as well. The scope test therefore also allows exactly one line in `app/work/page.tsx`: the wrapper directly inside `return (`, changing only its alignment classes (`px-*`, `max-w-*`, `mx-auto`, `box-content`).
