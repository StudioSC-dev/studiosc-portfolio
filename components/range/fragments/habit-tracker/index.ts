import { labFragment } from "../lab";
import { Peek } from "./Peek";

/**
 * The pocket habit tracker. The plate and its peek are server components;
 * the interactive phone frame is Demo.tsx, loaded when the plate is picked.
 */
export const CAPTION =
  "A lab demo in a phone frame. Tick a habit; the count and the list answer straight away.";

export const habitTracker = labFragment("habit-tracker", {
  Peek,
  caption: CAPTION,
  phoneCaption: CAPTION,
});
