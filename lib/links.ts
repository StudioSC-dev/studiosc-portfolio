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

/** The studio's GitHub organisation. */
export const GITHUB_ORG = "https://github.com/StudioSC-dev";
