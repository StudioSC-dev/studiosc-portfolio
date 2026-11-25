PRV-7
# The lab demos

**Planned:** Sonnet, M, wave 3

- **Goal:** the Mobile, AI features and 3D & motion plates are empty shells. Give visitors working examples of
  those capabilities, clearly labelled as lab demos, while keeping demo JavaScript out of the initial page load.
- **Depends on:** PRV-5.
- **Scope:**
  - **`fragments/habit-tracker/`:** a phone frame with four habits, toggled with `aria-pressed`, and "n of 4
    done" in a polite live region.
  - **`fragments/form-helper/`:**
    - the customer message, and "Draft a reply" or "Draft again", alternating two scripts. The Range boards
      draw the same text for both (`ai.a` and `ai.b`), so Script A is the board's `ai.a` reply, and Script B is
      "Thanks for flagging the late invoices. I'll check what held them up and follow up with an update today.";
    - the stream is visual and `aria-hidden`; a polite region announces the full reply once it ends;
    - no network request.
  - **`fragments/turntable/`:**
    - a six-face CSS cube, `aria-hidden`;
    - it turns (14 s per turn) only while its plate is shown;
    - Pause and Play (`aria-pressed`);
    - still under reduced motion;
    - the description "A six-sided CSS cube that turns while this plate is open." and the caption "Pause the
      cube to hold its position, then play to resume the turn." (the one intended exception to "the board
      wins", §6 Q17). The owner approves Script B and these two strings in the PR as a separate owner step; the
      approval is not an automated check.
  - **Every lab plate:** the dashed "Lab demo" tag. At 1440, "Built with" names the technology actually used (it
    replaces the board's "[PLACEHOLDER]" value), and the lab line reads "Nobody's hired us for one of these yet.
    We built this so you don't have to take our word for it." At 390, the lab line reads "A lab demo. Nobody's
    hired us for one of these yet, so we built one anyway." and the phone layout omits the "Built with" row, as
    drawn. Both widths omit Status facts, credit lines and "[PLACEHOLDER]" markers. The "Lab demo: habit tracker"
    style strings in the boards are code comments, not copy, and are not rendered.
  - **Loading:** the plate shell (name, tag, Built with, lab line, caption) is server-rendered. The demo is
    mounted by a client boundary (`LabDemoMount`) only once its plate is first selected, through `next/dynamic`
    inside that client component, and it stays mounted after. The turntable turns only while its plate is
    selected.
  - **Content:** the Mobile, AI features and 3D & motion plates, filled in place in PRV-5's shell.
  - **Integration and edit boundary:** the diff stays inside `content/range.ts`, the lab wiring in
    `components/range/`, the three demo fragment directories and their peeks, `e2e/lab.spec.ts`, and the three lab
    interior rows in `docs/boards/sections.json` (marked `built`) and `docs/boards/merged.json` (this ticket's
    id), plus the allowed entries in `docs/boards/deviations.md`. Fidelity uses the inherited PRV-22 suite. For the desktop "Built with" replacements and both Q17
    turntable strings, use owner-accepted entries in `docs/boards/deviations.md` that match the exact values and
    affected states; if a seeded entry needs updating, the edit is limited to these PRV-7 entries. The shared navigation, the non-lab plates, the public home, the rollout flag and the JS budget are
    untouched.
- **AC:**
  1. The tabs read Dashboards, Finance, Mobile, AI features, 3D & motion, Sites, Testing. The words read
     dashboards, finance apps, mobile apps, AI features, 3D scenes, websites, test suites. Dashboards is picked on
     load. T: `lab.spec.ts › all seven categories`.
  2. Each of the four habits toggles on and off, updates its `aria-pressed` state, and updates the polite live
     region to the correct "n of 4 done" count, including 0 and 4. T: `lab.spec.ts › habit tracker`.
  3. "Draft a reply" visibly streams Script A word by word. On completion the control reads "Draft again". The
     next two activations visibly stream Script B and then Script A word by word. Each completed visible reply
     equals the full expected script. The visual stream is `aria-hidden`, and the polite region updates once per completed
     draft with its full exact text. Repeat activation during a stream leaves the current draft running.
     Drafting makes zero network requests, and under reduced motion the full reply shows immediately. T:
     `lab.spec.ts › form helper`.
  4. The six-face cube is `aria-hidden` and turns once every 14 seconds while selected and playing. Activating
     Pause sets `aria-pressed="true"`, changes the label to "Play" and holds the cube at its current angle.
     Activating Play sets `aria-pressed="false"`, changes the label to "Pause" and resumes rotation from that
     angle. Rotation stops when the plate is deselected, a paused cube
     stays paused on reselection, and reduced motion keeps the cube still. T: `lab.spec.ts › turntable`.
  5. All three lab plates match the tag, fact visibility, exact lab copy and omissions specified in Scope at 1440
     and 390. T: `lab.spec.ts › lab plates are honest`.
  6. With the flag off, the initial HTML for `/preview/home` contains each lab plate's name, tag, lab line and
     caption, and, at 1440, its Built with fact. On a fresh production page load, the initial HTML contains no
     interactive demo root, and no interactive demo root mounts before its plate is first selected. Track every
     JavaScript chunk containing lab demo code, including shared chunks. Each such chunk is first requested on
     selection of a plate that uses it, and that plate's demo mounts after the request. Switching away and back keeps the mounted demo and its state without another request for that
     chunk. In Chromium, first-load JS on `/` is at most 1.03 × the `/` `current` value in `perf-baseline.json`,
     using the PRV-1 budget measurement. T: `lab.spec.ts › demos load on pick`.
  7. The turntable description and caption equal the two strings in Scope, and contain neither "three.js" nor
     "would be". T: `lab.spec.ts › turntable copy describes the cube`.
  8. The Mobile, AI features and 3D & motion interior rows are marked `built` and map to their drawn board
     references at 1440 and 390 in light and dark. T: `lab.spec.ts › lab fidelity rows`. The inherited
     `e2e/fidelity.spec.ts` run must report a passing result for all three rows in all four width and theme
     combinations.
  9. The diff against the PR base touches only the files in the integration and edit boundary above, and the
     public home and the non-lab parts of `/preview/home` keep their rendered content and navigation behaviour.
     Relative to the PR base, `docs/boards/sections.json` changes only the three PRV-7 lab interior rows,
     `docs/boards/merged.json` adds only `PRV-7`, and any change to `docs/boards/deviations.md` is limited to the
     exact entries allowed in Scope. T: `lab.spec.ts › changes stay within PRV-7 scope`.

## Known gaps

- Script B and the two Q17 turntable strings are approved by the owner in the PR, not by an automated check; the PR diff auditor should confirm the approval is recorded and the strings match the Scope text exactly.
