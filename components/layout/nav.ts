import { GITHUB_ORG, LINKEDIN } from "@/lib/links";

export interface NavItem {
  href: string;
  label: string;
  /** Drawn as the filled call to action rather than a text link. */
  cta?: boolean;
}

/**
 * The primary navigation, in board order. The boards also draw Seth and
 * Christine between Work and Writing; PRV-10 adds them with their pages, so
 * no link here points at a page that does not exist yet.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/work", label: "Work" },
  { href: "/blog", label: "Writing" },
  { href: "/contact", label: "Start a project", cta: true },
];

/** The footer's links, in board order. */
export const FOOTER_NAV: readonly NavItem[] = [
  { href: "/work", label: "Work" },
  { href: "/blog", label: "Writing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: LINKEDIN.seth, label: "Seth on LinkedIn" },
  { href: LINKEDIN.christine, label: "Christine on LinkedIn" },
  { href: GITHUB_ORG, label: "StudioSC-dev on GitHub" },
];

/** The id of the phone menu's popover panel. */
export const PHONE_MENU_ID = "phone-menu";
