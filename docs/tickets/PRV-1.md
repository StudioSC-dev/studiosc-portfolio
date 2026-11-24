PRV-1
# E2e ready for ui-verify, plus the guards

**Planned:** Sonnet, L, wave 1

- **Goal:** the existing Playwright suite runs against the dev server and lacks the regression baselines the
  redesign needs. Make it runnable by ui-verify against a production build, and establish guards for URLs, console
  errors, privacy, image metadata, first-load JS and layout before the redesign starts. The marathon embed fix lets
  the existing page pass the production console guard.
- **First step:** run the image guard and the denylist over today's tree, then fix or list each hit in the PR.
  Known today:
  - `app/favicon.ico`: it has four frames (16, 32 and 48px bitmap frames, and a 256px PNG frame that carries an
    `eXIf` chunk). Fix: re-encode every frame with all metadata stripped and the pixels kept, with the same
    dimensions (the PNG frame loses the `eXIf` chunk; the bitmap frames are rewritten as plain DIBs).
  - `next.config.ts`: `allowedDevOrigins` holds a LAN IP. Fix, by default (§6 Q19): read it from a
    comma-separated `DEV_ORIGINS` env var, empty when unset, so no IP is committed. AC5 is green when PRV-1
    merges.
  - `e2e/blog-columnar-pad.spec.ts`: names the lab-domain token because it defines a denylist. It is
    self-excluded.
