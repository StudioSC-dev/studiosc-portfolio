import { FEED, FEED_DATE, FEED_DAY, PHONE_FEED, sourceColour } from "./fixture";

/** The day feed at 1440: six entries (range-light-desktop). */
export function DesktopFeed() {
  return (
    <div
      data-fragment="central-command"
      className="overflow-hidden rounded-fragment border border-[var(--frag-cc-line)] bg-[var(--frag-cc-bg)] p-5 text-[var(--frag-cc-ink)]"
    >
      <div className="flex items-baseline justify-between gap-4 px-1 pb-4">
        <span className="text-[1.25rem] leading-7 font-bold">{FEED_DAY}</span>
        <span className="text-[0.875rem] leading-5 text-[var(--frag-cc-muted)]">
          {FEED_DATE}
        </span>
      </div>
      <ol className="flex list-none flex-col gap-2">
        {FEED.map((entry) => (
          <li
            key={entry.time}
            data-source={entry.source}
            className="grid grid-cols-[3.5rem_0.25rem_minmax(0,1fr)] items-stretch gap-4 rounded-lg bg-[var(--frag-cc-panel)] px-4 py-3"
          >
            <span className="text-[0.875rem] leading-6 font-semibold tabular-nums">
              {entry.time}
            </span>
            <span
              data-colour
              className="rounded-[2px]"
              style={{ background: sourceColour(entry.source) }}
            />
            <span className="text-[0.9375rem] leading-6">
              <strong className="font-bold">{entry.name}</strong>
              {` ${entry.text}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The day feed at 390: four entries (range-phone). */
export function PhoneFeed() {
  return (
    <div
      data-fragment="central-command"
      className="rounded-fragment border border-[var(--frag-cc-line)] bg-[var(--frag-cc-bg)] p-3.5 text-left text-[var(--frag-cc-ink)]"
    >
      <p className="mb-3 flex items-baseline justify-between">
        <span className="text-[1.125rem] leading-6 font-bold">{FEED_DAY}</span>
        <span className="text-[0.8125rem] leading-5 text-[var(--frag-cc-muted)]">
          {FEED_DATE}
        </span>
      </p>
      <ol className="flex list-none flex-col gap-1.5 text-[0.875rem] leading-[1.375rem]">
        {PHONE_FEED.map((entry) => (
          <li
            key={entry.time}
            data-source={entry.source}
            className="grid grid-cols-[2.75rem_0.25rem_minmax(0,1fr)] gap-2.5 rounded-lg bg-[var(--frag-cc-panel)] px-3 py-2.5"
          >
            <span className="font-semibold tabular-nums">{entry.time}</span>
            <span
              data-colour
              className="rounded-[2px]"
              style={{ background: sourceColour(entry.source) }}
            />
            <span>
              <strong className="font-bold">{entry.name}</strong>
              {` ${entry.phone}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
