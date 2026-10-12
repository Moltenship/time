import type { CalendarEventInterval } from "@moltenship/calendar-core";

import type { OccurrenceRange, RecurringCalendarEvent } from "../../src";

export type Event = RecurringCalendarEvent<{ readonly color?: string }>;

export const instant = (value: string) => Temporal.Instant.from(value);
export const date = (value: string) => Temporal.PlainDate.from(value);
export const dateTime = (value: string) => Temporal.PlainDateTime.from(value);

/** A timed event at a wall time in `timeZone`, lasting `minutes`. */
export function timed(
  id: string,
  start: string,
  timeZone: string,
  minutes = 60,
  extra: Partial<Event> = {},
): Event {
  const zoned = Temporal.PlainDateTime.from(start).toZonedDateTime(timeZone);
  return {
    data: {},
    end: zoned.add({ minutes }).toInstant(),
    id,
    kind: "timed",
    sourceTimeZone: timeZone,
    start: zoned.toInstant(),
    title: id,
    ...extra,
  } as Event;
}

export function range(start: string, end: string, timeZone = "UTC"): OccurrenceRange {
  return { range: { end: date(end), start: date(start) }, timeZone };
}

/** Each occurrence's start as a wall time in `timeZone` (dates and floating times as they are). */
export function starts(
  occurrences: readonly { readonly interval: CalendarEventInterval }[],
  timeZone = "UTC",
): string[] {
  return occurrences.map(({ interval }) =>
    interval.kind === "timed"
      ? interval.start.toZonedDateTimeISO(timeZone).toPlainDateTime().toString()
      : interval.start.toString(),
  );
}

export const ids = (occurrences: readonly { readonly id: unknown }[]) =>
  occurrences.map(({ id }) => id);
