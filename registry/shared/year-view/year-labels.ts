import type { ClosedDate, EventDayFragment, EventId, ResourceId } from "@moltenship/calendar";

/**
 * The year's words and date formats, one place for every framework's markup. Edit or translate
 * the English here.
 */

export interface YearFormats {
  readonly date: Intl.DateTimeFormat;
  readonly month: Intl.DateTimeFormat;
  readonly monthYear: Intl.DateTimeFormat;
  readonly time: (time: Temporal.PlainTime) => string;
  readonly weekday: Intl.DateTimeFormat;
  readonly weekdayName: Intl.DateTimeFormat;
  readonly weekdayShort: Intl.DateTimeFormat;
}

/** The year's formats in `locale`; make them once per locale. */
export function yearFormats(locale: Intl.LocalesArgument): YearFormats {
  const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const hourMinute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    month: new Intl.DateTimeFormat(locale, { month: "long" }),
    monthYear: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    time: (time) => (time.minute === 0 ? hour : hourMinute).format(time),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "narrow" }),
    weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
    weekdayShort: new Intl.DateTimeFormat(locale, { weekday: "short" }),
  };
}

export function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A day cell's name: its date, why it's closed, and how many events it has. */
export function dayCellLabel(
  formats: YearFormats,
  date: Temporal.PlainDate,
  closed: ClosedDate | undefined,
  count: number,
): string {
  return [
    formats.date.format(date),
    closed?.label,
    closed === undefined ? undefined : "closed",
    eventCount(count),
  ]
    .filter((part) => part !== undefined)
    .join(", ");
}

/** The name of the popover that lists a day's events. */
export function dayEventsLabel(formats: YearFormats, date: Temporal.PlainDate): string {
  return `Events on ${formats.date.format(date)}`;
}

/** What the popover says for a day without events. */
export const noEventsText = "No events";

/** An event's start time in a day's list; nothing for all-day events and continuations. */
export function eventTime(
  fragment: EventDayFragment<unknown, EventId, ResourceId>,
  formats: YearFormats,
): string | undefined {
  return fragment.event.kind === "all-day" || fragment.startsBeforeDay
    ? undefined
    : formats.time(fragment.start.toPlainTime());
}
