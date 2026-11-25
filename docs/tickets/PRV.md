PRV
# studiosc.dev revamp

**Epic PRV: studiosc.dev revamp.**

- **Done when** every ticket below is merged and the blog post is live, and PRV-18's final checks pass and its final fidelity pass is confirmed on main.
  PRV-20 (life posts) is owner-blocked, and the epic stays open until it lands.
- **Ticket files:** Linear is at its free-issue cap, so each ticket is a repo file, `docs/tickets/PRV-<n>.md`,
  plus the checklist `docs/tickets/PRV.md`. The orchestrator writes them after approval, and PRV-1's PR adds them.
- **Committed docs carry nothing private:** no absolute server or home-directory path, no user-config path, no
  lab-domain token and no lab hostname. They say "the owner's local checkout" or "the lab domain" instead. The
  literal paths live only in the uncommitted dispatch briefs. This covers `docs/tickets/`,
  `docs/design-system.md` (it quotes the boards' copy, never their location), `docs/boards/`, `docs/provenance/`,
  `docs/perf/` and the skill's `SKILL.md` and `voice-guide.md`. The ticket text in this section can be committed unchanged.
  The denylist's exact regexes are in Appendix A of this plan (not committed) and, once written, only in
  `e2e/support/denylist.ts`, which is self-excluded. PRV-1 AC13 checks `docs/` and `.claude/`.
- **Branches:** `seth/prv-<n>-<slug>`. **Merges:** GitHub merge commits, as on main today. Each merge deploys to
  production. A link may point at a route a later ticket in this epic builds, and may 404 until then (owner,
  2026-11-20: "we'll build as we go").
- **Sizes:** S is up to 1 h of writer time, M is 1 to 2 h, L is 2 to 3 h.
- **Perf JSON rule (PRV-2 AC9, PRV-5 AC10, PRV-18 AC5):** a committed perf JSON records `measured_sha` and
  only the metrics the gates use: route, the 3 runs' perf, a11y, LCP and CLS, their medians, and the Lighthouse
  version. A Sonnet agent runs the measurement, never the orchestrator.
  - **The PR changes the JSON:** the spec binds to `github.event.pull_request.head.sha` (passed in as
    `PR_HEAD_SHA`). `measured_sha` must be an ancestor of it, and `git diff --name-only <measured_sha>
    <PR_HEAD_SHA>` must show no change under `app/`, `components/`, `content/`, `lib/` or `public/`. Any
    mismatch fails; it never skips.
  - **Any other run:** the spec asserts the thresholds only, and says why it did not bind.
  - **After any code change to the branch** (a rebase, an audit fix or a ui-verify fix): the JSON is re-measured
    at the new head and recommitted before the next audit or merge. This is an explicit step in §4.
- **JS budget, step by step:** `perf-baseline.json` keeps `original` fixed. Every ticket that removes a Framer
  Motion user lowers `current` to its measured value: PRV-4 (`Header`), PRV-8 (`PersonSection`,
  `SharedInterests`), PRV-14 (`BlogCard`), PRV-15 (`ContactForm`), and PRV-18 (the package).

**Rules every ticket inherits** (each brief repeats them):

- **CSS:** PRV-2 owns `app/globals.css`: every token, the product palettes, every keyframe and the
  reduced-motion rule. PRV-14 may edit only its `.prose` block; PRV-18 may only delete. Everything else uses
  token utilities, or a co-located `*.module.css` that references tokens. `--frag-*` is used only under
  `components/range/fragments/`. No raw hex or ad-hoc px (HB 6).
- **Copy:** board copy, verbatim, quoted in the brief. The boards' markers never ship ("[PLACEHOLDER]", "Sample",
  "Illustrative wording").
- **Fragments:** each lives in `components/range/fragments/<id>/`, with a `fixture.ts` marked `synthetic: true`,
  the fragment (root carries `data-fragment`), its peek drawing, and a caption from the board.
- **Christine lines:** as in §2. The orchestrator picks the test and pins the sha before dispatch.
- **Motion:** every animation and transition stops at its final state under `prefers-reduced-motion: reduce`.
  Nothing starts without a visitor action, except the home load moment.
- **Worktree:** every writer starts from a freshly fetched `origin/main`, never from
  the owner's local checkout, which is stale. It runs `npm ci` there and, from the moment PRV-1 merges, confirms the
  pre-commit image hook and the pre-push privacy hook fire (PRV-1 AC12 and AC14) before any work. §4's bootstrap
  table says how PHB-28, PRV-1 and PRV-22 meet the gates they supply.
