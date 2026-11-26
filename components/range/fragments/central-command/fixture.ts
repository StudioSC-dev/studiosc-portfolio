/**
 * The day feed's made-up entries, as the Range boards draw them
 * (range-light-desktop at 1440, range-phone at 390). Nothing here is anyone's
 * real day. Each entry names its source, and each source has one colour, a
 * --frag-cc-* token from globals.css.
 */
export type FeedSource =
  | "sleep"
  | "weather"
  | "calendar"
  | "fitness"
  | "tickets"
  | "news";

export interface FeedEntry {
  /** 24-hour time; the feed runs in time order. */
  time: string;
  source: FeedSource;
  /** The source, in words, as the entry names it. */
  name: string;
  /** The entry's text at 1440. */
  text: string;
  /** The entry's text at 390, or absent where the phone feed leaves it out. */
  phone?: string;
}

export const FEED_DAY = "Today";
export const FEED_DATE = "Thursday 3 December";

export const FEED: readonly FeedEntry[] = [
  {
    time: "06:40",
    source: "sleep",
    name: "Sleep",
    text: "7 h 10 min, in bed by 23:20",
    phone: "7 h 10 min, in bed by 23:20",
  },
  {
    time: "07:00",
    source: "weather",
    name: "Weather",
    text: "31° and humid, rain likely after 15:00",
    phone: "31° and humid, rain after 15:00",
  },
  {
    time: "09:30",
    source: "calendar",
    name: "Calendar",
    text: "Sprint review, 45 minutes",
    phone: "Sprint review, 45 minutes",
  },
  {
    time: "12:10",
    source: "fitness",
    name: "Fitness",
    text: "6,400 steps so far, a 30-minute run planned",
  },
  {
    time: "14:00",
    source: "tickets",
    name: "Tickets",
    text: "2 urgent tickets are waiting for a reply",
    phone: "2 urgent tickets waiting",
  },
  {
    time: "18:00",
    source: "news",
    name: "News",
    text: "3 saved stories to read tonight",
  },
];

/** The entries the phone feed shows, in the same order. */
export const PHONE_FEED = FEED.filter(
  (entry): entry is FeedEntry & { phone: string } => entry.phone !== undefined
);

/** A source's colour token. */
export const sourceColour = (source: FeedSource) => `var(--frag-cc-${source})`;

/** The captions under the feed, at each width. */
export const CAPTION =
  "A day feed with made-up entries, in Central Command's own colours: one colour per kind of source.";
export const PHONE_CAPTION =
  "A day feed with made-up entries, in Central Command's own colours.";
