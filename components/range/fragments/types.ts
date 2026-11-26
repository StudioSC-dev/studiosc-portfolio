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
}
