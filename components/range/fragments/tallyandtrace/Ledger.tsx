"use client";

import { useState } from "react";
import {
  BILLS,
  money,
  TABLE_LABEL,
  TOTAL,
  TOTAL_LABEL,
  type Bill,
} from "./fixture";

type Key = "name" | "due" | "amount";
type Dir = 1 | -1;

function useSort() {
  const [sort, setSort] = useState<{ key: Key; dir: Dir }>({
    key: "due",
    dir: 1,
  });
  const rows = BILLS.slice().sort((a, b) => {
    if (sort.key === "name") return a.name.localeCompare(b.name) * sort.dir;
    const x = sort.key === "due" ? a.due : a.centavos;
    const y = sort.key === "due" ? b.due : b.centavos;
    return (x - y) * sort.dir;
  });
  const pick = (key: Key) =>
    setSort((s) => ({ key, dir: s.key === key ? (-s.dir as Dir) : 1 }));
  return { sort, rows, pick };
}

function Arrow({ dir }: { dir: Dir }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d={dir === 1 ? "M3 7.5L6 4.5L9 7.5" : "M3 4.5L6 7.5L9 4.5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Head({
  label,
  k,
  sort,
  pick,
  pad,
  className,
}: {
  label: string;
  k: Key;
  sort: { key: Key; dir: Dir };
  pick: (key: Key) => void;
  pad: string;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <span
      role="columnheader"
      aria-sort={
        active ? (sort.dir === 1 ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <button
        type="button"
        onClick={() => pick(k)}
        className={`inline-flex appearance-none items-center gap-1 border-0 bg-transparent font-[inherit] ${pad} ${active ? "font-semibold text-[var(--frag-tt-ink)]" : "font-normal text-[var(--frag-tt-muted)]"}`}
      >
        {label}
        {active && <Arrow dir={sort.dir} />}
      </button>
    </span>
  );
}

const RED = "font-semibold text-[var(--frag-tt-red)]";

/** The ledger at 1440 (range-light-desktop). */
export function DesktopLedger() {
  const { sort, rows, pick } = useSort();
  const grid =
    "grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_7rem_7.5rem] items-center px-5";
  return (
    <div
      role="table"
      aria-label={TABLE_LABEL}
      className="bg-[var(--frag-tt-sheet)] text-[0.9375rem] leading-[1.375rem]"
    >
      <div
        role="row"
        className={`${grid} box-content min-h-11 border-b border-[var(--frag-tt-ink)] text-[0.8125rem] leading-5 text-[var(--frag-tt-muted)]`}
      >
        <Head label="Bill" k="name" sort={sort} pick={pick} pad="py-1" />
        <span role="columnheader">Paid from</span>
        <Head label="Due" k="due" sort={sort} pick={pick} pad="py-1" />
        <Head
          label="Amount"
          k="amount"
          sort={sort}
          pick={pick}
          pad="py-1"
          className="text-right"
        />
      </div>
      {rows.map((b: Bill) => (
        <div
          key={b.name}
          role="row"
          className={`${grid} box-content min-h-14 border-b border-[var(--frag-tt-rule)]`}
        >
          <span role="cell" className="font-medium">
            {b.name}
          </span>
          <span role="cell" className="text-[var(--frag-tt-muted)]">
            {b.from}
          </span>
          <span
            role="cell"
            className={`whitespace-nowrap ${b.overdue ? RED : ""}`}
          >
            {b.overdue ? `${b.dueDate}, overdue` : b.dueDate}
          </span>
          <span role="cell" className="text-right">
            {money(b.centavos)}
          </span>
        </div>
      ))}
      <div
        role="row"
        className="grid min-h-14 grid-cols-[minmax(0,1fr)_7.5rem] items-center px-5 font-semibold"
      >
        <span role="cell">{TOTAL_LABEL}</span>
        <span role="cell" className="text-right">
          {TOTAL}
        </span>
      </div>
    </div>
  );
}

/** The ledger at 390 (range-phone). */
export function PhoneLedger() {
  const { sort, rows, pick } = useSort();
  const grid =
    "grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-center gap-2 px-3.5";
  return (
    <div
      role="table"
      aria-label={TABLE_LABEL}
      className="text-[0.875rem] leading-5"
    >
      <div
        role="row"
        className={`${grid} box-content min-h-11 border-b border-[var(--frag-tt-ink)] text-[0.8125rem] text-[var(--frag-tt-muted)]`}
      >
        <Head label="Bill" k="name" sort={sort} pick={pick} pad="py-2" />
        <Head label="Due" k="due" sort={sort} pick={pick} pad="py-2" />
        <Head
          label="Amount"
          k="amount"
          sort={sort}
          pick={pick}
          pad="py-2"
          className="text-right"
        />
      </div>
      {rows.map((b: Bill) => (
        <div
          key={b.phoneName}
          role="row"
          className={`${grid} box-border min-h-16 border-b border-[var(--frag-tt-rule)] py-2`}
        >
          <span role="cell">
            <span className="block font-medium">{b.phoneName}</span>
            <span className="block text-[0.8125rem] text-[var(--frag-tt-muted)]">
              {b.from}
            </span>
          </span>
          <span role="cell" className={b.overdue ? RED : undefined}>
            <span className="block">{b.dueDate}</span>
            {b.overdue && (
              <span className="block text-[0.8125rem]">Overdue</span>
            )}
          </span>
          <span role="cell" className="text-right">
            {money(b.centavos)}
          </span>
        </div>
      ))}
      <div
        role="row"
        className="grid min-h-[3.25rem] grid-cols-[minmax(0,1fr)_6rem] items-center px-3.5 font-semibold"
      >
        <span role="cell">{TOTAL_LABEL}</span>
        <span role="cell" className="text-right">
          {TOTAL}
        </span>
      </div>
    </div>
  );
}
