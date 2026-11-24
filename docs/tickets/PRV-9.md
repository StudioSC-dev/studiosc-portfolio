PRV-9
# Holly

**Planned:** Sonnet, M, wave 3

- **Goal:** Home introduces the two of us but has nothing about Holly, who is the studio's personality, and a
  missing page is a dead end. Add Holly's section, the photo of the three of us and the "Holly ate this page" 404,
  so a visitor meets the whole team and a wrong URL ends on the joke.
- **Depends on:** PRV-4, PRV-8. The brief quotes board v14's Holly section and its script.
- **Scope:**
  - **Files:** may touch only `components/holly/`, `content/holly.ts` (the owner's copy constant),
    `components/home/RangeHome.tsx` (only the lines that mount Holly and the photo of the three of us),
    `app/not-found.tsx`, `e2e/navigation.spec.ts` (only to update PRV-4's `themed generic 404` scenario to expect
    `Holly ate this page`, keeping its HTTP 404, shared header and footer, active theme and return-to-home
    assertions), Holly's print variants under `public/` where PRV-8 has not already committed them,
    `e2e/holly.spec.ts`, and `docs/boards/sections.json`, `docs/boards/merged.json`.
  - Mount Holly and the group photo in `RangeHome`, served at `/preview/home` while the `rangeHome` flag is off.
    Use the shared route helper in `e2e/support/home.ts` for every Home scenario. The helper targets `/preview/home` while `rangeHome` is off. PRV-11 switches the new Home and the helper to `/`.
  - The section after "The two of us": the "And" bridge (`aria-hidden`), the pile of prints, Holly, "Chief
    Morale Officer", the owner's copy (one constant, so a variation is one edit), Breed, Age, the corgi drawing
    from the board (`aria-hidden`), the rates line, the treat button, and "Treats today: n" in a polite live
    region.
  - **The three of us:** directly after Holly's section, the wide photo of the three of us (PRV-8's variants)
    with its caption "Sprint planning. Holly abstained.", placed as on the designer's updated board.
  - **Age:** computed after mount, never on the server; the server renders an empty fixed-width slot. It is the
    whole days from 2023-07-31 to the visitor's local calendar date, both taken as `Date.UTC(y, m, d)`, ÷ 365.25,
    to 2 decimals. It has `title="Born 31 July 2023"` and no timer.
  - **The pile, as on board v14:** six prints in order (collar, chair, garden, nose, side-eye, upside-down),
    wrapping around.
    - The top print lies flat. The next two show behind it at 4° and −3°.
    - Next tucks the top print to the back (`tuck-a` or `tuck-b`, 300 ms). Back untucks the bottom print to the
      top (`untuck-a` or `untuck-b`, 300 ms).
    - Back and next buttons, and the "n / 6" counter in a polite live region.
    - With focus on the pile, the left and right arrow keys move it.
    - The prints beneath the top one are `aria-hidden`.
  - **Treats:** page state only. Each treat adds one to the count, tucks one print, and runs the rear wiggle
    (`wiggle-a` or `wiggle-b`, 360 ms) and ear twitch (`ears-a` or `ears-b`, 300 ms). Back, next and the arrow
    keys do not count as treats.
  - Holly's prints load lazily.
  - The "Holly ate this page" 404 (default, §6 Q1), with a link home.
- **AC:**
  1. The section follows "The two of us", in board v14's order and copy. The "And" bridge and the corgi drawing have `aria-hidden="true"`. The photo of the three of us, with its
     caption and alt text, comes directly after it. The group image uses a PRV-8 group-photo variant, including the supplied stand-in where applicable, and decodes successfully when scrolled into view. T: `holly.spec.ts › section and copy`.
  2. The server HTML contains an empty, fixed-width Age slot with `title="Born 31 July 2023"`. In both
     `Pacific/Kiritimati` and `Pacific/Pago_Pago`, mount at 2026-08-01 23:59 local and expect "3.00 years old".
     Advance the clock by 24 hours without reloading and expect "3.00 years old". Reload and expect "3.01 years
     old". T: `holly.spec.ts › age from the calendar date`.
  3. Next and the right arrow move the pile forward, and back and the left arrow move it back, wrapping from 6 to
     1 and from 1 to 6. The counter reads "n / 6" and the top print's alt text matches. The two prints behind
     compute rotations of 4° and −3°. The counter has `aria-live="polite"`. Only the top print is exposed to
     assistive technology. Arrow keys move the pile only while focus is within it. For positions 1 through 6, the top image uses the corresponding collar, chair, garden, nose, side-eye and upside-down print variant, in that order. Reach the pile's arrow-key focus target by pressing Tab from the preceding focusable element, then verify that Left and Right move the pile. T: `holly.spec.ts › pile moves`.
  4. Each treat adds one to the count and moves the pile forward one print. Back, next and the arrows leave the
     count unchanged. The count shows as "Treats today: n" in a region with `aria-live="polite"`. A reload resets the count to 0
     and the pile to print 1. T: `holly.spec.ts › treats count and move the
     pile`.
  5. Next computes a 300 ms `tuck-*` animation on the outgoing print, and back a 300 ms `untuck-*` on the incoming
     one. On each of two consecutive treat activations, the outgoing print runs a 300 ms `tuck-*`, the rear runs a 360 ms
     `wiggle-*`, and the ears run a 300 ms `ears-*`. When they finish, the top print is flat
     and the counter is final. Before interaction, the Home pile and corgi drawing run no animation. Back, next and both arrow keys leave the drawing still. Under reduced motion, back, next, both arrow keys and a treat change the print immediately, with no animation or transition on the pile or drawing. T: `holly.spec.ts › motion on action only`.
  6. Before scrolling near Holly, no Holly print is requested. After scrolling the pile into view, the top print
     loads successfully. Advancing through the pile loads each remaining print when it is shown. T: `holly.spec.ts › lazy prints`.
  7. An unknown URL returns HTTP 404 with the heading "Holly ate this page". In the 404 body, "Back to the home page" navigates to `/`, "Every project" links to `/work`, and "Writing" links to `/blog`. A destination owned by a later ticket may still return 404. T: `holly.spec.ts › holly 404`.
  8. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except that the unknown-URL page now shows the Holly 404; routes that later tickets
     build may still answer 404. Within `RangeHome.tsx`, the diff is only the imports and mount code for Holly and
     the group photo. In `sections.json`, only PRV-9's row flags change. The sole change to `merged.json` is the
     addition of `PRV-9`. Existing redirect destinations and page content outside the scoped Home additions and
     the 404 body match the PR base. T: `holly.spec.ts › changes stay within PRV-9 scope`.
  9. The rows this ticket builds (the Holly section, the photo of the three of us and the `404` page rows) are
     marked `built` in `docs/boards/sections.json`, `PRV-9` is added to `docs/boards/merged.json`, and PRV-22's
     fidelity suite (`e2e/fidelity.spec.ts`) passes for those rows at 1440 and 390 in light and dark, including the
     applicable owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour,
     copy, image frames, section order, visible motion and both themes. It does not cover demo behaviour or exact
     easing. A width that no board draws is skipped and listed in the PR for QA. T: `holly.spec.ts › PRV-9 fidelity
     rows`.
