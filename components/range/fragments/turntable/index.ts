import { labFragment } from "../lab";
import { Peek } from "./Peek";

/**
 * The turntable scene: a CSS cube that turns while its plate is open. The
 * plate and its peek are server components; the cube and its Pause button are
 * Demo.tsx, loaded when the plate is picked.
 *
 * The caption is the owner's wording (PRV-7 scope, Q17), the one intended
 * exception to "the board wins" (docs/boards/deviations.md, D1).
 */
export const CAPTION =
  "Pause the cube to hold its position, then play to resume the turn.";

export const turntable = labFragment("turntable", {
  Peek,
  caption: CAPTION,
  phoneCaption: CAPTION,
});
