import type { Metadata } from "next";
import { TwoOfUs } from "@/components/people/TwoOfUs";
import { OPENER_DOTS, PHONE_DOTS } from "@/components/range/dots";

export const metadata: Metadata = {
  title: "About",
  description:
    "Meet the team behind StudioSC. Learn about Seth's full-stack engineering expertise and Christine's QA automation and testing experience.",
};

/** The dot field, at rest at its theme's --dots-opacity: the About boards draw no load fade. */
const DOTS_STYLE = { opacity: "var(--dots-opacity)" } as const;

function Dots({
  d,
  width,
  height,
  className,
}: {
  d: string;
  width: number;
  height: number;
  className: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={`pointer-events-none absolute top-0 right-0 ${className}`}
      style={DOTS_STYLE}
    >
      <path
        d={d}
        style={{ stroke: "var(--accent)" }}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const BELIEFS = [
  {
    title: "High-Integrity Engineering",
    text: "Building software the right way, not just the fast way",
  },
  {
    title: "Quality Assurance",
    text: "Ensuring our code works in production, not just in development",
  },
  {
    title: "Continuous Learning",
    text: "Staying current with the latest technologies and best practices",
  },
];

const LINK =
  "text-ink underline decoration-1 underline-offset-[0.2em] hover:text-muted";

/**
 * About, as pages-about-desktop and pages-about-phone draw it: the opening
 * heading and intro, the shared "The two of us", "What we believe", and the
 * contact call, which only the desktop board draws.
 */
export default function AboutPage() {
  return (
    <>
      <section
        aria-labelledby="about-title"
        data-board-section="about/title"
        className="relative px-4 pt-6 text-center md:p-0 md:text-left"
      >
        <Dots
          d={OPENER_DOTS}
          width={220}
          height={620}
          className="hidden md:block"
        />
        <Dots d={PHONE_DOTS} width={120} height={200} className="md:hidden" />
        <div
          data-page-header
          className="relative md:mx-auto md:box-content md:max-w-page md:px-10 md:pt-12"
        >
          <h1
            id="about-title"
            className="text-display-phone font-semibold md:max-w-[60rem] md:text-display"
          >
            Seth builds. Christine tests.
          </h1>
          <p className="mt-3 text-[1.0625rem] leading-[1.625rem] md:mt-5 md:max-w-[44rem] md:text-[1.25rem] md:leading-[1.875rem]">
            At StudioSC, we combine senior-level development with expert QA to
            deliver software that scales and survives the real world.
          </p>
        </div>
      </section>

      <TwoOfUs boardSection="about/people" />

      <section
        aria-labelledby="believe-title"
        data-board-section="about/believe"
        className="px-4 pt-12 md:mx-auto md:box-content md:max-w-page md:px-10 md:pt-20"
      >
        <h2
          id="believe-title"
          className="text-center text-section-phone font-semibold md:text-left md:text-section"
        >
          What we believe
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-12">
          {BELIEFS.map((belief) => (
            <div key={belief.title} className="border-t-2 border-ink pt-4">
              <h3 className="text-title font-semibold">{belief.title}</h3>
              <p className="mt-1.5 text-muted">{belief.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="contact-title"
        data-board-section="about/contact"
        className="hidden md:mx-auto md:box-content md:block md:max-w-page md:px-10 md:py-24"
      >
        <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-end gap-16">
          <h2
            id="contact-title"
            className="text-[3rem] leading-[3.25rem] font-semibold tracking-[-0.025em]"
          >
            Got something you want built? Or broken?
          </h2>
          <div>
            <p>
              {
                "Tell us about the idea, even if it's half of one. If you're hiring for a role, email "
              }
              <a href="/seth" className={LINK}>
                Seth
              </a>
              {" or "}
              <a href="/christine" className={LINK}>
                Christine
              </a>
              {" directly."}
            </p>
            <a
              href="/contact"
              className="mt-5 inline-flex min-h-12 items-center rounded-control bg-ink px-[1.375rem] text-small font-semibold text-gallery no-underline"
            >
              Start a project
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
