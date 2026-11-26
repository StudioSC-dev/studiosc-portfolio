import type { ComponentType } from "react";

/** A plate's fragment: what its figure draws at each width, and its peek drawing. */
export interface Fragment {
  /** The figure's content at 1440. */
  Desktop: ComponentType;
  /** The figure's content at 390. */
  Phone: ComponentType;
  /** The small drawing the desktop peeks show. */
  Peek: ComponentType;
  /** The figure caption at 1440. */
  caption: string;
  /** The figure caption at 390. */
  phoneCaption: string;
  /** The peek's status line where it differs from the project's status. */
  peekStatus?: string;
  /** Whether the 390 plate lists the facts under the figure (default true). */
  phoneFacts?: boolean;
  /** The gap above the 390 caption, as a Tailwind class (default mt-2.5). */
  phoneCaptionGap?: string;
}
