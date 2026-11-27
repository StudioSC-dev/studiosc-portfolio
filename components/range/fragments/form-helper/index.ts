import { labFragment } from "../lab";
import { Peek } from "./Peek";

/**
 * The form helper. The plate and its peek are server components; the
 * scripted draft is Demo.tsx, loaded when the plate is picked.
 */
export const CAPTION =
  "A lab demo with a scripted draft that streams in word by word. The real one would call a language model.";

export const formHelper = labFragment("form-helper", {
  Peek,
  caption: CAPTION,
  phoneCaption: CAPTION,
});
