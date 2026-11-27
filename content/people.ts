import { LINKEDIN } from "@/lib/links";

/**
 * The two of us, as the boards word it (range-light-desktop "The two of us";
 * the same panels on pages-about-desktop and range-phone). The home section
 * and /about both render these panels through components/people/TwoOfUs.
 */

export interface PersonWork {
  label: string;
  href: string;
  note: string;
}

export interface Person {
  /** The panel's id, the credit lines' `#seth` and `#christine`. */
  id: "seth" | "christine";
  name: string;
  /** The first name, as the email button and the credit lines use it. */
  firstName: string;
  role: string;
  fact: string;
  pitch: string;
  openTo: string;
  /** "What I did here", in board order. */
  work: PersonWork[];
  email: string;
  linkedIn: string;
  gitHub: string;
  /** `src` is a key of scripts/photos/manifest.json. */
  photo: { src: string; alt: string };
  /**
   * The CV. Its link shows only when `ready` is true, and then the build
   * requires `public<path>` to exist (scripts/check-cv.ts). The CVs without a
   * street address are the owner's to supply (PRV-19).
   */
  cv: { path: string; ready: boolean };
}

export const PEOPLE: Person[] = [
  {
    id: "seth",
    name: "Seth Palileo",
    firstName: "Seth",
    role: "Lead Software Engineer",
    fact: "10+ years shipping production systems",
    pitch:
      "I build the apps on this page, from the database to the screen you tap. Then I hand them to Christine, which is where they get good.",
    openTo: "Full-time · Contract · Remote or relocation",
    work: [
      {
        label: "Tally & Trace",
        href: "/work/tallyandtrace",
        note: "Built it with React, FastAPI and PostgreSQL.",
      },
      {
        label: "Central Command",
        href: "/work/central-command",
        note: "Built it with Cloudflare Workers, Hono and React.",
      },
      {
        label: "This site",
        href: "/work/portfolio-site",
        note: "Built it with Next.js and Tailwind.",
      },
    ],
    email: "seth@studiosc.dev",
    linkedIn: LINKEDIN.seth,
    gitHub: "https://github.com/smpalileo",
    photo: { src: "/img/seth", alt: "Seth Palileo" },
    cv: { path: "/cv/seth.pdf", ready: false },
  },
  {
    id: "christine",
    name: "Christine Nacar-Palileo",
    firstName: "Christine",
    role: "Senior QA Engineer",
    fact: "11+ years building test automation",
    pitch:
      "I test what Seth builds, and I write the checks that keep it working. If something on your site can break, I would rather find it than your users.",
    openTo: "Full-time · Contract · Remote or relocation",
    work: [
      {
        label: "Tally & Trace",
        href: "/work/tallyandtrace",
        note: "Testing it now, including the check that amounts keep one right edge on desktop and phone.",
      },
      {
        label: "Central Command",
        href: "/work/central-command",
        note: "Testing it now, before it goes live.",
      },
      {
        label: "This site",
        href: "/work/portfolio-site",
        note: "Keeps its Playwright suite green.",
      },
    ],
    email: "christine@studiosc.dev",
    linkedIn: LINKEDIN.christine,
    gitHub: "https://github.com/cdtncr",
    photo: { src: "/img/christine", alt: "Christine Nacar-Palileo" },
    cv: { path: "/cv/christine.pdf", ready: false },
  },
];
