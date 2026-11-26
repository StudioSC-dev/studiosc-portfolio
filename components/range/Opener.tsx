import { RANGE_CATEGORIES } from "@/content/range";
import { OPENER_DOTS, PHONE_DOTS } from "./dots";
import { RangeWord } from "./RangeSwitch";

/**
 * A dot field rests at its theme's --dots-opacity. The load fade plays on the
 * drawing inside it, so fade-in's final frame (opacity 1) multiplies the
 * field's own opacity instead of replacing it.
 */
const DOTS_STYLE = { opacity: "var(--dots-opacity)" } as const;
const DOTS_FADE = { animation: "fade-in 900ms ease-out 120ms both" } as const;

const RISE = "rise 560ms cubic-bezier(0.2, 0.7, 0.2, 1)";

const BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-control px-[1.375rem] text-[0.9375rem] leading-6 font-semibold";

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
      className={`pointer-events-none absolute top-0 ${className}`}
      style={DOTS_STYLE}
    >
      <path
        d={d}
        data-motion=""
        style={{ stroke: "var(--accent)", ...DOTS_FADE }}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The opener: the headline, whose accent word follows the Range's picked
 * category, the intro and the two calls to action, over the dot fields
 * (range-light-desktop, range-phone). It sits inside RangeSwitch.
 */
export function Opener() {
  const words = RANGE_CATEGORIES.map((category) => category.word);
  return (
    <section
      aria-labelledby="range-title"
      data-board-section="home/opener"
      className="relative px-4 pt-6 text-center md:p-0 md:text-left"
    >
      <Dots
        d={OPENER_DOTS}
        width={220}
        height={620}
        className="right-0 hidden md:block"
      />
      <Dots
        d={PHONE_DOTS}
        width={120}
        height={200}
        className="right-0 md:hidden"
      />
      <Dots
        d={PHONE_DOTS}
        width={120}
        height={200}
        className="left-0 -scale-x-100 md:hidden"
      />
      <div className="relative md:mx-auto md:box-content md:max-w-page md:px-10 md:pt-12">
        <h1
          id="range-title"
          className="relative text-[2.625rem] leading-[2.875rem] font-semibold tracking-[-0.035em] md:text-[5.75rem] md:leading-[5.75rem] md:tracking-[-0.04em]"
        >
          <span
            data-motion=""
            className="block"
            style={{ animation: `${RISE} both` }}
          >
            We build <br className="md:hidden" />
            <RangeWord words={words} />.
          </span>
          <span
            data-motion=""
            className="block"
            style={{ animation: `${RISE} 90ms both` }}
          >
            We break <br className="md:hidden" />
            them first.
          </span>
        </h1>
        <div className="relative mt-4 md:mt-8 md:flex md:flex-wrap md:items-center md:justify-between md:gap-x-12 md:gap-y-6">
          <p className="md:max-w-[40rem] md:text-[1.125rem] md:leading-7">
            Husband and wife, developer and tester. We&apos;ve had plenty of
            practice disagreeing, and your software is better for it.
          </p>
          <div className="mt-6 flex flex-col gap-2 md:mt-0 md:flex-row md:gap-3">
            <a href="/contact" className={`${BUTTON} bg-ink text-gallery`}>
              Start a project
            </a>
            <a href="#work" className={`${BUTTON} border border-ink text-ink`}>
              Every project
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
