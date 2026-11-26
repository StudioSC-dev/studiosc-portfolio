import { DesktopLedger, PhoneLedger } from "./Ledger";
import { AVAILABLE, LEDGER_TITLE } from "./fixture";

/** The ledger at 1440: the band and the sortable table (range-light-desktop). */
export function DesktopPad() {
  return (
    <div
      data-fragment="tallyandtrace"
      className="overflow-hidden rounded-fragment border border-[var(--frag-tt-rule)] bg-[var(--frag-tt-pad)] text-[var(--frag-tt-ink)] tabular-nums"
    >
      <div className="flex items-baseline justify-between gap-4 bg-[var(--frag-tt-band)] px-5 py-3.5 text-[var(--frag-tt-on-band)]">
        <span className="text-base leading-6 font-semibold">
          {LEDGER_TITLE}
        </span>
        <span className="text-[0.875rem] leading-5">
          {"Available to spend "}
          <strong className="text-base font-semibold">{AVAILABLE}</strong>
        </span>
      </div>
      <DesktopLedger />
    </div>
  );
}

/** The ledger at 390 (range-phone). */
export function PhonePad() {
  return (
    <div
      data-fragment="tallyandtrace"
      className="overflow-hidden rounded-fragment border border-[var(--frag-tt-rule)] bg-[var(--frag-tt-sheet)] text-left text-[var(--frag-tt-ink)] tabular-nums"
    >
      <div className="bg-[var(--frag-tt-band)] px-3.5 py-3 text-[var(--frag-tt-on-band)]">
        <p className="text-[0.9375rem] leading-[1.375rem] font-semibold">
          {LEDGER_TITLE}
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-5">
          {"Available to spend "}
          <strong className="text-[0.9375rem] font-semibold">
            {AVAILABLE}
          </strong>
        </p>
      </div>
      <PhoneLedger />
    </div>
  );
}
