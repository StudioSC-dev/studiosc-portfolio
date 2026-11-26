import type { Fragment } from "../types";
import { CAPTION, PHONE_CAPTION } from "./fixture";
import { DesktopPad, PhonePad } from "./Pad";
import { Peek } from "./Peek";

/**
 * The Tally & Trace ledger. Only Ledger.tsx is a client module: it holds the
 * sort order and nothing else; the rest is server HTML.
 */
export const tallyandtrace: Fragment = {
  Desktop: DesktopPad,
  Phone: PhonePad,
  Peek,
  caption: CAPTION,
  phoneCaption: PHONE_CAPTION,
};
