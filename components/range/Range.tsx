import type { CSSProperties } from "react";
import {
  PLATE_NAMES,
  RANGE_CATEGORIES,
  type RangeCategory,
} from "@/content/range";
import { getProjects } from "@/lib/mdx";
import { STATUSES } from "@/lib/statuses";
import { RANGE_DOTS } from "./dots";
import { FRAGMENTS } from "./fragments";
import { LabTag, Plate } from "./Plate";
import {
  RangeCounter,
  RangePeekItem,
  RangeScroll,
  RangeSlide,
  RangeStep,
  RangeTab,
} from "./RangeSwitch";

const CHIPS_ID = "range-categories";

/** The board's icon buttons have no text, so they keep the UA button face. */
const ICON_BUTTON_FACE: CSSProperties = {
  font: "400 13.3333px Arial",
};

const ICON =
  "inline-flex size-11 items-center justify-center border bg-transparent p-0 text-ink";

function Chevron({ way }: { way: "prev" | "next" }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
    >
      <path
        d={way === "prev" ? "M12 4.5L6.5 10L12 15.5" : "M8 4.5L13.5 10L8 15.5"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STAGE_COLUMNS =
  "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,66rem)_minmax(0,1fr)] md:gap-x-6";

const PLATE =
  "rounded-plate border border-rule bg-plate p-4 text-center shadow-plate-phone md:px-10 md:pt-[3.25rem] md:pb-10 md:text-left md:shadow-plate";

const TAB =
  "flex-none rounded-pill border border-rule bg-transparent px-4 min-h-11 font-display text-[0.9375rem] leading-5 font-semibold whitespace-nowrap text-ink aria-pressed:bg-ink aria-pressed:text-gallery md:min-h-10 md:border-0 md:px-[1.125rem]";

interface Shown {
  category: RangeCategory;
  name: string;
  /** The peek's status line: a real plate's status, once its fragment is built. */
  status?: string;
}

function PeekContent({ shown }: { shown: Shown }) {
  const { category, name, status } = shown;
  const fragment =
    FRAGMENTS[category.plate.fragmentId as keyof typeof FRAGMENTS];
  return (
    <>
      <p className="text-[0.8125rem] leading-5 text-muted">{category.tab}</p>
      <p className="mt-1 font-display text-[1.125rem] leading-6 font-semibold text-muted">
        {name}
      </p>
      {category.plate.kind === "lab" ? (
        <p className="mt-1 text-[0.8125rem] leading-5 text-muted">
          <LabTag />
        </p>
      ) : (
        status &&
        fragment && (
          <>
            <p className="mt-1 text-[0.8125rem] leading-5 text-muted">
              {status}
            </p>
            <div className="mt-5 opacity-75">
              <fragment.Peek />
            </div>
          </>
        )
      )}
    </>
  );
}

function Peek({ side, shown }: { side: "prev" | "next"; shown: Shown[] }) {
  const frame =
    side === "prev" ? "right-0 pr-6 pl-[4.5rem]" : "left-0 pl-6 pr-[4.5rem]";
  return (
    <div
      aria-hidden="true"
      inert
      data-board-key={side === "prev" ? "peek-left" : "peek-right"}
      className="relative hidden min-w-0 md:block"
    >
      <div
        className={`absolute top-[9%] bottom-[9%] box-border w-[calc(100%+3rem)] rounded-peek border border-rule bg-peek py-10 ${frame}`}
      >
        {shown.map((item, i) => (
          <RangePeekItem key={item.category.id} index={i} side={side}>
            <PeekContent shown={item} />
          </RangePeekItem>
        ))}
      </div>
    </div>
  );
}

/**
 * The Range: seven category tabs (1440) or chips (390), the plates with the
 * desktop peeks on either side, and back, the counter and next
 * (range-light-desktop, range-phone). Every plate is server HTML; RangeSwitch
 * only picks which one shows.
 */
export async function Range() {
  const projects = await getProjects();
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const shown: Shown[] = RANGE_CATEGORIES.map((category) => {
    const plate = category.plate;
    if (plate.kind === "lab") return { category, name: plate.name };
    const project = bySlug.get(plate.slug);
    return {
      category,
      name: PLATE_NAMES[plate.slug] ?? project?.title ?? plate.slug,
      status: project ? STATUSES[project.status].label : undefined,
    };
  });
  const count = shown.length;
  const tabs = shown.map((item) => item.category.tab);
  const words = shown.map((item) => item.category.word);

  return (
    <section
      id="cabinet"
      data-board-section="home/range"
      aria-roledescription="carousel"
      aria-label="What we build, by category"
      className="relative overflow-x-clip pt-12 md:overflow-hidden md:pt-14"
    >
      <svg
        aria-hidden="true"
        width="200"
        height="460"
        viewBox="0 0 200 460"
        fill="none"
        className="pointer-events-none absolute top-8 left-0 hidden md:block"
        style={{ opacity: "var(--dots-opacity)" }}
      >
        {/* The fade plays on the drawing; the field keeps its resting opacity. */}
        <path
          d={RANGE_DOTS}
          data-motion=""
          style={{
            stroke: "var(--accent)",
            animation: "fade-in 900ms ease-out 200ms both",
          }}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
      <div
        data-motion=""
        className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-4 animate-[fade-in_420ms_ease-out_300ms_both] md:relative md:z-[2] md:-mb-6 md:flex md:justify-center md:animate-[fade-in_420ms_ease-out_360ms_both]"
      >
        <RangeScroll
          way="prev"
          controls={CHIPS_ID}
          label="Scroll the categories back"
          className={`${ICON} rounded-pill border-rule md:hidden`}
          style={ICON_BUTTON_FACE}
        >
          <Chevron way="prev" />
        </RangeScroll>
        <div
          id={CHIPS_ID}
          role="group"
          aria-label="Choose a category"
          className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] md:inline-flex md:flex-wrap md:justify-center md:gap-1 md:overflow-visible md:rounded-pill md:border md:border-rule md:bg-plate md:p-[0.3125rem] md:shadow-pill"
        >
          {tabs.map((tab, i) => (
            <RangeTab key={tab} index={i} className={TAB}>
              {tab}
            </RangeTab>
          ))}
        </div>
        <RangeScroll
          way="next"
          controls={CHIPS_ID}
          label="Scroll the categories forward"
          className={`${ICON} rounded-pill border-rule md:hidden`}
          style={ICON_BUTTON_FACE}
        >
          <Chevron way="next" />
        </RangeScroll>
      </div>
      <div
        data-motion=""
        className={`mt-4 px-4 md:mt-0 md:px-0 md:animate-[stage-in_640ms_cubic-bezier(0.2,0.7,0.2,1)_220ms_both] ${STAGE_COLUMNS}`}
      >
        <Peek side="prev" shown={shown} />
        <div className="min-w-0">
          {shown.map((item, i) => (
            <RangeSlide
              key={item.category.id}
              index={i}
              section={`home/plate-${item.category.id}`}
              label={`${i + 1} of ${count}: ${item.category.tab}, ${item.name}${item.category.plate.kind === "lab" ? " [Lab demo]" : ""}`}
              className={PLATE}
            >
              <Plate
                category={item.category}
                name={item.name}
                fragment={
                  FRAGMENTS[
                    item.category.plate.fragmentId as keyof typeof FRAGMENTS
                  ]
                }
              />
            </RangeSlide>
          ))}
        </div>
        <Peek side="next" shown={shown} />
      </div>
      <div className={`px-4 pt-4 md:mt-5 md:px-0 md:pt-0 ${STAGE_COLUMNS}`}>
        <div className="flex items-center justify-center gap-3 md:col-start-2 md:justify-start">
          <RangeStep
            way="prev"
            label="Previous plate"
            className={`${ICON} rounded-control border-ink`}
            style={ICON_BUTTON_FACE}
          >
            <Chevron way="prev" />
          </RangeStep>
          <RangeCounter
            tabs={tabs}
            words={words}
            className="min-w-[3.75rem] text-center text-[0.9375rem] leading-6 font-semibold tabular-nums"
          />
          <RangeStep
            way="next"
            label="Next plate"
            className={`${ICON} rounded-control border-ink`}
            style={ICON_BUTTON_FACE}
          >
            <Chevron way="next" />
          </RangeStep>
        </div>
      </div>
    </section>
  );
}
