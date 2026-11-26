/**
 * The Tally & Trace peek: the ledger drawn small (range-light-desktop, the
 * Finance peek). The red bar is the one overdue row.
 */
export function Peek() {
  const rows: {
    y: number;
    name: number;
    due: number;
    dueX: number;
    amt: number;
    amtX: number;
    red?: boolean;
  }[] = [
    { y: 24, name: 34, due: 22, dueX: 84, amt: 20, amtX: 130, red: true },
    { y: 39, name: 46, due: 16, dueX: 84, amt: 24, amtX: 126 },
    { y: 54, name: 40, due: 16, dueX: 84, amt: 24, amtX: 126 },
    { y: 69, name: 58, due: 18, dueX: 84, amt: 30, amtX: 120 },
    { y: 84, name: 38, due: 18, dueX: 84, amt: 26, amtX: 124 },
  ];
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
        fill="#FFFFFF"
        stroke="#DCE3DE"
      />
      <path
        d="M4.5 0.5H155.5A4 4 0 0 1 159.5 4.5V17H0.5V4.5A4 4 0 0 1 4.5 0.5Z"
        fill="#1F4D3A"
      />
      <rect x="10" y="7" width="52" height="4" rx="1" fill="#FFFFFF" />
      <rect x="118" y="7" width="32" height="4" rx="1" fill="#FFFFFF" />
      {rows.map((r, i) => (
        <g key={r.y}>
          <rect
            x="10"
            y={r.y}
            width={r.name}
            height="4"
            rx="1"
            fill="#1C2420"
          />
          <rect
            x={r.dueX}
            y={r.y}
            width={r.due}
            height="4"
            rx="1"
            fill={r.red ? "#B3261E" : "#58615B"}
          />
          <rect
            x={r.amtX}
            y={r.y}
            width={r.amt}
            height="4"
            rx="1"
            fill="#1C2420"
          />
          {i < rows.length - 1 && (
            <path d={`M0.5 ${r.y + 9.5}H159.5`} stroke="#DCE3DE" />
          )}
        </g>
      ))}
    </svg>
  );
}
