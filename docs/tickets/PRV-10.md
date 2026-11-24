PRV-10
# /seth and /christine

**Planned:** Sonnet, L, wave 3

- **Goal:** Recruiters and visitors who want to know who is behind the work get a short two-person panel and two
  PDF resumes. Give each of us a full profile page, with a photo gallery and client work, that replaces the PDFs
  and fills the nav's missing Seth and Christine links.
- **Depends on:** PRV-4, PRV-8. **Owner inputs before dispatch:** obtain BIS Karaoke's role and stack and use its public
  link if supplied. Use stand-in photos and descriptive captions until the owner provides the gallery photos and captions.
- **Scope:**
  - **Files:** may touch only `app/seth/`, `app/christine/`, `content/people.ts`, `components/gallery/`,
    `components/profile/`, the nav list in `components/layout/Header.tsx`, the photo variants for both galleries
    under `public/`, the removal of `public/resumes/`, the redirects in `next.config.*`, `e2e/fixtures/urls.json`,
    only the lines in `app/`, `components/`, `content/`, `lib/` and `public/` that mention Pouch or `pouchph.com`,
    PRV-8's generated image-variant manifest (only the entries for the two profile galleries), `e2e/chrome.spec.ts`
    (only the expected desktop and phone nav lists, to include Seth and Christine), `e2e/guards.spec.ts` (only the
    URL-inventory expectation, to account for the two new profiles, keeping the existing navigation and URL checks),
    `e2e/profiles.spec.ts`, and `docs/boards/sections.json`, `docs/boards/merged.json`.
  - `app/seth/page.tsx` and `app/christine/page.tsx`, from the profile fields added to `content/people.ts`, all
    board copy: Selected work (Seth's Tally & Trace item links the 18 November reconciliation post), Client
    work (Seth only), Highlights, the earlier-roles line, education, Skills, the photo gallery, the photo with
    Holly, and the closing line.
  - **Client work (owner, 2026-11-20):** Pouch is removed and replaced by "BIS Karaoke", whose details come from
    the owner. Every reference to Pouch and to pouchph.com leaves the site's source and content.
  - **Skills (owner, 2026-11-20):** both people's skill groups widen to cover recent work, as the designer's
    updated boards word them. The board copy is the source; nothing is added beyond it.
  - **Photo gallery (owner, 2026-11-20):** a mini gallery with its carousel on `/seth` and `/christine`, at both
    widths, placed and styled as the updated profile boards draw it. It uses the shared Gallery component, which
    this ticket builds first as `components/gallery/Gallery.tsx` (one active photo with its caption and "n / N",
    previous and next that wrap, thumbnails that pick a photo, a 200 ms crossfade, instant under reduced motion),
    to the look `pages-post-life-*` draws; PRV-16 registers the same component for posts. Run gallery photos, including stand-ins, through PRV-8's variants script. Use the owner's captions when supplied.
  - "The full history is in the CV." shows only when the CV is ready.
  - The nav gains Seth and Christine (PRV-4's list). Both routes join `urls.json`.
  - **Fidelity references:** the desktop profile boards, and the designer's 390 profile boards (PRV-22's page
    boards), light and dark through their toggles. PRV-10's ui-verify waits for the 390 boards.
  - `public/resumes/*.pdf` is removed, and its two URLs 308 to the person pages (default, §6 Q4).
- **AC:**
  1. Each page answers 200 with one h1 (the name), the role, fact line, pitch, Open to, Email, LinkedIn and
     GitHub. At both widths, Email, LinkedIn and GitHub are links whose destinations match that person's board, including the `mailto:` address for Email. T: `profiles.spec.ts › header`.
  2. Selected work lists the three real projects with status words, stack and start date, each linking to its
     case study. On Seth's page, the Tally & Trace item also links to
     `/blog/tallyandtrace-statement-reconciliation` at both widths. T: `profiles.spec.ts › selected work`.
  3. Seth's Client work lists Space Reserve, PSJ, Entame Choice and the BIS Karaoke project in board order, with
     headings as drawn and with role and stack. The BIS Karaoke entry links to the owner-supplied public URL when
     supplied and appears as plain text otherwise. There are no status tags.
     Christine's page has no Client work. No file under `app/`, `components/`, `content/`, `lib/` or `public/`
     mentions Pouch or `pouchph.com`. T: `profiles.spec.ts › client work`.
  4. Highlights (three rows each), the earlier-roles line, education and the skill groups match the board. T: `profiles.spec.ts ›
     record and skills`.
  5. The Holly photo and caption, and a link to the other person's page, close each page. T: `profiles.spec.ts › closing`.
  6. Each page shows its gallery at 1440 and 390 using the supplied photos and captions or the stand-in photos and captions specified in scope. In each gallery, Next wraps from the last photo to
     the first, Previous wraps from the first to the last, and each thumbnail selects its photo. Each selection
     updates the active photo, caption and "n / N" counter. The photo crossfades over 200 ms with normal motion and
     changes instantly under reduced motion.
     Each photo is a committed variant with width, height and alt text. Verify that both profile routes render their gallery through `components/gallery/Gallery.tsx`. At both widths, verify that Next and Previous move exactly one photo in board order from every position, including the wrap points. T: `profiles.spec.ts › profile gallery`.
  7. In the desktop navigation and the open phone menu, Seth links to `/seth` and Christine links to `/christine`. On each profile route, only its matching nav link has `aria-current="page"`. T: `profiles.spec.ts › nav`.
  8. The two tracked PDFs under `public/resumes/` are removed. `/resumes/seth-cv.pdf` returns 308 to `/seth` and
     `/resumes/christine-cv.pdf` returns 308 to `/christine`. With both CVs unready, both profiles hide Download CV
     and "The full history is in the CV.", and nothing links to `/cv/`. Run fixtures with Seth alone ready, Christine alone ready, and both ready. In each fixture, every ready profile shows both links to its own configured `/cv/` PDF. Every unready profile hides both links and contains no link to `/cv/`. T: `profiles.spec.ts ›
     no stale CVs`.
  9. The PR-base diff stays within every path and line-level limit in the Files bullet. `e2e/fixtures/urls.json`
     retains its base entries and adds `/seth` and `/christine`. Each base URL retains its initial status and, for
     redirects, its destination, subject to the two legacy resume redirects in AC8. Routes reserved for later
     tickets may still return 404. The shared navigation retains every existing link and destination in relative
     order and adds only Seth and Christine. T: `profiles.spec.ts › changes
     stay within PRV-10 scope`.
  10. The rows this ticket builds (the `seth` and `christine` rows) are marked `built` in
      `docs/boards/sections.json`, `PRV-10` is added to `docs/boards/merged.json`, and PRV-22's fidelity suite
      (`e2e/fidelity.spec.ts`) passes for those rows at 1440 and 390 in light and dark, including the applicable
      owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour, copy, image
      frames, section order, visible motion and both themes. It does not cover demo behaviour or exact easing. A
      width that no board draws is skipped and listed in the PR for QA. The same fidelity run checks the existing
      shared-header rows with PRV-4's navigation deviation expired. The named scenario fails if any required profile
      or shared-header check is missing or fails. T: `profiles.spec.ts › PRV-10 fidelity
      rows`.
