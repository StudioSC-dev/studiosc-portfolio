/** The turntable peek: a cube on a floor grid (range-light-desktop, the 3D & motion peek). */
export function Peek() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 100"
      fill="none"
      className="block h-auto w-full"
    >
      <rect x="0.5" y="0.5" width="159" height="99" rx="4" fill="#0F1113" />
      <path d="M0 78H160M0 90H160" stroke="#2A2E33" />
      <path
        d="M80 20L104 34L80 48L56 34Z"
        fill="rgba(127,162,255,0.18)"
        stroke="#7FA2FF"
        strokeWidth="1.2"
      />
      <path
        d="M56 34V62L80 76V48M104 34V62L80 76"
        stroke="#7FA2FF"
        strokeWidth="1.2"
      />
    </svg>
  );
}
