/**
 * Synthetic fragment fixtures, cut down from the fragments the Range boards
 * draw (range-light-desktop). Each root carries `data-fragment`, as every real
 * fragment under components/range/fragments/ will, and colours come only from
 * the `--frag-*` tokens. The copy is the board's; figures are made up.
 *
 * The spec injects these into a real page, so they are styled by the site's own
 * globals.css and fonts.
 */

export const FIXTURE_HOST_ID = "design-token-fixtures";

/** Tally & Trace ledger: IBM Plex Sans. */
const tallyandtrace = `
<div data-fragment="tallyandtrace" data-fixture="tallyandtrace" style="border: 1px solid var(--frag-tt-rule); border-radius: 6px; overflow: hidden; background: var(--frag-tt-pad); color: var(--frag-tt-ink); font-variant-numeric: tabular-nums;">
  <div style="background: var(--frag-tt-band); color: var(--frag-tt-on-band); padding: 0.875rem 1.25rem; display: flex; justify-content: space-between; gap: 1rem;">
    <span style="font-weight: 600;">Bills due, December</span>
    <span>Available to spend <strong style="font-weight: 600;"><span data-glyph="peso">₱</span>47,650.00</strong></span>
  </div>
  <div role="table" aria-label="Bills due in December, made-up figures" style="background: var(--frag-tt-sheet);">
    <div role="row" style="display: grid; grid-template-columns: 2fr 1fr 7rem; padding: 0 1.25rem; border-bottom: 1px solid var(--frag-tt-ink); color: var(--frag-tt-muted);">
      <span role="columnheader"><button type="button" style="appearance: none; background: none; border: 0; padding: 0.25rem 0; font: inherit; font-weight: 600; color: var(--frag-tt-ink);">Bill</button></span>
      <span role="columnheader">Paid from</span>
      <span role="columnheader"><button type="button" style="appearance: none; background: none; border: 0; padding: 0.25rem 0; font: inherit; color: var(--frag-tt-muted);">Amount</button></span>
    </div>
    <div role="row" style="display: grid; grid-template-columns: 2fr 1fr 7rem; padding: 0 1.25rem; border-bottom: 1px solid var(--frag-tt-rule);">
      <span role="cell" style="font-weight: 500;">Electricity</span>
      <span role="cell" style="color: var(--frag-tt-muted);">Household</span>
      <span role="cell" style="color: var(--frag-tt-red); font-weight: 600;">Overdue</span>
    </div>
  </div>
</div>`;

/** Central Command day feed: Manrope. */
const centralCommand = `
<div data-fragment="central-command" data-fixture="central-command" style="border: 1px solid var(--frag-cc-line); border-radius: 6px; background: var(--frag-cc-bg); color: var(--frag-cc-ink); padding: 1.25rem;">
  <div style="display: flex; justify-content: space-between; gap: 1rem;">
    <span style="font-weight: 700;">Today</span>
    <span style="color: var(--frag-cc-muted);">Thursday 3 December</span>
  </div>
  <ol style="list-style: none; margin: 0; padding: 0;">
    <li style="display: grid; grid-template-columns: 3.5rem 0.25rem 1fr; gap: 1rem; background: var(--frag-cc-panel); border-radius: 8px; padding: 0.75rem 1rem;">
      <span style="font-weight: 600;">06:40</span>
      <span style="border-radius: 2px; background: var(--frag-cc-sleep);"></span>
      <span><strong style="font-weight: 700;">Sleep</strong> 7 h 10 min, in bed by 23:20</span>
    </li>
    <li style="display: grid; grid-template-columns: 3.5rem 0.25rem 1fr; gap: 1rem; background: var(--frag-cc-panel); border-radius: 8px; padding: 0.75rem 1rem;">
      <span style="font-weight: 600;">07:00</span>
      <span style="border-radius: 2px; background: var(--frag-cc-weather);"></span>
      <span><button type="button" style="appearance: none; background: none; border: 0; padding: 0; font: inherit; color: inherit;"><strong style="font-weight: 700;">Weather</strong> 31° and humid, rain likely after 15:00</button></span>
    </li>
  </ol>
</div>`;

/** Pocket habit tracker: Manrope, in a phone frame. */
const habitTracker = `
<div data-fragment="habit-tracker" data-fixture="habit-tracker" style="display: flex; justify-content: center; padding: 1.75rem 0; background: var(--frag-habit-bg); border: 1px solid var(--frag-habit-line); border-radius: 6px;">
  <div style="width: 17rem; border-radius: 2.25rem; background: var(--frag-habit-device); padding: 0.625rem;">
    <div style="border-radius: 1.75rem; background: var(--frag-habit-screen); color: var(--frag-habit-ink); padding: 1rem 1.25rem 1.5rem;">
      <p style="margin: 0; color: var(--frag-habit-muted);">Thursday</p>
      <h3 style="margin: 0.125rem 0 0; font-weight: 800;">Today</h3>
      <p style="margin: 0.25rem 0 0; color: var(--frag-habit-muted);">1 of 4 done</p>
      <ul style="list-style: none; margin: 0.875rem 0 0; padding: 0;">
        <li style="border-bottom: 1px solid var(--frag-habit-rule);">
          <button type="button" aria-pressed="false" style="width: 100%; appearance: none; border: 0; background: transparent; padding: 0; min-height: 3rem; text-align: left; font: inherit; font-weight: 600; color: var(--frag-habit-ink);">Drink water</button>
        </li>
      </ul>
    </div>
  </div>
</div>`;

