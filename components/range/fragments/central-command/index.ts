import type { Fragment } from "../types";
import { DesktopFeed, PhoneFeed } from "./Feed";
import { CAPTION, PHONE_CAPTION } from "./fixture";
import { Peek } from "./Peek";

/**
 * Central Command's day feed. Server components only: nothing in this folder
 * is a client module, so the feed ships as HTML and adds no JavaScript.
 */
export const centralCommand: Fragment = {
  Desktop: DesktopFeed,
  Phone: PhoneFeed,
  Peek,
  caption: CAPTION,
  phoneCaption: PHONE_CAPTION,
};
