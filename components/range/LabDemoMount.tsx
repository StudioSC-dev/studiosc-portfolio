"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { useRangeIndex } from "./RangeSwitch";

/**
 * The client boundary of a lab plate. The plate's shell is server HTML; the
 * demo is fetched and mounted only once its plate is first picked, and stays
 * mounted after, so its state survives a switch away and back. Each demo is
 * its own dynamic import, so its chunk is requested on that first pick and not
 * before.
 *
 * The import is awaited here rather than through next/dynamic: next/dynamic
 * suspends, and React holds a freshly revealed Suspense boundary back for
 * 300ms, so the demo would appear about a third of a second after the pick
 * even though its chunk arrived in a few milliseconds.
 */
export type LabDemoId = "habit-tracker" | "form-helper" | "turntable";
export type LabVariant = "desktop" | "phone";

/** What every demo receives. */
export interface LabDemoProps {
  variant: LabVariant;
  /** True while this demo's plate is the picked one. */
  active: boolean;
}

type Loaded = { default: ComponentType<LabDemoProps> };

const DEMOS: Record<LabDemoId, () => Promise<Loaded>> = {
  "habit-tracker": () => import("./fragments/habit-tracker/Demo"),
  "form-helper": () => import("./fragments/form-helper/Demo"),
  turntable: () => import("./fragments/turntable/Demo"),
};

/** Tailwind's md breakpoint: where a plate switches from its 390 to its 1440 layout. */
const WIDE = "(min-width: 768px)";

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** True at 1440's layout. The server and hydration see false, so nothing mismatches. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false
  );
}

export function LabDemoMount({
  demo,
  index,
  variant,
}: {
  demo: LabDemoId;
  /** The plate's position in the Range. */
  index: number;
  /** The layout this mount sits in; only the displayed layout mounts a demo. */
  variant: LabVariant;
}) {
  const picked = useRangeIndex();
  const wide = useWide();
  const [seen, setSeen] = useState(false);
  const [Demo, setDemo] = useState<ComponentType<LabDemoProps> | null>(null);
  const active = picked === index;
  if (active && !seen) setSeen(true);
  const shown = seen && wide === (variant === "desktop");

  useEffect(() => {
    if (!shown || Demo) return;
    let live = true;
    void DEMOS[demo]().then((loaded) => {
      if (live) setDemo(() => loaded.default);
    });
    return () => {
      live = false;
    };
  }, [shown, Demo, demo]);

  if (!shown || !Demo) return null;
  return <Demo variant={variant} active={active} />;
}
