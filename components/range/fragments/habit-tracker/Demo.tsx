"use client";

import { useState } from "react";
import type { LabDemoProps } from "../../LabDemoMount";

const HABITS = [
  "Drink water",
  "Walk 20 minutes",
  "Read 10 pages",
  "Sleep by 23:00",
] as const;

/** The board's resting state: the first two habits are done. */
const START = [true, true, false, false];

/** The pocket habit tracker (range-light-desktop, range-phone): four habits in a phone frame. */
export default function HabitTracker({ variant }: LabDemoProps) {
  const [done, setDone] = useState(START);
  const count = done.filter(Boolean).length;
  const phone = variant === "phone";
  return (
    <div
      data-fragment="habit-tracker"
      data-lab-demo="habit-tracker"
      className={`flex justify-center border border-[var(--frag-habit-line)] bg-[var(--frag-habit-bg)] rounded-fragment ${phone ? "py-5" : "py-7"}`}
    >
      <div
        className={`box-content rounded-[2.25rem] bg-[var(--frag-habit-device)] p-[0.625rem] shadow-[0_18px_36px_-18px_rgba(17,19,21,0.55)] ${phone ? "w-[15.5rem]" : "w-[17rem]"}`}
      >
        <div className="overflow-hidden rounded-[1.75rem] bg-[var(--frag-habit-screen)] text-left text-[var(--frag-habit-ink)]">
          <div className="flex items-center justify-between px-[1.375rem] pt-[0.625rem] text-[0.75rem] leading-4 font-bold">
            <span>9:41</span>
            <svg
              aria-hidden="true"
              width="22"
              height="10"
              viewBox="0 0 22 10"
              fill="none"
            >
              <rect
                x="0.5"
                y="0.5"
                width="18"
                height="9"
                rx="2"
                stroke="#17201C"
              />
              <rect x="2" y="2" width="12" height="6" rx="1" fill="#17201C" />
              <rect
                x="19.5"
                y="3"
                width="1.5"
                height="4"
                rx="0.5"
                fill="#17201C"
              />
            </svg>
          </div>
          <div className="px-5 pt-4 pb-6">
            <p className="text-[0.8125rem] leading-5 text-[var(--frag-habit-muted)]">
              Thursday
            </p>
            <p className="mt-0.5 text-[1.5rem] leading-[1.875rem] font-extrabold">
              Today
            </p>
            <p
              role="status"
              className="mt-1 text-[0.8125rem] leading-5 text-[var(--frag-habit-muted)]"
            >
              {count} of {HABITS.length} done
            </p>
            <ul className="mt-[0.875rem] list-none p-0">
              {HABITS.map((name, i) => (
                <li
                  key={name}
                  className="border-b border-[var(--frag-habit-rule)]"
                >
                  <button
                    type="button"
                    aria-pressed={done[i]}
                    onClick={() =>
                      setDone((now) => now.map((on, j) => (j === i ? !on : on)))
                    }
                    className="flex min-h-12 w-full appearance-none items-center gap-3 border-0 bg-transparent p-0 text-left text-[var(--frag-habit-ink)]"
                  >
                    <span
                      className="box-border inline-flex size-[1.375rem] flex-none items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: done[i]
                          ? "var(--frag-habit-done)"
                          : "var(--frag-habit-ring)",
                        background: done[i]
                          ? "var(--frag-habit-done)"
                          : "transparent",
                      }}
                    >
                      {done[i] && (
                        <svg
                          aria-hidden="true"
                          data-motion=""
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          style={{ animation: "tick-in 200ms ease-out both" }}
                        >
                          <path
                            d="M2.5 6.2L5 8.5L9.5 3.5"
                            stroke="#FFFFFF"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`text-[0.9375rem] leading-[1.375rem] font-semibold ${done[i] ? "text-[var(--frag-habit-muted)] line-through" : ""}`}
                    >
                      {name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
