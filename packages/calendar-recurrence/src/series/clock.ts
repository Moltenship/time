import type { CalendarEventInterval } from "@moltenship/calendar-core";

import type { RecurrenceDate } from "../types";

export type SeriesKind = CalendarEventInterval["kind"];

/** Each kind's date type, with its article. */
export const dateTypes: Readonly<Record<SeriesKind, string>> = {
  "all-day": "a PlainDate",
  floating: "a PlainDateTime",
  timed: "an Instant",
};

export function kindOf(date: unknown): SeriesKind | undefined {
  if (date instanceof Temporal.Instant) return "timed";
  if (date instanceof Temporal.PlainDate) return "all-day";
  if (date instanceof Temporal.PlainDateTime) return "floating";
  return undefined;
}

/** Orders two dates of the same kind. */
export function compareDates(left: RecurrenceDate, right: RecurrenceDate): number {
  if (left instanceof Temporal.Instant && right instanceof Temporal.Instant) {
    return Temporal.Instant.compare(left, right);
  }
  if (left instanceof Temporal.PlainDate && right instanceof Temporal.PlainDate) {
    return Temporal.PlainDate.compare(left, right);
  }
  if (left instanceof Temporal.PlainDateTime && right instanceof Temporal.PlainDateTime) {
    return Temporal.PlainDateTime.compare(left, right);
  }
  throw new RangeError("Recurrence dates of different kinds don't compare.");
}

/** From `start` to `end`: exact time for instants, days for dates, wall time for floating times. */
export function durationBetween(start: RecurrenceDate, end: RecurrenceDate): Temporal.Duration {
  if (start instanceof Temporal.Instant && end instanceof Temporal.Instant) return start.until(end);
  if (start instanceof Temporal.PlainDate && end instanceof Temporal.PlainDate) {
    return start.until(end);
  }
  if (start instanceof Temporal.PlainDateTime && end instanceof Temporal.PlainDateTime) {
    return start.until(end);
  }
  throw new RangeError("Recurrence dates of different kinds don't subtract.");
}

const validTimeZones = new Map<string, boolean>();

export function isTimeZone(timeZone: string): boolean {
  let valid = validTimeZones.get(timeZone);
  if (valid === undefined) {
    try {
      new Temporal.ZonedDateTime(0n, timeZone);
      valid = true;
    } catch {
      valid = false;
    }
    if (validTimeZones.size < 256) validTimeZones.set(timeZone, valid);
  }
  return valid;
}

/** The half-open range's bounds in a series' kind: instants at the start of day in `timeZone`. */
export function rangeBounds(
  range: Readonly<{ end: Temporal.PlainDate; start: Temporal.PlainDate }>,
  kind: SeriesKind,
  timeZone: string,
): { readonly end: RecurrenceDate; readonly start: RecurrenceDate } {
  switch (kind) {
    case "timed":
      return {
        end: range.end.toZonedDateTime(timeZone).toInstant(),
        start: range.start.toZonedDateTime(timeZone).toInstant(),
      };
    case "all-day":
      return { end: range.end, start: range.start };
    case "floating":
      return { end: range.end.toPlainDateTime(), start: range.start.toPlainDateTime() };
  }
}

/** An occurrence's interval, in the kind and source time zone of the series' first occurrence. */
export function intervalOf(
  start: RecurrenceDate,
  end: RecurrenceDate,
  first: CalendarEventInterval,
): CalendarEventInterval {
  if (first.kind !== "timed") return { end, kind: first.kind, start } as CalendarEventInterval;
  const instants = {
    end: end as Temporal.Instant,
    kind: "timed",
    start: start as Temporal.Instant,
  };
  return first.sourceTimeZone === undefined
    ? (instants as CalendarEventInterval)
    : { ...instants, kind: "timed", sourceTimeZone: first.sourceTimeZone };
}

export function isInterval(value: unknown): value is CalendarEventInterval {
  if (typeof value !== "object" || value === null) return false;
  const { end, kind, start } = value as Partial<Record<"end" | "kind" | "start", unknown>>;
  return (
    (kind === "timed" || kind === "all-day" || kind === "floating") &&
    kindOf(start) === kind &&
    kindOf(end) === kind
  );
}

export function sameInterval(left: CalendarEventInterval, right: CalendarEventInterval): boolean {
  return (
    left.kind === right.kind &&
    compareDates(left.start, right.start) === 0 &&
    compareDates(left.end, right.end) === 0 &&
    (left.kind !== "timed" || left.sourceTimeZone === (right as typeof left).sourceTimeZone)
  );
}
