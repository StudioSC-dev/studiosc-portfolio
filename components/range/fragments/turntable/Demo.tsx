"use client";

import { useState } from "react";
import type { LabDemoProps } from "../../LabDemoMount";

/** The cube's four side faces and its top and bottom, as the boards draw them. */
const FACES = [
  "rotateY(0deg)",
  "rotateY(90deg)",
  "rotateY(180deg)",
  "rotateY(-90deg)",
  "rotateX(90deg)",
  "rotateX(-90deg)",
] as const;

/**
 * The turntable scene (range-light-desktop, range-phone): a six-face CSS cube
 * that turns once every 14 seconds, only while its plate is open and playing.
 * Pause holds it at its angle; Play resumes from there. Under reduced motion
 * the stylesheet stops every [data-motion] animation, so it stays still.
 */
export default function Turntable({ variant, active }: LabDemoProps) {
  const [paused, setPaused] = useState(false);
  const phone = variant === "phone";
  const half = phone ? "3.5rem" : "4.5rem";
  return (
    <div
      data-fragment="turntable"
      data-stage="turntable"
      data-lab-demo="turntable"
      className={`relative flex items-center justify-center overflow-hidden rounded-fragment bg-[var(--frag-turntable-stage)] [perspective:900px] ${phone ? "h-64" : "h-[21rem]"}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 600 200"
        preserveAspectRatio="none"
        fill="none"
        className="absolute right-0 bottom-0 left-0 h-[40%] w-full"
      >
        <path
          d="M0 40H600M0 90H600M0 150H600M300 0V200M200 0L60 200M400 0L540 200M100 0L-180 200M500 0L780 200"
          stroke="var(--frag-turntable-grid)"
        />
      </svg>
      <div
        aria-hidden="true"
        data-motion=""
        data-cube=""
        className={`relative [transform-style:preserve-3d] ${phone ? "size-28" : "size-36"}`}
        style={{
          transform: "rotateX(-24deg) rotateY(36deg)",
          animation: active
            ? `turn 14s linear infinite ${paused ? "paused" : "running"}`
            : "none",
        }}
      >
        {FACES.map((face) => (
          <span
            key={face}
            className="absolute inset-0 box-border border-[1.5px] border-[var(--frag-turntable-edge)] bg-[rgba(127,162,255,0.10)]"
            style={{ transform: `${face} translateZ(${half})` }}
          />
        ))}
      </div>
      <button
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused((now) => !now)}
        className={`absolute bottom-3 min-h-10 appearance-none rounded-[6px] border border-[var(--frag-turntable-control-line)] bg-[var(--frag-turntable-stage)] px-[0.875rem] text-[0.875rem] leading-5 font-semibold text-[var(--frag-turntable-control-ink)] ${phone ? "left-1/2 -translate-x-1/2" : "right-3"}`}
      >
        {paused ? "Play" : "Pause"}
      </button>
    </div>
  );
}
