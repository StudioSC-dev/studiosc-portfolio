"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * The Range's one piece of client state: which category is picked, and the
 * way the last change went. Everything else is server HTML; these components
 * only set `hidden`, `aria-pressed`, the counter and the swap animations.
 * Nothing changes the selection but a visitor's input.
 */
type Way = "next" | "prev";

interface Selection {
  index: number;
  /** The way of the last change; null until the visitor first changes it. */
  moved: Way | null;
}

interface RangeState extends Selection {
  count: number;
  go: (target: number, way?: Way) => void;
}

const RangeContext = createContext<RangeState | null>(null);

function useRange(): RangeState {
  const state = useContext(RangeContext);
  if (!state) throw new Error("Range controls must sit inside RangeSwitch");
  return state;
}

/** The picked plate's index: what a lab demo watches to mount and to turn. */
export function useRangeIndex(): number {
  return useRange().index;
}

export function RangeSwitch({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection>({
    index: 0,
    moved: null,
  });
  const go = useCallback((target: number, way?: Way) => {
    setSelection((current) =>
      target === current.index
        ? current
        : {
            index: target,
            moved: way ?? (target > current.index ? "next" : "prev"),
          }
    );
  }, []);
  const value = useMemo(
    () => ({ ...selection, count, go }),
    [selection, count, go]
  );
  return (
    <RangeContext.Provider value={value}>{children}</RangeContext.Provider>
  );
}

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** An animation that plays only after the visitor has changed the selection. */
const after = (moved: Way | null, animation: string): CSSProperties =>
  moved ? { animation } : {};

/** The headline's accent word. */
export function RangeWord({ words }: { words: readonly string[] }) {
  const { index, moved } = useRange();
  return (
    <span
      key={index}
      data-range-word=""
      data-motion=""
      className="inline-block text-accent"
      style={after(moved, "word-in 280ms ease-out both")}
    >
      {words[index]}
    </span>
  );
}

/** A category tab (1440) or chip (390). Picking a chip scrolls it to the middle. */
export function RangeTab({
  index,
  className,
  children,
}: {
  index: number;
  className: string;
  children: ReactNode;
}) {
  const state = useRange();
  return (
    <button
      type="button"
      aria-pressed={state.index === index}
      className={className}
      onClick={(event) => {
        state.go(index);
        const chip = event.currentTarget;
        const row = chip.parentElement;
        requestAnimationFrame(() => {
          if (!row || row.scrollWidth <= row.clientWidth) return;
          row.scrollTo({
            left:
              chip.offsetLeft -
              row.offsetLeft -
              (row.clientWidth - chip.offsetWidth) / 2,
            behavior: still() ? "auto" : "smooth",
          });
        });
      }}
    >
      {children}
    </button>
  );
}

/** One plate. Every plate is server HTML; the unpicked ones are `hidden`. */
export function RangeSlide({
  index,
  label,
  section,
  className,
  children,
}: {
  index: number;
  label: string;
  /** The fidelity row this plate is, in docs/boards/sections.json. */
  section: string;
  className: string;
  children: ReactNode;
}) {
  const { index: picked, moved } = useRange();
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      data-board-section={section}
      hidden={picked !== index}
      data-motion=""
      className={className}
      style={after(
        moved,
        `${moved === "prev" ? "plate-from-left" : "plate-from-right"} 240ms ease-out both`
      )}
    >
      {children}
    </div>
  );
}

/** One category's drawing inside a desktop peek: the previous or next category. */
export function RangePeekItem({
  index,
  side,
  children,
}: {
  index: number;
  side: "prev" | "next";
  children: ReactNode;
}) {
  const { index: picked, moved, count } = useRange();
  const shown =
    side === "prev" ? (picked + count - 1) % count : (picked + 1) % count;
  return (
    <div
      hidden={shown !== index}
      data-motion=""
      style={after(moved, "plate-fade 240ms ease-out both")}
    >
      {children}
    </div>
  );
}

/** Previous plate or Next plate, wrapping at either end. */
export function RangeStep({
  way,
  label,
  className,
  style,
  children,
}: {
  way: Way;
  label: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const { index, count, go } = useRange();
  const target =
    way === "next" ? (index + 1) % count : (index + count - 1) % count;
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      style={style}
      onClick={() => go(target, way)}
    >
      {children}
    </button>
  );
}

/**
 * The "n of 7" counter, a polite live region. It also announces the category
 * and its word, in text only a screen reader reads.
 */
export function RangeCounter({
  tabs,
  words,
  className,
}: {
  tabs: readonly string[];
  words: readonly string[];
  className: string;
}) {
  const { index, count } = useRange();
  return (
    <p aria-live="polite" className={className}>
      <span className="sr-only">{tabs[index]}, </span>
      {index + 1} of {count}
      <span className="sr-only">: {words[index]}</span>
    </p>
  );
}

/** A phone scroll button: moves the chip row, never the selection. */
export function RangeScroll({
  way,
  controls,
  label,
  className,
  style,
  children,
}: {
  way: Way;
  controls: string;
  label: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls={controls}
      className={className}
      style={style}
      onClick={() => {
        document.getElementById(controls)?.scrollBy({
          left: way === "next" ? 160 : -160,
          behavior: still() ? "auto" : "smooth",
        });
      }}
    >
      {children}
    </button>
  );
}