/** Form helper: IBM Plex Sans. */
const formHelper = `
<div data-fragment="form-helper" data-fixture="form-helper" style="background: var(--frag-form-bg); border: 1px solid var(--frag-form-line); border-radius: 6px; padding: 1.25rem; color: var(--frag-form-ink);">
  <p style="margin: 0; font-weight: 600; color: var(--frag-form-muted);">Customer message</p>
  <p style="margin: 0.375rem 0 0; background: var(--frag-form-field); border: 1px solid var(--frag-form-line); border-radius: 6px; padding: 0.75rem 1rem;">Our invoices keep going out late, and two clients have asked why.</p>
  <div style="margin-top: 1rem; display: flex; justify-content: space-between; gap: 1rem;">
    <p style="margin: 0; font-weight: 600; color: var(--frag-form-muted);">Reply draft</p>
    <button type="button" style="appearance: none; min-height: 2.5rem; padding: 0 0.875rem; border: 1px solid var(--frag-form-ink); border-radius: 6px; background: var(--frag-form-ink); color: var(--frag-form-on-ink); font: inherit; font-weight: 600;">Draft a reply</button>
  </div>
  <div style="margin-top: 0.5rem; background: var(--frag-form-field); border: 1px solid var(--frag-form-draft-line); border-radius: 6px; padding: 0.75rem 1rem;">
    <p style="margin: 0; color: var(--frag-form-muted);">The draft appears here as it is written.</p>
  </div>
</div>`;

/** Turntable scene: the stage is dark in both themes. */
const turntable = `
<div data-fragment="turntable" data-fixture="turntable">
  <div data-stage="turntable" style="position: relative; height: 12rem; background: var(--frag-turntable-stage); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
    <button type="button" style="position: absolute; right: 0.75rem; bottom: 0.75rem; appearance: none; min-height: 2.5rem; padding: 0 0.875rem; border: 1px solid var(--frag-turntable-control-line); border-radius: 6px; background: var(--frag-turntable-stage); color: var(--frag-turntable-control-ink); font: inherit; font-weight: 600;">Pause</button>
  </div>
</div>`;

/** The four fragments AC3 names, plus the turntable for the focus checks. */
export const FRAGMENT_FIXTURES = [
  tallyandtrace,
  centralCommand,
  habitTracker,
  formHelper,
  turntable,
].join("\n");

/**
 * Each fragment face and the CSS family it computes to. next/font/local names
 * a self-hosted face after its export, so IBM Plex Sans is `ibmPlexSans`.
 */
export const FRAGMENT_FAMILY = {
  "IBM Plex Sans": "ibmPlexSans",
  Manrope: "Manrope",
} as const;

/** Which family each fixture's text must compute to. */
export const FRAGMENT_FACES: Record<string, string> = {
  tallyandtrace: FRAGMENT_FAMILY["IBM Plex Sans"],
  "form-helper": FRAGMENT_FAMILY["IBM Plex Sans"],
  "central-command": FRAGMENT_FAMILY.Manrope,
  "habit-tracker": FRAGMENT_FAMILY.Manrope,
};

/**
 * Deliberately broken fragments the ring check must reject: a ring in the T&T
 * rule colour on white (about 1.3:1), a control whose outline is removed
 * although its outline colour would contrast, and controls drawn at opacity 0
 * (the control itself, or its parent), whose rings would otherwise pass.
 */
export const LOW_RING_FIXTURE = `
<div data-fragment="low-ring-fixture" data-fixture="low-ring" style="--focus: var(--frag-tt-rule); background: var(--frag-tt-sheet); padding: 1rem;">
  <button type="button" style="font: inherit;">Low-contrast ring</button>
</div>
<div data-fragment="low-ring-fixture" data-fixture="no-ring" style="background: var(--frag-tt-sheet); padding: 1rem;">
  <button type="button" style="font: inherit; outline-style: none;">No ring</button>
</div>
<div data-fragment="low-ring-fixture" data-fixture="faded-ring" style="background: var(--frag-tt-sheet); padding: 1rem;">
  <button type="button" style="font: inherit; opacity: 0;">Faded control</button>
</div>
<div data-fragment="low-ring-fixture" data-fixture="faded-parent" style="background: var(--frag-tt-sheet); padding: 1rem; opacity: 0;">
  <button type="button" style="font: inherit;">Faded parent</button>
</div>`;

/** Elements for the reduced-motion check, using board keyframes. */
export const MOTION_FIXTURES = `
<div data-motion="" data-fixture="motion" style="animation: rise 560ms cubic-bezier(0.2, 0.7, 0.2, 1) both;">Rises</div>
<div data-fade="" data-fixture="fade" style="opacity: 1; transition: opacity 200ms ease;">Fades</div>`;
