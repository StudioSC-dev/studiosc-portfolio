PRV-15
# Contact, for clients

**Planned:** Sonnet, S, wave 4

- **Goal:** The contact form is the clients' way in, but it uses Framer, vague labels and errors, and an
  "employment" option that no longer fits now that recruiters are sent to the profile pages. Make it a clear,
  clients-only form as drawn.
- **Depends on:** PRV-4, PRV-10.
- **Scope:**
  - **Files:** may touch only `components/contact/ContactForm.tsx`, `app/contact/page.tsx`,
    `app/api/contact/route.ts`, `lib/email.tsx`, the `service` type in `types/index.ts`,
    `e2e/contact-form.spec.ts`, `perf-baseline.json`, `docs/boards/sections.json` and `docs/boards/merged.json`.
    Edit the client and server Zod schemas in their existing files.
  - **Perf baseline:** after the change, record the measured first-load JavaScript values for all six budget routes in
    `perf-baseline.json` under `current`, update `measured_sha`, and preserve `original` (PRV-1's rule).
  - `ContactForm.tsx` with no Framer, sentence-case labels and error copy that says how to fix each error.
  - Build the form shown in `pages-contact-desktop.dc.html` and `pages-contact-phone.dc.html`: name, email, project
    description and the optional "What do you need?" radio group. Map "Build something new", "Test something you
    already have" and "Both" to the existing `full-stack`, `qa` and `full-cycle` API values. Remove `employment`
    from both schemas, the type and the route's email mapping. Accept an omitted service, company, budget and
    referral source. Render the selected client service with its board label in the enquiry email when supplied.
  - The recruiter note points to `/seth` and `/christine`.
  - The reply-time line is the board's copy: "We reply by email within 2 working days" (owner, 2026-11-20).
  - "employment" is dropped (default, §6 Q6).
  - Update `contact-form.spec.ts`.
- **AC:**
  1. Each visitor-facing control, including each service radio, has a visible label associated by `for` and `id`. The
     honeypot stays hidden and outside the tab order. T: `contact-form.spec.ts › labelled fields`.
  2. An empty submit shows actionable errors beside the required fields and focuses the first invalid field. A
     malformed email shows the board's email correction. Optional fields can be left blank, and invalid submits make
     zero POST requests. T: `contact-form.spec.ts › validation guides`.
  3. Submit valid name, email and project description through the browser once per service choice and once with no selection. For each submit, assert exactly one POST to `/api/contact` with the entered fields. Assert that "Build something new" sends `full-stack`, "Test something you already have" sends `qa`, "Both" sends `full-cycle`, and no selection omits `service`. Return a mocked success response and assert that the sent state appears. T: `contact-form.spec.ts › mocked send`.
  4. The recruiter note links to `/seth` and `/christine`, and the three board choices are the only visible service
     choices. T: `contact-form.spec.ts › clients only`. With email delivery stubbed, POST a valid name, email and project description to the real route for each current service value and with `service` omitted. Omit company, estimated budget and referral source in all four cases. Each request returns HTTP 200 and makes exactly one delivery call. Assert that the email contains the submitted enquiry and, when supplied, the corresponding board service label. An otherwise valid request with `service: "employment"` returns HTTP 400 with a service validation error and makes zero delivery calls. T: `contact-form.spec.ts › client enquiry API and email`.
  5. If the contact request fails, the form shows a retry instruction, keeps entered values, and lets the visitor
     submit again. T: `contact-form.spec.ts › failed send can be retried`.
  6. The `/contact` page and form are still on initial load. Zero `framer-motion` imports in
     `app/contact/page.tsx` and `components/contact/ContactForm.tsx`. T: `contact-form.spec.ts › still, no framer`.
  7. The diff against the PR base touches only the paths in this ticket's Files scope bullet. Any other path fails.
     Every URL in `e2e/fixtures/urls.json` at the PR base keeps its status (a 308 still leads to a 200) and its
     shared navigation links; routes that later tickets build may still answer 404. Compare the shared files against the PR base. In `types/index.ts`, only `ContactFormData.service` may change, and its union contains exactly `full-stack`, `qa` and `full-cycle`. In `docs/boards/sections.json`, only the `built` flags for this ticket's contact rows may change. In `docs/boards/merged.json`, the only change is adding `PRV-15` once. T: `contact-form.spec.ts ›
     changes stay within PRV-15 scope`.
  8. The rows this ticket builds (the `contact` rows in their empty, error and sent states) are marked `built` in
     `docs/boards/sections.json`, `PRV-15` is added to `docs/boards/merged.json`, and PRV-22's fidelity suite
     (`e2e/fidelity.spec.ts`) passes for those rows at 1440 and 390 in light and dark, including the applicable
     owner-accepted deviations. Fidelity covers the visual look only: layout, spacing, type, colour, copy, image
     frames, section order, visible motion and both themes. It does not cover demo behaviour or exact easing. A
     width that no board draws is skipped and listed in the PR for QA. T: `contact-form.spec.ts › PRV-15 fidelity
     rows`.
  9. Record fresh production measurements in `current` for all six budget routes defined by PRV-1, update
     `measured_sha`, and preserve `original` from the PR base. Pass PRV-1's inherited SHA binding and byte
     ceilings. T: `guards.spec.ts › JS within baseline`.
  10. A direct request with a missing required field or malformed email returns HTTP 400. An otherwise valid request with a filled honeypot returns HTTP 200. A rate-limited request returns HTTP 429. Each case makes zero delivery calls. T: `contact-form.spec.ts › contact API safeguards stay in place`.
