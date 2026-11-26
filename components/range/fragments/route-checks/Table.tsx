import {
  FIRST_DELAY_MS,
  PHONE_ROUTES,
  ROUTES,
  STEP_MS,
  TABLE_LABEL,
} from "./fixture";

function Tick({ n }: { n: number }) {
  return (
    <svg
      aria-hidden="true"
      data-tick=""
      data-motion=""
      style={{
        animation: `tick-in 220ms ease-out ${FIRST_DELAY_MS + STEP_MS * n}ms both`,
      }}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
    >
      <circle cx="9" cy="9" r="8" fill="var(--frag-site-ink)" />
      <path
        d="M5.5 9.2L7.9 11.5L12.5 6.6"
        stroke="var(--frag-site-plate)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SHEET =
  "overflow-hidden border border-[var(--frag-site-rule)] bg-[var(--frag-site-plate)] text-left text-[var(--frag-site-ink)]";

/** The table at 1440: six routes, twelve ticks landing 70 ms apart. */
export function DesktopTable() {
  const grid =
    "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7.5rem_7.5rem] items-center px-5";
  const pass = "inline-flex items-center gap-2";
  return (
    <div
      data-fragment="route-checks"
      role="table"
      aria-label={TABLE_LABEL}
      className={`${SHEET} rounded-fragment text-[0.9375rem] leading-[1.375rem]`}
    >
      <div
        role="row"
        className={`${grid} box-content min-h-11 border-b border-[var(--frag-site-ink)] text-[0.8125rem] leading-5 text-[var(--frag-site-muted)]`}
      >
        <span role="columnheader">Route</span>
        <span role="columnheader">Page</span>
        <span role="columnheader">Desktop, 1440</span>
        <span role="columnheader">Phone, 390</span>
      </div>
      {ROUTES.map((r, i) => (
        <div
          key={r.path}
          role="row"
          className={`${grid} box-content min-h-[3.25rem] ${i < ROUTES.length - 1 ? "border-b border-[var(--frag-site-rule)]" : ""}`}
        >
          <span role="cell" className="font-semibold">
            {r.path}
          </span>
          <span role="cell" className="text-[var(--frag-site-muted)]">
            {r.page}
          </span>
          <span role="cell" className={pass}>
            <Tick n={i * 2} />
            Pass
          </span>
          <span role="cell" className={pass}>
            <Tick n={i * 2 + 1} />
            Pass
          </span>
        </div>
      ))}
    </div>
  );
}

/** The table at 390: four routes, static Pass text. */
export function PhoneTable() {
  const grid =
    "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center px-3.5";
  return (
    <div
      data-fragment="route-checks"
      role="table"
      aria-label={TABLE_LABEL}
      className={`${SHEET} rounded-fragment text-[0.875rem] leading-5`}
    >
      <div
        role="row"
        className={`${grid} box-content min-h-10 border-b border-[var(--frag-site-ink)] text-[0.8125rem] text-[var(--frag-site-muted)]`}
      >
        <span role="columnheader">Route</span>
        <span role="columnheader">Desktop</span>
        <span role="columnheader">Phone</span>
      </div>
      {PHONE_ROUTES.map((r, i) => (
        <div
          key={r.path}
          role="row"
          className={`${grid} box-content min-h-12 ${i < PHONE_ROUTES.length - 1 ? "border-b border-[var(--frag-site-rule)]" : ""}`}
        >
          <span role="cell" className="font-semibold">
            {r.path}
          </span>
          <span role="cell">Pass</span>
          <span role="cell">Pass</span>
        </div>
      ))}
    </div>
  );
}