- **Images:** only generated, metadata-free variants are committed: site photos through PRV-8's script, post
  photos through PRV-16's. PRV-1's pre-commit hook and CI guard are the backstops.
- **URLs:** no route or slug change without a `redirects()` entry and a row in `e2e/fixtures/urls.json`. New
  routes join `urls.json` in the ticket that adds them. `/preview/home` is temporary and exempt from the
  redirect rule: PRV-5 adds it to `urls.json`, so the h1, console-error and layout-shift guards cover it, and
  PRV-11 removes it.
- **Models and audits (owner, 2026-11-20):** Jev picks models through PHB-29's `task-route`, never below the
  deterministic floor in §4's table, wherever today's gates accept the choice: the writer, the PR auditor (Luna
  or Sol), the plan auditor (Luna or Sol), and the verifiers outside ui-verify. Ticket audits stay Sol and the
  ui-verify verifier stays Sonnet, as their tools pin them; Jev is asked in shadow there (PHB-30 would lift the
  pins). There are no triple, Opus or DeepSeek legs, and no required audit is skipped. Each ticket gets one Sol
  ticket audit before dispatch, one PR audit before the PR opens and one before it merges. If Codex is down, the
  audit's gate waits and the owner is told; there is no Sonnet stand-in.
- **Specs:** a ticket that changes copy covered by an existing spec updates that spec. Each ticket adds one new
  spec. Screenshots come from PRV-1's `shot()`. ui-verify judges against `docs/design-system.md` (PRV-2)
  and the board references in `docs/boards/` (PRV-22).
- **Fidelity (§2 decision 13):** each UI ticket marks the sections it builds in `docs/boards/sections.json`
  (PRV-22's map), and its ui-verify run includes the board-fidelity check for them. A mismatch fails the ticket
  unless `docs/boards/deviations.md` lists it, bound to its section, state and value, with the owner's
  acceptance. A partial build matches its ticket-specific reference state, and what a later ticket adds is an
  expiring deviation naming that ticket. A link may point at a route a later ticket builds.
- **Build:** TypeScript strict, no `any`, free tier only, every font self-hosted.
- **Nothing private:** no paths, hostnames, the lab domain, owner figures or GSS material. Product figures come
  only from made-up fixtures. The people's names, studio emails, LinkedIn, GitHub and the owner's photos are
  published by the owner's choice. No home address appears anywhere (home addresses come from the private list,
  PRV-17). Site and post text carries no phone number (PRV-1's denylist); the CV PDFs may, by the owner's choice
  (2026-11-20).

The scenario test for each AC is given after "T:", as `file › test title`.


**Count:** 25 scheduled tickets: PHB-29, PHB-28 and PRV-1 to PRV-23. PHB-30 is listed but not scheduled. After
PHB-29 lands, Jev picks the models the gates allow, above §4's floors. At the defaults, Opus writes PHB-29, PRV-2,
PRV-5, PRV-22 and the skill half of PRV-17, and Sonnet writes the rest, including PRV-17's tests. PRV-20 is owner-blocked. Each brief is one PR, under
the 40k-token cap, except PRV-20 (one PR per post). The largest is PRV-5.

## Checklist

- [ ] PHB-29: Jev task router (harness)
- [ ] PHB-30: Ticket-audit and ui-verify accept a routed model (harness)
- [ ] PHB-28: Ui-verify-run supports npm repos (harness)
- [ ] PRV-1: E2e ready for ui-verify, plus the guards
- [ ] PRV-2: Design system, tokens and motion (Range)
- [ ] PRV-3: Content model and its build-time check
- [ ] PRV-4: Shared chrome and the theme switch
- [ ] PRV-5: The opener, the range and the Central Command plate
- [ ] PRV-6: Tally & Trace, Sites and Testing plates
- [ ] PRV-7: The lab demos
- [ ] PRV-8: Photos, "The two of us" and /about
- [ ] PRV-9: Holly
- [ ] PRV-10: /seth and /christine
- [ ] PRV-11: Every project, /work and the home order
- [ ] PRV-12: Case-study template
- [ ] PRV-13: Tally & Trace case study, current screens
- [ ] PRV-14: Writing in two views, and the post template
- [ ] PRV-15: Contact, for clients
- [ ] PRV-16: Photos for posts, and `<Gallery>`
- [ ] PRV-17: The `blog-post` skill
- [ ] PRV-18: Clean-up, site-wide checks, final perf
- [ ] PRV-19: CVs
- [ ] PRV-20: Life posts (owner-blocked)
- [ ] PRV-21: Blog post (epic definition of done)
- [ ] PRV-22: Board references and the fidelity check
- [ ] PRV-23: Outcome counters