- **Scope:**
  - `playwright.config.ts` reads `E2E_PORT` (default 3000) and serves a production build. Keep the five browser
    projects. CI's `test` job checks out with `fetch-depth: 0` and passes `PR_HEAD_SHA`.
  - `e2e/support/shot.ts` (full-page at 1440 and 390, Chromium and Mobile Chrome) and `e2e/support/cards.ts`
    (the detector below).
  - **`scripts/image-metadata.ts`,** run with `tsx` (a new devDependency), with a CLI that takes file paths. It is
    an allowlist; anything not allowed fails, naming the file and what it found:
    - **JPEG:** SOI, APP0 (JFIF), APP2 only when it is `ICC_PROFILE`, APP14 (Adobe), DQT, DHT, DRI, SOF0 to
      SOF15, SOS, RST0 to RST7 and EOI. Anything else (APP1 Exif or XMP, APP13, COM) fails, and so does any byte
      after EOI.
    - **PNG:** IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, pHYs, bKGD and sBIT. Any other chunk (tEXt, zTXt,
      iTXt, eXIf, iCCP, tIME, unknown) fails, and so does any byte after IEND.
    - **WebP:** VP8, VP8L, VP8X, ALPH, ANIM and ANMF. EXIF, XMP, unknown chunks and bytes past the RIFF size
      fail.
    - **ICO:** every frame is checked. PNG frames follow the PNG rules. A non-PNG frame passes only as a plain
      bitmap: a 40-byte `BITMAPINFOHEADER`, dimensions matching the directory entry, and a payload length equal to
      the size the header implies, with no trailing bytes. Invalid frame bounds (an offset or size outside the file,
      or overlapping the directory) or any other non-PNG frame fails, naming the file and frame index.
    - **SVG:** a `<metadata>` element fails.
    - **Any other image format** (GIF, AVIF, HEIC, TIFF) fails.
  - **Pre-commit:** a `lint-staged` entry runs the checker on staged images (jpg, jpeg, png, webp, gif, avif,
    heic, tif, tiff, ico, svg). A hit blocks the commit, naming the file and `npm run photos` (default, §6 Q14).
  - **Fixtures:** one committed clean JPEG and PNG. Dirty copies are made at test time in a temp dir by injecting
    made-up coordinates and an XMP packet. They are never committed.
  - **`e2e/support/denylist.ts`:** the rules below, with true and false fixtures in `denylist.fixtures.ts`. The
    exact regexes live only in `denylist.ts`; the dispatch brief carries them. They scan every text file git
    tracks. `denylist.ts`, its fixtures and `e2e/blog-columnar-pad.spec.ts` are self-excluded.
    - **path:** an absolute server or home-directory path, anchored so it never matches inside a repo path
      (`components/home/RangeHome.tsx` passes); a user-config path; a session temp path;
    - **lab domain:** the generic lab-domain token pattern, committed in `e2e/support/denylist.ts`, which holds
      no literal value. Its positive fixtures use synthetic matches;
    - **private IP:** the 10/8, 172.16/12 and 192.168/16 ranges;
    - **lab host:** names ending `.lan`, `.internal` or `.home.arpa`;
    - **env file:** a `.env` file name, in `app/`, `components/`, `content/`, `lib/` and `public/` only.
      Developer docs (`README.md`, `CLAUDE.md`, `.gitignore`) name env files without values and are allowed;
    - **secret prefix:** the key prefixes of the services the estate uses;
    - **phone:** Philippine mobile numbers in local and +63 form, and other `+`-prefixed international numbers.
    - **`localhost` and `127.0.0.1` are allowed:** public loopback in technical posts is not private.
    - Literal values (the lab domain, lab hostnames, GSS names, home addresses) cannot live in a public repo.
      They come from the owner's private list, read from `PREFLIGHT_PRIVATE_LIST` on the writing machine, which the
      pre-push hook below checks. CI has only the generic denylist patterns, never the private list (PRV-17's pre-flight
      reuses the same scanner).
  - **Pre-push privacy hook** (`.husky/pre-push`, `scripts/privacy-scan.ts`): before any push, it finds the
    commits the push makes newly reachable on the destination remote and scans each commit's own diff (the added
    lines of every text file against its first parent, or against the empty tree for a root commit), not only the
    net diff, so a value added and removed within one push is still caught. It does not trust local
    remote-tracking refs, which can be stale: it reads the refs currently on the destination with
    `git ls-remote <remote>` and runs `git rev-list <pushed local shas> --not <every tip ls-remote returns>`. A
    tip that is missing locally is fetched first, so it can be excluded. A first push of a new branch therefore
    scans every commit not already reachable from any destination ref; an empty remote scans every commit. A ref deletion (local sha all zeros) introduces no commits,
    so there is nothing to scan and it succeeds. It scans with the denylist and the owner's private list, read from
    the file named by `PREFLIGHT_PRIVATE_LIST`. That covers board exports, provenance, ticket files and all
    content. A hit refuses the push and names the file and rule, never the literal. It fails closed: with the
    variable unset or the file unreadable, every push is refused, and so is a push whose destination refs,
    reachability or any required diff cannot be determined. CI runs the generic denylist only. Git history stays as it is.
  - **The marathon post's embed:** the production CSP blocks Instagram's and Facebook's scripts, so
    `content/blog/first-marathon.mdx` renders one link card, the Instagram `LinkCard` the post shows today on
    load, and no Facebook container, and no social script loads. `pages-post-life-*` draws this post with no
    embed, so the reference is the current post's own on-load card: a shot of `/blog/first-marathon` at
    `origin/main`, with the scripts blocked, taken before the change. The card stays until PRV-16 replaces it with
    a Gallery of the owner's race photos (owner, 2026-11-20).
  - `e2e/fixtures/urls.json` (today's 32 URLs) and `perf-baseline.json` (per-route first-load JS, `original`
    never edited and `current` lowered later, with `measured_sha`). The budget routes are `/`, `/work`,
    `/work/tallyandtrace`, `/blog`, `/blog/tallyandtrace-performance` and `/about`. `original` and `current` start
    from the same production measurement, whose commit is recorded in `measured_sha`. First-load JS is the total
    transferred response-body bytes of script requests, from navigation to first network idle, in a fresh
    Chromium context.
  - `e2e/guards.spec.ts`, and the ticket files under `docs/tickets/`.
- **Card detector:** a card has a border on all four sides or a background unlike its parent's, and a radius
  above 0. A card grid is 3 or more sibling cards with equal rendered widths and heights. Rows with only a top or bottom border,
  controls (`button`, `input`, `select`, `textarea`, `summary`), and anything inside `[data-fragment]` are never
  cards.
