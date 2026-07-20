/**
 * Outbound profile links, in one place.
 *
 * These were previously hardcoded per component, which is how the contact page
 * and footer ended up pointing at linkedin.com's homepage instead of anyone's
 * profile. Import from here rather than pasting a URL.
 */

export const LINKEDIN = {
  seth: "https://www.linkedin.com/in/sethcharlespalileo/",
  christine:
    "https://www.linkedin.com/in/christine-dianne-nacar-palileo-86249a64/",
} as const;

/**
 * TODO: still a placeholder — this points at Instagram's homepage, not the
 * studio's profile. Replace with the real handle URL.
 */
export const INSTAGRAM = "https://instagram.com";
