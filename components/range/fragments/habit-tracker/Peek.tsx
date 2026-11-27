/** The habit tracker peek: a phone with four habits (range-light-desktop, the Mobile peek). */
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
        fill="#EEF3F1"
        stroke="#D5E2DD"
      />
      <rect x="60" y="6" width="40" height="88" rx="8" fill="#111315" />
      <rect x="63" y="10" width="34" height="80" rx="6" fill="#FFFFFF" />
      <rect x="68" y="18" width="16" height="4" rx="1" fill="#17201C" />
      <circle cx="70" cy="34" r="3" fill="#0E7C66" />
      <rect x="76" y="32.5" width="16" height="3" rx="1" fill="#17201C" />
      <circle cx="70" cy="46" r="3" fill="#0E7C66" />
      <rect x="76" y="44.5" width="18" height="3" rx="1" fill="#17201C" />
      <circle cx="70" cy="58" r="3" stroke="#6B7A74" />
      <rect x="76" y="56.5" width="13" height="3" rx="1" fill="#17201C" />
      <circle cx="70" cy="70" r="3" stroke="#6B7A74" />
      <rect x="76" y="68.5" width="17" height="3" rx="1" fill="#17201C" />
    </svg>
  );
}
