import { FEED, sourceColour } from "./fixture";

/** The bar lengths the peek draws for its first four entries (range-light-desktop). */
const BARS = [92, 100, 76, 88];

/**
 * The Central Command peek: the day feed drawn small, from the fixture's
 * first four sources (range-light-desktop, the Dashboards peek).
 */
export function Peek() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 100"
      fill="none"
      className="block h-auto w-full"
    >
      <rect
        x="0.5"
        y="0.5"
        width="159"
        height="99"
        rx="4"
        fill="#EEF1F6"
        stroke="#D9DFEA"
      />
      <rect x="10" y="8" width="28" height="6" rx="1" fill="#1A2233" />
      <rect x="112" y="9" width="38" height="4" rx="1" fill="#4F5A70" />
      {FEED.slice(0, BARS.length).map((entry, i) => {
        const y = 20 + i * 19;
        return (
          <g key={entry.time}>
            <rect x="8" y={y} width="144" height="16" rx="3" fill="#FFFFFF" />
            <rect
              x="14"
              y={y + 6}
              width="14"
              height="4"
              rx="1"
              fill="#1A2233"
            />
            <rect
              x="34"
              y={y + 3}
              width="3"
              height="10"
              rx="1"
              style={{ fill: sourceColour(entry.source) }}
            />
            <rect
              x="43"
              y={y + 6}
              width={BARS[i]}
              height="4"
              rx="1"
              fill="#9AA3B5"
            />
          </g>
        );
      })}
    </svg>
  );
}
