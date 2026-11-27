import { RANGE_CATEGORIES } from "@/content/range";
import { LabDemoMount, type LabDemoId } from "../LabDemoMount";
import type { Fragment } from "./types";

/**
 * A lab plate's fragment. Its figure holds only the client boundary; the
 * demo behind it is a separate chunk that loads when the plate is first
 * picked (components/range/LabDemoMount.tsx).
 */
export function labFragment(
  demo: LabDemoId,
  parts: Pick<Fragment, "Peek" | "caption" | "phoneCaption">
): Fragment {
  const index = RANGE_CATEGORIES.findIndex(
    (category) => category.plate.fragmentId === demo
  );
  return {
    ...parts,
    Desktop: () => <LabDemoMount demo={demo} index={index} variant="desktop" />,
    Phone: () => <LabDemoMount demo={demo} index={index} variant="phone" />,
  };
}
