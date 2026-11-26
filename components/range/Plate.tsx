import { Fragment } from "react";
import type { ChristineCheck, RangeCategory } from "@/content/range";
import type { Fragment as PlateFragment } from "./fragments/types";

/** The dashed tag a lab plate's title carries (range-light-desktop). */
export function LabTag() {
  return (
    <span className="inline-block rounded-tag border border-dashed border-muted px-1.5 align-middle font-sans text-[0.75rem] leading-[1.125rem] font-medium tracking-normal text-muted">
      Lab demo
    </span>
  );
}

/** "Checked by Christine." with the audited check's text, under the plate. */
export function ChristineLine({
  check,
  phone,
  section,
}: {
  check: ChristineCheck;
  phone?: boolean;
  section?: string;
}) {
  const mark = (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="flex-none"
    >
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.75 9.25L7.9 11.25L12.25 6.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const text = (
    <p data-christine-line="">
      <strong className="font-semibold">Checked by Christine.</strong>
      {` ${check.text}`}
    </p>
  );
  return phone ? (
    <div
      data-board-section={section}
      className="mt-4 flex flex-col items-center gap-2 border-t border-rule pt-4 text-[0.8125rem] leading-5"
    >
      {mark}
      {text}
    </div>
  ) : (
    <div
      data-board-section={section}
      className="col-span-full flex items-center gap-3 border-t border-rule pt-4 text-[0.875rem] leading-[1.375rem]"
    >
      {mark}
      {text}
    </div>
  );
}

/** The credit line. The names are plain text until PRV-8 links them. */
function Credit({
  className,
  section,
}: {
  className: string;
  section?: string;
}) {
  return (
    <p data-board-section={section} className={className}>
      Built by Seth · Tested by Christine
    </p>
  );
}

const LINK =
  "text-ink underline decoration-1 underline-offset-[0.2em] hover:text-muted";

function Facts({
  facts,
  className,
  first,
  section,
}: {
  facts: { label: string; value: string }[];
  className: string;
  first: string;
  section?: string;
}) {
  return (
    <dl
      data-board-section={section}
      className={`grid text-[0.9375rem] leading-6 ${first} ${className}`}
    >
      {facts.map((fact, i) => {
        const last = i === facts.length - 1 ? "border-b" : "";
        return (
          <Fragment key={fact.label}>
            <dt className={`border-t border-rule py-2 text-muted ${last}`}>
              {fact.label}
            </dt>
            <dd
              className={`border-t border-rule py-2 ${last} ${fact.label === "Status" ? "font-semibold" : ""}`}
            >
              {fact.value}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

function Links({
  links,
  className,
  section,
}: {
  links: { label: string; href: string }[];
  className: string;
  section?: string;
}) {
  return (
    <p
      data-board-section={section}
      className={`flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] leading-6 font-semibold ${className}`}
    >
      {links.map((link) => (
        <a key={link.href} href={link.href} className={LINK}>
          {link.label}
        </a>
      ))}
    </p>
  );
}

/**
 * A plate's interior at each width: the 1440 layout (range-light-desktop)
 * and the 390 layout (range-phone) draw their parts in a different order, so
 * each is its own block and only one is ever displayed. A plate whose
 * fragment is not built yet draws only its frame and title.
 */
export function Plate({
  category,
  name,
  fragment,
}: {
  category: RangeCategory;
  name: string;
  fragment: PlateFragment | undefined;
}) {
  const plate = category.plate;
  const title = (
    <h2 className="text-[1.5rem] leading-8 font-semibold md:text-[2rem] md:leading-10 md:tracking-[-0.015em]">
      {plate.kind === "lab" ? (
        <>
          {`${name} `}
          <LabTag />
        </>
      ) : (
        name
      )}
    </h2>
  );
  if (plate.kind === "lab" || !fragment) {
    return (
      <div className="md:grid md:grid-cols-[19rem_minmax(0,1fr)] md:gap-x-12 md:gap-y-8">
        <div className="md:flex md:flex-col">{title}</div>
      </div>
    );
  }

  // The interior is every part but the title: the fidelity suite compares it
  // as its own row, once the category's fragment is built.
  const section = ["finance", "sites", "testing"].includes(category.id)
    ? `home/plate-${category.id}-interior`
    : undefined;
  const phoneFacts = plate.facts.filter((fact) => fact.label !== "Started");
  return (
    <>
      <div className="hidden md:grid md:grid-cols-[19rem_minmax(0,1fr)] md:gap-x-12 md:gap-y-8">
        <div className="flex flex-col">
          {title}
          <p data-board-section={section} className="mt-3">
            {plate.desktopDescription}
          </p>
          <Facts
            facts={plate.facts}
            first="grid-cols-[6.5rem_minmax(0,1fr)]"
            className="mt-6"
            section={section}
          />
          <Credit
            className="mt-5 text-[0.9375rem] leading-6"
            section={section}
          />
          <Links links={plate.links} className="mt-5" section={section} />
        </div>
        <figure data-board-section={section} className="min-w-0">
          <fragment.Desktop />
          <figcaption className="mt-3 text-[0.8125rem] leading-5 text-muted">
            {fragment.caption}
          </figcaption>
        </figure>
        {plate.christineCheck && (
          <ChristineLine check={plate.christineCheck} section={section} />
        )}
      </div>
      <div className="md:hidden">
        {title}
        <p
          data-board-section={section}
          className="mt-2 text-[0.9375rem] leading-6"
        >
          {plate.phoneDescription}
        </p>
        <figure data-board-section={section} className="mt-4">
          <fragment.Phone />
          <figcaption
            className={`${fragment.phoneCaptionGap ?? "mt-2.5"} text-[0.8125rem] leading-5 text-muted`}
          >
            {fragment.phoneCaption}
          </figcaption>
        </figure>
        {fragment.phoneFacts !== false && (
          <Facts
            facts={phoneFacts}
            first="grid-cols-[5.5rem_minmax(0,1fr)]"
            className="mt-4 text-left"
            section={section}
          />
        )}
        <Credit className="mt-4 text-[0.9375rem] leading-6" section={section} />
        <Links
          links={plate.links}
          className="mt-4 justify-center"
          section={section}
        />
        {plate.christineCheck && (
          <ChristineLine check={plate.christineCheck} phone section={section} />
        )}
      </div>
    </>
  );
}
