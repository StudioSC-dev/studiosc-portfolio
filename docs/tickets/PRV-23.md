PRV-23
# Outcome counters

**Planned:** Sonnet, M, wave 4

- **Goal:** make §0's outcome targets measurable on the free tier, without letting the counters skew the
  numbers or put the contact form at risk.
- **Depends on:** PRV-8 (the home panels and the heading the reach marker sits on), PRV-10, PRV-15. It merges
  before PRV-11 flips the home flag (PRV-11 depends on it).
- **Scope:**
  - **Files:** may touch only `lib/outcomes.ts`, `lib/beacon.ts`, `lib/rate-limit.ts` (Upstash error fallback to the existing in-memory contact limiter only), `app/api/count/`, the
    contact API route (the `contact-sent` increment only), the lines in `components/range/`,
    `components/home/RangeHome.tsx`, `components/people/`, `app/seth/` and `app/christine/` that wire the beacon,
    `scripts/outcomes.ts`, the `outcomes` script in `package.json`, `e2e/outcomes.spec.ts`. `e2e/fixtures/urls.json` inventories page URLs, so
    the POST-only `/api/count` endpoint is covered in `outcomes.spec.ts › counter route` and the page fixture
    stays unchanged.
  - **`lib/outcomes.ts`:** two name sets.
    - **Public:** `cv-<person>-<where>` and `email-<person>-<where>` (`seth` or `christine`; `page` or
      `home`), `home-view`, `tab-<category>`, `depth-2` to `depth-7`, and `reach-two-of-us`.
    - **Server-only:** `contact-sent`, which the public route never accepts.
  - **`app/api/count/route.ts`:** `POST`, with a public counter name as the whole body. In order, before any
    Redis call:
    1. the name must be in the public allowlist (otherwise 400);
    2. a per-IP limit of 30 a minute (in memory; the IP is used only for the limit and never stored);
    3. a per-instance cap of 600 writes an hour.

    Then it increments `outcome:<name>:<YYYY-MM>` (UTC). Without Upstash (preview and local), and on any store
    error, it answers 204 and writes nothing.
  - **Quota:** the counters share the free plan's 500K monthly commands with the contact limiter. A budget
    reservation is deferred until traffic is significant (owner, 2026-11-20; §6 Q26).
  - **The contact route:**
    - It increments `contact-sent` only after Resend accepts a real send, never on the honeypot path or a
      failure. A counter error never changes the send's response.
    - `lib/rate-limit.ts`: when Upstash throws (a quota error included), the limiter falls back to the existing
      in-memory limiter instead of the route returning 500.
  - **`lib/beacon.ts`** (client, ≤ 1 KiB gzip): `navigator.sendBeacon` with the name. Links keep their real
    `href` (the CV PDF, the `mailto:`), and nothing waits on the beacon. Without JS, nothing is counted.
  - **Home counters only at `/`:** `home-view`, `tab-*`, `depth-*`, `reach-two-of-us` and the home panels' CV and
    Email send only when the new home is served at `/`. On `/preview/home` nothing is sent, so collection on
    home starts with PRV-11's flip, and the person-page counters with this ticket's deploy.
  - **One home view** starts on a document load of `/`, on each client navigation into `/`, and on a
    back/forward-cache restore (`pageshow` with `persisted`). Each view sends `home-view` once and keeps its own
    set of plates seen.
  - **Engagement, per view:**
    - a tab, chip, back or next pick sends `tab-<category>`; the plate on load is not a pick;
    - `depth-n` is sent once, at the moment the n-th distinct plate is first seen (n from 2 to 7), so no count
      depends on `pagehide`;
    - `reach-two-of-us` is sent once, when a fixed zero-height marker at the top of the "The two of us" heading
      first enters the viewport.
  - **Wiring for recruiters:** Download CV and Email on `/seth`, `/christine` and both home panels.
  - **Reporting windows:**
    - The owner records in the session log the day PRV-23 is live on production, the activation date (the day
      PRV-11's flip is live; PRV-23 is already live then), and the day PRV-19 makes the CV links visible.
    - Reporting covers complete months only: a UTC calendar month in which the counter was live from the first
      day to the last. Marking a month that store failures or the quota cut short is deferred (§6 Q26).
    - Home counts start from the first complete month after activation, person-page counts from the first
      complete month after PRV-23 went live, and CV counts from the first complete month after the CV links
      appeared.
    - Eligibility is assessed per row, and the UTC month containing each applicable start date is excluded.
      Enquiries and home counters use `--activated`. Person-page counters use `--live`. CV rows also use
      `--cv-from`; without it, CV rows are incomplete. The current UTC month is incomplete.
    - The monthly enquiry baseline is 0 (the owner, 2026-11-20: none in August to October 2026).
  - **`scripts/outcomes.ts`** (`npm run outcomes -- --month YYYY-MM --baseline 0 --live <date> --activated
    <date> [--cv-from <date>]`): prints §0's table for one month and marks a partial month as incomplete, outside the
    targets. Production reporting runs on the owner's machine, with the Upstash read credentials loaded for that one
    command. CI runs the same command against a fixture store without Upstash credentials. Its output goes in the
    session log, not the repo.
  - Tests use an in-memory store (`OUTCOMES_STORE=memory`), which the route refuses when `VERCEL_ENV` is
    `production`. The CV specs force the CV flag on.
- **AC:**
  1. A public name increments its month key. Exercise every public name, including every configured tab category. Each exact name increments only its own UTC month key. An empty body, a JSON-wrapped public name and a public name with trailing whitespace each return 400 and make no store call. `GET /api/count` returns 405 and makes no store call. With `VERCEL_ENV=production`, `OUTCOMES_STORE` unset and a configured Upstash test double, a valid POST increments the expected key through the Upstash adapter. `contact-sent` and unknown names get 400 and write nothing. Without
     Upstash the route answers 204 and writes nothing. A valid body increments exactly one
     `outcome:<name>:<YYYY-MM>` key for the UTC month, and requests immediately before and after UTC month
     rollover increment different keys. If the store increment throws, the route returns 204 without retrying.
     `OUTCOMES_STORE=memory` is refused in production, where with `VERCEL_ENV=production` the memory store
     receives no writes. T:
     `outcomes.spec.ts › counter route`.
  2. The 31st request from one IP in a minute, and the 601st write in an hour on one instance, are refused
     before any store call. Within each window, valid requests through the stated limit reach the store, and excess
     requests receive 429 before any store call. A second IP can still write while the instance has capacity, and
     a fresh window restores capacity. From a fresh IP, submit an invalid name and then verify that all 30 valid requests still reach the store. After at least one request has been rejected by the per-IP limit, verify that valid requests across multiple IPs still reach 600 store calls in that instance's hour and that the next eligible request receives 429. T: `outcomes.spec.ts › bounded before Redis`.
  3. A real send increments `contact-sent` once. The honeypot path and a failed send do not. A failing increment
     after the send leaves the response unchanged. When the limiter's store throws, including a quota error, the
     contact route falls back to the in-memory limiter and still sends. With Upstash throwing, a request within the existing in-memory limit still sends, and a request over
     that limit returns 429 without calling Resend or incrementing `contact-sent`. T: `outcomes.spec.ts › contact
     never breaks`.
  4. Download CV and Email on both person pages and both home panels each send one beacon with the right name and
     still follow their real link. T: `outcomes.spec.ts › recruiter actions`.
  5. On a load, a client navigation into `/` and a back/forward restore, `home-view` is sent once each. `depth-n`
     is sent once per view when the n-th distinct plate is first seen, never again in that view, and the plate on
     load sends no `tab-*`. `reach-two-of-us` is sent once per view when the marker enters the viewport. A tab, chip, back or next
     pick emits one `tab-<category>` for the selected plate. The initially visible plate counts toward depth, so
     the first different plate emits `depth-2` immediately. A `pageshow` restore with `persisted=true` starts a
     fresh set of seen plates and a fresh reach count. With the home flag off, the legacy `/` and `/preview/home`
     emit no home counters, including panel CV and Email beacons. With the new home active and the CV links enabled, load `/about`, bring "The two of us" into view, and exercise both panels' Download CV and Email links; assert that no POST to `/api/count` is sent. T: `outcomes.spec.ts › views, depth and reach`.
  6. The beacon body is the counter name only, no response sets a cookie, and the stored keys hold no IP, user
     agent or id. The beacon module is ≤ 1 KiB gzip, first-load JS on every budget route stays at or below `1.03 × current` in `perf-baseline.json`, using the
     existing guard in Chromium, and no dependency or service is added. With JavaScript disabled, the CV and Email
     anchors retain their real destinations and emit no count request. T: `outcomes.spec.ts › counts only, small`.
  7. `npm run outcomes` runs against known fixture counts. It asserts the enquiry count and its comparison with
     baseline 0, CV and Email totals by person and placement, tab and depth counts, and the second-plate and reach
     shares of home views; for zero home views the shares show as unavailable. Staggered start dates verify that
     eligible rows report values while ineligible rows are marked incomplete and excluded from targets, covering
     the current UTC month, the CV start month, and an omitted `--cv-from`. Seed two eligible UTC months with different nonzero counts, run `npm run outcomes` for each `--month` and verify that each report uses only that month's counts. A future UTC month is marked incomplete and excluded from targets. T: `outcomes.spec.ts › report and
     incomplete months`.
  8. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links; routes that later tickets build may still answer 404. In `package.json` the only
     difference from the PR base is the added `outcomes` script. Existing recruiter links and range controls keep
     their destinations and behavior with collection disabled. The work audit verifies that changes to `lib/rate-limit.ts` are confined to the Upstash error fallback and that edits to the remaining permitted existing files are confined to the lines identified in Files scope. T: `outcomes.spec.ts › changes
     stay within PRV-23 scope`.
- **No ui-verify:** nothing on the page changes. `fidelity.spec.ts` still runs in CI.
