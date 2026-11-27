import Image from "next/image";
import { PEOPLE, type Person } from "@/content/people";

/**
 * "The two of us": one frame on --plate with a 1px ink border, split by an
 * ink rule into the two person panels, stacked on a phone, and the "Or hire
 * us both" line under it (range-light-desktop, range-phone; the same section
 * on pages-about-desktop and pages-about-phone). It holds no group photo.
 */

const LINK =
  "text-ink underline decoration-1 underline-offset-[0.2em] hover:text-muted";

const BUTTON =
  "box-border inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-small font-semibold no-underline";

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="flex-none"
    >
      <path
        d="M9 2.75V11.25M5.25 7.75L9 11.5L12.75 7.75M3.25 14.75H14.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Panel({ person }: { person: Person }) {
  const nameId = `${person.id}-name`;
  return (
    <article
      id={person.id}
      aria-labelledby={nameId}
      className="min-w-0 px-4 py-6 text-center md:p-10 md:text-left"
    >
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-end">
        <Image
          src={person.photo.src}
          alt={person.photo.alt}
          width={600}
          height={600}
          sizes="(min-width: 768px) 7rem, 5.5rem"
          // next/image hides alt text with a transparent colour; the board's
          // photo frame takes the text colour.
          style={{ color: "inherit" }}
          className="box-border block size-[5.5rem] flex-none rounded-tag border border-rule bg-peek object-cover object-[50%_35%] md:size-28"
        />
        <div>
          <h3
            id={nameId}
            className="text-person-phone font-semibold md:text-person"
          >
            {person.name}
          </h3>
          <p className="mt-1 text-base leading-6 font-semibold">
            {person.role}
          </p>
          <p className="mt-0.5 text-small text-muted">{person.fact}</p>
        </div>
      </div>
      <p className="mt-5 text-[1.0625rem] leading-[1.625rem]">{person.pitch}</p>
      <p className="mt-4 text-small">
        <span className="text-muted">Open to</span>{" "}
        <strong className="font-semibold">{person.openTo}</strong>
      </p>
      <h4 className="mt-6 text-[0.875rem] leading-5 font-semibold text-muted">
        What I did here
      </h4>
      <ul className="mt-2 border-b border-rule text-left text-small">
        {person.work.map((work) => (
          <li key={work.href} className="border-t border-rule py-2.5">
            <a href={work.href} className={`${LINK} font-semibold`}>
              {work.label}
            </a>{" "}
            <span className="text-muted">{work.note}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2 text-small font-semibold md:flex-row md:flex-wrap md:items-center md:gap-3">
        {person.cv.ready && (
          <a href={person.cv.path} className={`${BUTTON} bg-ink text-gallery`}>
            <DownloadIcon />
            Download CV (PDF)
          </a>
        )}
        <a
          href={`mailto:${person.email}`}
          className={`${BUTTON} border border-ink text-ink`}
        >
          Email {person.firstName}
        </a>
      </div>
      <p className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-small font-semibold md:justify-start">
        <a href={person.linkedIn} className={LINK}>
          LinkedIn
        </a>
        <a href={person.gitHub} className={LINK}>
          GitHub
        </a>
      </p>
    </article>
  );
}

export function TwoOfUs({
  boardSection,
}: {
  /** The fidelity row this instance is checked as (docs/boards/sections.json). */
  boardSection: "home/people" | "about/people";
}) {
  const [first, second] = PEOPLE;
  return (
    <section
      id="people"
      aria-labelledby="people-title"
      data-board-section={boardSection}
      className="px-4 pt-12 md:mx-auto md:box-content md:max-w-page md:px-10 md:pt-20"
    >
      <h2
        id="people-title"
        className="text-center text-section-phone font-semibold md:text-left md:text-section"
      >
        The two of us
      </h2>
      <div className="mt-4 rounded-person border border-ink bg-plate md:mt-5 md:grid md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
        <Panel person={first} />
        <div
          aria-hidden="true"
          className="mx-4 h-px bg-ink md:mx-0 md:my-10 md:h-auto"
        />
        <Panel person={second} />
      </div>
      <p className="mt-6 text-center font-display text-[1.125rem] leading-6 font-semibold md:text-title md:leading-7">
        <a href="/contact" className={LINK}>
          Or hire us both for your project or idea
        </a>
      </p>
    </section>
  );
}