- **AC:**
  1. The full suite passes in all five existing browser projects on a clean run with `E2E_PORT=4517`, using
     `next start` against a production build. The test asserts that the default port in `playwright.config.ts` is
     3000 and that the CI `test` job in `.github/workflows/ci.yml` uses `fetch-depth: 0` and passes the pull
     request head SHA as `PR_HEAD_SHA` to the test step. T: `guards.spec.ts › serves on E2E_PORT`.
  2. `urls.json` contains exactly the 32 unique page URLs of the pre-change tree: the six static pages, all four
     project slugs (`content/projects/`) and all 22 blog slugs (`content/blog/`). Every URL answers 200, or a 308
     that leads to a 200; the initial response status is checked before any redirect is followed. T: `› every URL
     resolves`.
  3. Every content slug renders exactly one h1. T: `› every content page has one h1`.
  4. Every denylist rule matches all its true fixtures and none of its false ones. The phone rule's false
     fixtures include `2026-11-19`, `2026-11-19T10:00:00+08:00`, `1,234,567.89`, `₱12,345.00` and `v20.11.1`.
     The env rule's false fixtures include `process.env.RESEND_API_KEY`. The path rule's false fixtures include
     `components/home/RangeHome.tsx` and `/preview/home`. T: `› denylist fixtures`.
  5. On the tree this PR merges, run the generic denylist on every tracked text file except
     `e2e/support/denylist.ts`, `e2e/support/denylist.fixtures.ts` and `e2e/blog-columnar-pad.spec.ts`. Assert zero
     matches. T: `guards.spec.ts › nothing private`.
  6. In Chromium, each budget route's first-load JS is ≤ 1.03 × `current`. For a PR that changes
     `perf-baseline.json`, the test requires `PR_HEAD_SHA`, asserts that `measured_sha` is its ancestor, and fails
     if `app/`, `components/`, `content/`, `lib/` or `public/` changed between those commits. On every run, assert that `original` and `current` each contain exactly the six budget routes. On the PR that introduces the baseline, assert that their values are equal for each route. On later PRs that edit the baseline, compare against the PR base and assert that each `original` value is unchanged and each `current` value is less than or equal to its base value. The byte thresholds are asserted on every run, including PRs that change the
     baseline. T: `guards.spec.ts › JS within baseline`.
  7. In Chromium, the sum of layout-shift entries from navigation to five seconds after `load`, without
     interaction, is ≤ 0.01 on each budget route. T: `guards.spec.ts › no layout shift`.
  8. For `/`, `shot()` writes a full-page screenshot at 1440px in Chromium and at 390px in Mobile Chrome. Each
     output has the requested width and includes content below the initial viewport. T: `guards.spec.ts ›
     captures desktop and phone`.
  9. On `setContent` fixtures, the detector:
     - flags three bordered rounded siblings, three rounded background-only siblings, and three rounded `a`
       blocks;
     - passes ruled rows, three rounded `button`s, and three rounded siblings inside `[data-fragment]`;
     - does not form a grid from two otherwise qualifying siblings, nor from three qualifying siblings of which one
       has a different rendered width;
     - also rejects a grid of three otherwise qualifying siblings with equal widths when one has a different
       rendered height, and a grid of three equally sized, fully bordered siblings whose border radii are all
       zero.

     T: `› card detector controls`.
  10. Every URL in `urls.json` loads without a console error at 1440 and 390. The test server stubs only
      `/_vercel/insights/*` and `/_vercel/speed-insights/*` (an empty script, status 200); no other error is
      allowed. This is the test the Testing plate's Christine line cites. T: `› every route renders without a
      console error`.
  11. Every image git tracks passes the checker. Dirty copies made in a temp dir fail, naming the file: a JPEG
      with made-up GPS, a PNG with `zTXt`, an ICO whose PNG frame has `eXIf`, an SVG with `<metadata>`, and a JPEG
      with bytes after EOI. A clean WebP passes. A WebP containing EXIF or XMP, a WebP with bytes beyond its
      declared RIFF size, a PNG with bytes after IEND and an unsupported image format (a GIF) each fail, naming the
      file and the reason. An ICO with an altered bitmap frame (trailing bytes or a wrong header) or with invalid
      frame bounds fails, naming the file and frame index. For every rejected fixture, assert that the diagnostic names the file and identifies the specific marker, chunk, element, format or structural error that caused rejection. For ICO frame failures, also assert that it names the frame index. The clean originals pass, and the cleaned `app/favicon.ico`
      passes with all four frames preserved. T: `› images carry no metadata`.
  12. In a throwaway repo with no remote, staging a dirty JPEG makes the hook block the commit, name the file and name `npm run photos`;
      staging the clean one lets it through. A dirty image that is left unstaged does not block a commit of the
      clean staged image. T: `› pre-commit blocks metadata`.
  13. Every file under `docs/` (the ticket files included) and `.claude/` passes the denylist, including its
      path and lab-domain rules: no absolute server or home-directory path, no user-config path and no
      lab-domain token. Before scanning, the test requires `docs/tickets/PRV.md` and every portfolio
      implementation ticket listed in it to exist as tracked files. T: `› committed docs carry nothing private`.
  14. In a throwaway repo with a local bare remote and a fixture private list, a push is refused (naming the file
      and rule, not the literal) when it adds a private literal or a denylist hit to a file under `docs/boards/`,
      `docs/provenance/`, `docs/tickets/` or `content/`. A clean push goes through. A push of two commits, the first adding a
      private literal and the second removing it, is refused, naming the first commit. With
      `PREFLIGHT_PRIVATE_LIST` unset, or naming a missing file, every push is refused. For both a new branch and an
      update to an existing branch, a push that publishes a dirty commit is refused even when a stale local
      remote-tracking ref already contains that commit. A first push of a new branch scans commits newly reachable across all destination refs. A clean push succeeds
      when an existing branch other than `main` already reaches a commit containing a fixture private value, even if
      that branch's tip is initially absent locally. Configure one remote with separate fetch and push URLs pointing to two bare repositories. Publish a fixture commit containing a private value to the fetch repository only. Pushing a branch that contains that commit to the push repository must be refused. A push whose first commit is a root commit has that commit scanned against the empty tree. A
      clean ref deletion succeeds and the readable private list is not echoed. A failed remote query, unresolved
      reachability or failed required diff refuses the push. T: `› pre-push privacy`.
  15. At 1440 and 390, the marathon post shows exactly one link card, the Instagram one, matching a fixed
      fixture: before editing the post, the script-blocked on-load card is captured at both widths from the
      pre-change `origin/main` commit, and its measured text, href and box are saved with that commit SHA as the
      fixture. The test compares against that fixture on every run (box within ±2px), never against a live
      `origin/main`. The card is still the only card 5 s after load (past today's 3 s timeout), and no Facebook
      container exists at load or at the 5 s check. It requests nothing from `instagram.com` or `facebook.net`. After
      the embed region settles (the cards visible and the network idle), there is no console error. T:
      `› marathon post embeds as links`. PRV-16 replaces this test with its own AC6.
  16. On the PRV-1 merge candidate, the application diff against the pre-change `origin/main` is limited to the
      `allowedDevOrigins` change in `next.config.ts`, the `app/favicon.ico` re-encode and the marathon card change
      in `content/blog/first-marathon.mdx` (and, if needed, `components/blog/SocialPost.tsx`). Every favicon frame
      keeps its dimensions and its decoded pixels, compared against decoded-pixel hashes of the pre-change
      favicon saved as a fixture with that commit SHA. Loading `next.config.ts` with `DEV_ORIGINS` unset gives an
      empty `allowedDevOrigins`; loading it with two comma-separated origins gives exactly those two entries. T: `guards.spec.ts › only intended application changes`.
- **ui-verify, for the marathon post only:** that page changes visibly (today its card gives way to an empty
  Facebook container after 3 s; now one card stays), so PRV-1 runs ui-verify on `/blog/first-marathon` against
  AC15, once PHB-28 has merged. The board-fidelity check is not part of this run: PRV-22 does not exist yet, and
  no board draws this embed. Nothing else visible changes (the favicon is re-encoded, not redrawn).
