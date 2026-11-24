PRV-8
# Photos, "The two of us" and /about

**Planned:** Sonnet, M, wave 3

- **Goal:** the legacy About page and the redesigned home need one consistent way to introduce Seth and Christine
  and help visitors contact them. Use one shared introduction on both pages and serve its photos without
  Vercel's metered image optimiser.
- **Depends on:** PRV-1 (image guard), PRV-2, PRV-5 (`RangeHome`, `Plate`, `/preview/home`).
- **Scope:**
  - **`scripts/photos/core.ts`** (`sharp` as a devDependency): auto-orients, strips all metadata and writes
    sized WebP variants. PRV-16 reuses it.
  - **`scripts/image-variants.ts`:** turns the owner's originals into `public/img/<name>-{400,800,1200}.webp`.
    Use stand-ins for any portrait or group photo whose owner original has yet to arrive; stand-ins never block
    this ticket. The orchestrator supplies any available originals outside the worktree. Commit only the
    generated variants, never the originals.
  - **`lib/image-loader.ts`:** a custom `next/image` loader that branches by source, so Vercel's metered image
    optimisation is never used (default, §6 Q7):
    - a local image gets the nearest committed variant, from a manifest the variants script writes;
    - a Cloudinary image gets a URL transform (`f_auto,q_auto,w_<width>` after `/upload/`);
    - any other remote source fails the build.

    `remotePatterns` narrows to `res.cloudinary.com`, path `/dg0t8ipwi/**`.
  - **`content/people.ts`:** both people, with the board copy, photo and alt text, links, and
    `cv: { path, ready: false }`. A build check fails if `ready` is true and the file is missing.
  - **`components/people/TwoOfUs.tsx`:** the section as in §2, with ids `seth` and `christine`, and "Or hire us
    both" linking to `/contact`. A CV link renders only when `ready` is true.
  - **Placement:** on the new home after the range (`/preview/home` until PRV-11). The section holds no group
    photo: PRV-8 makes the variants of the photo of the three of us, and PRV-9 places it after Holly, since
    PRV-9 already depends on PRV-8. `PersonSection` and `SharedInterests` are deleted.
  - **`/about`:** build the body from the desktop and phone About boards: the opening heading and intro, the
    shared `TwoOfUs` section, "What we believe", and the contact call where drawn. Set the page metadata title
    to "About". Update `navigation.spec.ts` to expect the board heading "Seth builds. Christine tests."
  - **Credit lines:** the plates' "Built by Seth · Tested by Christine" now links `#seth` and `#christine`.
  - **JS baseline:** after removing `PersonSection` and `SharedInterests`, remeasure first-load JS in a commit
    after the code changes, lower `current` in `perf-baseline.json` to the measured values, update
    `measured_sha`, and leave `original` untouched.
  - **Fidelity:** mark PRV-8's home people and About rows `built` in `docs/boards/sections.json`, and add PRV-8
    to `docs/boards/merged.json`.
  - **Edit boundary:** the diff stays inside `scripts/photos/`, `scripts/image-variants.ts`,
    `lib/image-loader.ts`, `content/people.ts`, `components/people/`, the deleted `PersonSection` and
    `SharedInterests`, the credit-line change in `components/range/`, `components/home/RangeHome.tsx`,
    `app/about/`, the Next image configuration, the CV build-check script and its `package.json` wiring (with
    the lockfile), `public/img/`, `perf-baseline.json`, `docs/boards/sections.json`, `docs/boards/merged.json`,
    `e2e/people.spec.ts` and `e2e/navigation.spec.ts`.
- **AC:**
  1. Both panels show the board copy: name, role, fact, pitch, Open to, "What I did here" links, Email (mailto),
     LinkedIn and GitHub. On `/preview/home`, "The two of us" follows the range, and "Or hire us both for your
     project or idea" links to `/contact` on both `/preview/home` and `/about`. On both routes, each panel's project, email,
     LinkedIn and GitHub links use the corresponding board destinations. Where the separate About contact call is
     drawn, "Start a project" links to `/contact`. T:
     `people.spec.ts › both panels`.
  2. With `ready` false, nothing links to `/cv/` and no "Download CV" shows. Run the normal production build command, `npm run build`, for both fixtures. With
     `ready` true and the configured PDF absent, the build exits nonzero and identifies the missing CV. With one
     person marked ready and their fixture PDF present, the build succeeds, that panel links to its configured CV path, and the other panel's CV link stays hidden. T:
     `people.spec.ts › CV hidden until ready`.
  3. Each portrait in `TwoOfUs` is a `public/img/*-{400,800,1200}.webp` variant with width, height and the
     board's alt text. Each request is ≤ 2 × rendered width × DPR, or the smallest variant. No route in
     `urls.json`, including `/preview/home`, makes a `/_next/image` request. On the production build, bring the portraits and the existing `next/image`
     images on the routes in `urls.json` into view and assert that they decode successfully. Existing images
     retain their source asset identities after URL transformation. T:
     `people.spec.ts › sized variants, no optimiser`.
  4. At 1440, the frame is one element with a 1px ink border and an ink rule between the panels; at 390 they
     stack. The section contains no group photo. The detector finds no card grid. T:
     `people.spec.ts › one frame, a pair`.
  5. `/about` returns 200, uses the "About" metadata title with the site title template, and shows the shared
     section and the About board sections in board order at each width. `PersonSection` and `SharedInterests`
     are removed. T: `people.spec.ts › about reuses the pair`. The board heading assertion is in
     `navigation.spec.ts › should navigate to all main pages`.
  6. Only variants are committed under `public/img/`, and PRV-1 AC11 passes on them. A clean fixture given a
     rotation tag at test time comes out upright, with no metadata. The generated manifest points to committed
     400, 800 and 1200 WebP variants for both portraits and the group photo, stand-ins included where needed,
     and each file has its declared width. T: `people.spec.ts › variants upright and clean`.
  7. Each plate's credit line links "Seth" to `#seth` and "Christine" to `#christine`, and both targets exist on
     the page. Each fragment resolves to the visible panel for the named person. T: `people.spec.ts › credit lines link the people`.
  8. The local loader selects the nearest committed variant from the generated manifest. An allowed Cloudinary
     fixture inserts `f_auto,q_auto,w_<width>` immediately after `/upload/`. Build fixtures using another host,
     or another Cloudinary account, exit nonzero. T:
     `people.spec.ts › loader selects variants and rejects unsupported sources`.
  9. The updated `perf-baseline.json` binds to the PR under the inherited JS budget guard, and `original`
     equals the PR base. For each budget route, `current` equals the recorded first-load JS byte count from the
     production measurement at `measured_sha`. T: `guards.spec.ts › JS within baseline`; `people.spec.ts › JS baseline records measured bytes`.
  10. PRV-8's home people and About rows are marked `built`, PRV-8 is recorded in `merged.json`, and PRV-22's
      fidelity suite passes on those rows at 1440 and 390 in light and dark. T:
      `people.spec.ts › PRV-8 fidelity rows`.
  11. The diff against the PR base touches only the paths in the edit boundary above. Compared with the PR
      base, `sections.json` changes only the `built` flags on the PRV-8 rows named in AC10, and `merged.json`
      adds only `PRV-8`. Existing routes,
      redirects, navigation and page content outside the scoped changes match the PR base, and the live `/`
      keeps its existing content until PRV-11. T: `people.spec.ts › changes stay within scope`.
