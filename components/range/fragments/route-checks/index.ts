import type { Fragment } from "../types";
import { CAPTION, PHONE_CAPTION } from "./fixture";
import { Peek } from "./Peek";
import { DesktopTable, PhoneTable } from "./Table";

/**
 * The route checks table: a made-up run of this site's own suite. Server
 * components only; the ticks are CSS animation, replayed each time the plate
 * is shown.
 */
export const routeChecks: Fragment = {
  Desktop: DesktopTable,
  Phone: PhoneTable,
  Peek,
  caption: CAPTION,
  phoneCaption: PHONE_CAPTION,
  peekStatus: "Live, tested",
  phoneFacts: false,
};
