import type { TimeGridEventFormats } from "./time-grid-geometry";

/*
 * The time grid's words and date formats, one place for every framework's markup. Edit or
 * translate them here.
 */

export interface TimeGridColumnFormats extends TimeGridEventFormats {
  /** A slot's date and time, for its accessible name. */
  readonly slot: Intl.DateTimeFormat;
}

/** The formats a column reads, made once per locale for all of a grid's columns. */
export function timeGridColumnFormats(locale: Intl.LocalesArgument): TimeGridColumnFormats {
  return {
    dayTime: new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    }),
    slot: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "long",
      weekday: "long",
    }),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
  };
}

/** A day header's formats: its full date, for its name, and its short weekday. */
export function dayHeaderFormats(locale: Intl.LocalesArgument) {
  return {
    full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
  };
}

/** A full date, such as "Thursday, October 8, 2026", for the all-day cells' names. */
export function fullDateFormat(locale: Intl.LocalesArgument) {
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  return (date: Temporal.PlainDate) => format.format(date);
}

/** The header button that opens a day. */
export function openDayLabel(date: string): string {
  return `Open ${date}`;
}

/** The timed row's header, for screen readers. */
export const timedEventsLabel = "Timed events";

/** The all-day row's header, for screen readers. */
export const allDayLabel = "All day";

/** Titles of the bands a daylight saving change draws. */
export const clockChangeTitles = {
  fold: "Repeated: clocks moved back",
  gap: "Skipped: clocks moved forward",
} as const;

/** Added to a slot's name when any of it is closed. */
export const outsideWorkingHours = "outside working hours";

/** A slot's accessible name from its parts, leaving out the ones it doesn't have. */
export function slotLabel(parts: readonly (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined).join(", ");
}

/** A compact event's time, after its title: ", 9:00 AM". */
export const compactTimeSeparator = ", ";

/** An all-day cell's count of events, for its name. */
export function allDayEventCount(count: number): string {
  return count === 0
    ? "no all-day events"
    : count === 1
      ? "1 all-day event"
      : `${count} all-day events`;
}

/** An all-day cell's accessible name. */
export function allDayCellLabel(date: string, count: number): string {
  return `${date}, ${allDayEventCount(count)}`;
}

/** The all-day row's chevron. */
export function allDayToggleLabel(collapsed: boolean): string {
  return collapsed ? "Show all all-day events" : "Show fewer all-day events";
}

/** A day's "+N more" in a collapsed all-day row. */
export function moreAllDayText(count: number): string {
  return `+${count} more`;
}
