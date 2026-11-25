PRV-19
# CVs

**Planned:** Sonnet, S, wave 4

- **Goal:** The recruiter CV links stay hidden because the CV files are not on the site. Publish both cleaned CV
  PDFs and switch the links on, so the panels and person pages offer a download.
- **Depends on:** PRV-10.
- **Inputs received (owner, 2026-11-20):** both PDFs, with a city-only location and no street address: Christine's
  city-only version (final) and Seth's new CV. The orchestrator holds them, and the dispatch brief gives their
  location. Phone numbers and the personal emails stay. Metadata is still stripped to the title only, as below.
- **Files:** may touch only `public/cv/`, `scripts/pdf-clean.ts`, `content/people.ts` (the `ready` flags only),
  `package.json` and `package-lock.json` (the `pdf-lib` and `pdfjs-dist` devDependencies and their lockfile entries only), `e2e/cv.spec.ts`, and
  `docs/boards/merged.json`.
- **Scope:** commit `public/cv/seth.pdf` and `public/cv/christine.pdf`, and set `ready: true` for both. Before the
  commit, `scripts/pdf-clean.ts` (`pdf-lib`) loads each PDF with `updateMetadata: false`, removes the XMP
  metadata stream and every Info field except Title, and deletes the orphaned Info and XMP objects so they are
  not written back.
  `pdf-lib` is added as a devDependency for `scripts/pdf-clean.ts`, and `pdfjs-dist` for the spec.
- **AC:**
  1. Both `/cv/` URLs answer 200 with `application/pdf`. The local scenario compares `/cv/seth.pdf` with Seth's
     owner-supplied input and `/cv/christine.pdf` with Christine's owner-supplied input. It fails if the title, page
     count, or whitespace-normalized text on any corresponding page differs. Report filenames and pass or fail only. T: `cv.spec.ts › CVs served`.
  2. On the active new-home route and `/about`, each person's panel shows the board's "Download CV (PDF)" link. Both
     person pages show the same download label and a separate "The full history is in the CV." link. Every link
     points to that person's PDF, `/cv/seth.pdf` or `/cv/christine.pdf`. T: `cv.spec.ts › CV links appear`.
  3. Before the PDFs are committed, text is extracted from every page of both publication files and checked against
     the owner's private list, supplied through `PREFLIGHT_PRIVATE_LIST`. The local scenario fails if the list is
     missing, unreadable, or contains no nonblank literals, if extraction fails or any page yields no extractable
     text, or if any private-list literal matches. CI exercises the same checks with synthetic inputs covering a
     clean document, a matching literal, an empty list, and a multipage PDF with one page that yields no text. The PR records the local pass and the owner's 2026-11-20
     city-only confirmation. Output gives filenames and pass or fail, never extracted text or private literals.
     Phone numbers and personal emails remain. T: `cv.spec.ts › no street address`.
  4. Each publication PDF is inspected directly, decoding object streams while keeping unreferenced objects
     visible. The trailer's Info dictionary has exactly one key, `Title`. It fails if any source Info object
     survives as an orphan, any stored object has `/Type /Metadata`, or raw or decoded contents contain
     `<x:xmpmeta`. T: `cv.spec.ts › no PDF metadata`.
  5. The audited PR base and head are compared. Any path outside Files, or any change beyond the limits in Files and
     Scope, fails. Under `public/cv/` only `seth.pdf` and `christine.pdf` are added. In `content/people.ts` only the
     two CV `ready` flags change, to `true`. The package files change only for the two permitted devDependencies,
     and `docs/boards/merged.json` changes only by adding `PRV-19`.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links, except that `/cv/seth.pdf` and `/cv/christine.pdf` now answer 200; routes that later
     tickets build may still answer 404. T: `cv.spec.ts › changes stay within PRV-19 scope`.
  6. PRV-19 builds no board row of its own. `PRV-19` is added to `docs/boards/merged.json`, which expires the "CV
     links hidden until PRV-19" deviation, and PRV-22's fidelity suite (`e2e/fidelity.spec.ts`) passes at 1440 and
     390 in light and dark for the built rows that carry the CV links, including `people` on `/preview/home` before PRV-11 or `/` after
     PRV-11, the shared panels on `/about`, and the `seth` and `christine` profile rows,, with the
     Download CV links visible. Fidelity covers the visual look only: layout, spacing, type, colour, copy, image
     frames, section order, visible motion and both themes. A width that no board draws is skipped and listed in
     the PR for QA. T: `cv.spec.ts › PRV-19 fidelity rows`.
