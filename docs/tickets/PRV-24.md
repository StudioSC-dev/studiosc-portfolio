PRV-24
# Stop Playwright's PR-base fetch from making the CI clone shallow

**Planned:** Sonnet, S, wave 1 fix (blocks PRV-22 and PRV-2)

- **Goal:** on a pull request in GitHub Actions, Playwright 1.58's git-info step (`gitCommitInfoPlugin`, enabled by default on CI) runs `git fetch origin <PR base> --depth=1` in the repo root before any test. That writes `.git/shallow` and cuts the base's history, so once main moves past a branch's fork point, `git merge-base <base> <head>` and `<base>...<head>` fail with "no merge base". PRV-1's `changedByPr` (`e2e/support/git.ts`) and the `JS within baseline` guard then fail, and so does any PR-only check that diffs against the fork point (PR #22, run 45687360093). Keep the full clone that CI's `fetch-depth: 0` checkout provides.
- **Scope:**
  - `playwright.config.ts`: set `captureGitInfo: { commit: true, diff: false }`. Nothing else in the file changes.
  - `e2e/guards.spec.ts`: one regression test.
  - `docs/tickets/PRV-24.md`: this ticket.
  - No change to `.github/workflows/`, `e2e/support/git.ts` or any other guard.
- **AC:**
  1. In a PR run, after the shallow-repository and merge-base assertions, the scenario asserts that `playwright.config.ts` explicitly sets `captureGitInfo` to exactly `{ commit: true, diff: false }`. T: `guards.spec.ts › repo stays a full clone in PR runs`.
  2. The test resolves the CI range with PRV-1's `prRange()`. In a PR run it asserts `git rev-parse --is-shallow-repository` prints `false` and `git merge-base $PR_BASE_SHA $PR_HEAD_SHA` exits 0. In a push run without PR SHAs the scenario reports skipped; in a PR run with either SHA missing it fails with `prRange()`'s missing-SHA error. The writer exercises the scenario under both environments and records the reported status. T: `guards.spec.ts › repo stays a full clone in PR runs`.
  3. Run the named scenario with the config key absent and again with it present. Each run starts from the same full history, with `origin` able to serve the PR base SHA and `git merge-base` succeeding before Playwright starts. The base is a main commit newer than the branch's fork point, with `CI=true`, `GITHUB_ACTIONS=true`, `GITHUB_EVENT_NAME=pull_request`, both PR SHAs, and a `GITHUB_EVENT_PATH` whose `pull_request.base.sha` matches `PR_BASE_SHA`. The first run fails at the shallow-repository assertion and the second passes; the writer records both results. T: `guards.spec.ts › repo stays a full clone in PR runs`.
- **Required work-audit evidence:** on the audited PR head, the full CI `test` job passes. On the same head, `git diff --name-only <base>...HEAD` lists exactly the three Scope files, and the work audit verifies the only edit to `playwright.config.ts` is the added `captureGitInfo` key.
- **Follow-on:** after this merges, main is merged into PRV-22 (PR #22) and PRV-2 (PR #20), with no rebase or force-push, and their CI is rerun.

## Known gaps

- The ticket audit stopped after 2 rounds, per the portfolio ticket-audit cap (owner, 2026-11-24). Round 2's single warning (AC1 must assert the exact config values in the named scenario) is applied in this final fix pass and not re-audited.
