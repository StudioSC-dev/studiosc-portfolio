import type { Fragment } from "../types";
import { Peek } from "./Peek";
import { SiteDrawing } from "./Site";

const CAPTION =
  "This site, drawn small. The working fragment for this one is the page you are on.";

/** The portfolio site drawn small. Server components only. */
export const portfolioSite: Fragment = {
  Desktop: SiteDrawing,
  Phone: SiteDrawing,
  Peek,
  caption: CAPTION,
  phoneCaption: CAPTION,
  phoneFacts: false,
  phoneCaptionGap: "mt-3",
};
