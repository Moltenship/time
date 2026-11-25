import type { EventDayFragment, EventId, MonthDay, ResourceId } from "@moltenship/calendar";

import type { ClosedDay } from "./month-layout";

/**
 * The month grid's words and date formats, one place for every framework's markup. Edit or
 * translate the English here.
 */

export interface MonthFormats {
  readonly date: Intl.DateTimeFormat;
  /** A month's first date, named with the short month it shows: "Thursday, Oct 1, 2026". */
  readonly firstDate: Intl.DateTimeFormat;
  readonly monthDay: Intl.DateTimeFormat;
  readonly time: (time: Temporal.PlainTime) => string;
  readonly weekday: Intl.DateTimeFormat;
  readonly weekdayName: Intl.DateTimeFormat;
}

/** The month grid's formats in `locale`; make them once per locale. */
export function monthFormats(locale: Intl.LocalesArgument): MonthFormats {
  const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  const hourMinute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    firstDate: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      weekday: "long",
      year: "numeric",
    }),
    monthDay: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    time: (time) => (time.minute === 0 ? hour : hourMinute).format(time),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
  };
}

/** A piece's start time; nothing for all-day events and continuations. */
export function startTime(
  fragment: EventDayFragment<unknown, EventId, ResourceId>,
  formats: MonthFormats,
): string | undefined {
  return fragment.event.kind === "all-day" || fragment.startsBeforeDay
    ? undefined
    : formats.time(fragment.start.toPlainTime());
}

export function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A day cell's name: its date, why it's closed, and how many events it has. */
export function dayCellLabel(
  formats: MonthFormats,
  date: Temporal.PlainDate,
  closed: ClosedDay | undefined,
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

/** A date button's name; a month's first date names its month. */
export function dateButtonLabel(formats: MonthFormats, date: Temporal.PlainDate): string {
  return (date.day === 1 ? formats.firstDate : formats.date).format(date);
}

/** What a date button shows: the day, or on a month's first date the short month too. */
export function dateButtonText(formats: MonthFormats, day: MonthDay): string | number {
  return day.date.day === 1 ? formats.monthDay.format(day.date) : day.date.day;
}

/** The "+N more" control's name. */
export function moreEventsLabel(
  formats: MonthFormats,
  date: Temporal.PlainDate,
  count: number,
): string {
  return `${count} more events on ${formats.date.format(date)}`;
}

/** What "+N more" shows: the long text, and the short one for small screens. */
export function moreEventsText(count: number): { readonly long: string; readonly short: string } {
  return { long: `${count} more`, short: `+${count}` };
}

/** The name of the list "+N more" opens. */
export function dayEventsLabel(formats: MonthFormats, date: Temporal.PlainDate): string {
  return `Events on ${formats.date.format(date)}`;
}
