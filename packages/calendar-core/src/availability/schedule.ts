import { instantInterval, type InstantInterval } from "@moltenship/calendar-temporal";

import { BoundedLruCache } from "../internal/lru-cache";
import type { AvailabilityException, AvailabilityHours, AvailabilitySchedule } from "./types";

/** Validated hours: by ISO day of the week (index 1 to 7), or `null` when open all week. */
export interface ScheduleHours {
  /** By `isoDateKey`. */
  readonly exceptions: ReadonlyMap<string, AvailabilityException>;
  readonly weekly: readonly (readonly AvailabilityHours[])[] | null;
}

/** A date's ISO year, month and day, whatever calendar it is in, such as `2026-10-08`. */
export function isoDateKey(date: Temporal.PlainDate): string {
  return date.toString({ calendarName: "never" });
}

/** `[start, end)` in epoch nanoseconds. */
type Span = readonly [bigint, bigint];

/** Dates a schedule keeps resolved: a year of days, more than any view shows at once. */
const CACHED_DATES = 400;
const allDay: readonly AvailabilityHours[] = Object.freeze([
  Object.freeze({ end: new Temporal.PlainTime(), start: new Temporal.PlainTime() }),
]);

/**
 * The instant, in epoch nanoseconds, a wall time opens or closes at. A skipped wall time takes the
 * jump past it. A repeated one opens at its first occurrence and closes at its second, so hours
 * cover both.
 */
export function wallBoundary(
  dateTime: Temporal.PlainDateTime,
  timeZone: string,
  edge: "end" | "start",
): bigint {
  const earlier = dateTime.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  if (!earlier.toPlainDateTime().equals(dateTime)) {
    // In a gap `earlier` falls before the transition that skips the wall time.
    return earlier.getTimeZoneTransition("next")!.epochNanoseconds;
  }
  return edge === "start"
    ? earlier.epochNanoseconds
    : dateTime.toZonedDateTime(timeZone, { disambiguation: "later" }).epochNanoseconds;
}

function compareSpans(left: Span, right: Span): number {
  return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

/** Sorts spans and joins the ones that overlap or touch. */
function merge(spans: Span[]): Span[] {
  const merged: [bigint, bigint][] = [];
  for (const [start, end] of spans.sort(compareSpans)) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function toInterval(start: bigint, end: bigint): InstantInterval {
  return instantInterval(
    Temporal.Instant.fromEpochNanoseconds(start),
    Temporal.Instant.fromEpochNanoseconds(end),
  );
}

/** Resolves validated hours on a time zone; see `AvailabilitySchedule`. */
export function createAvailabilitySchedule(
  { exceptions, weekly }: ScheduleHours,
  timeZone: string,
): AvailabilitySchedule {
  const dates = new BoundedLruCache<readonly Span[]>(CACHED_DATES);

  /** The open spans that start on a date, as its exception or its day of the week has them. */
  function spansOn(date: Temporal.PlainDate): readonly Span[] {
    const key = isoDateKey(date);
    const cached = dates.get(key);
    if (cached !== undefined) return cached;
    const exception = exceptions.get(key);
    const hours =
      exception === undefined ? (weekly?.[date.dayOfWeek] ?? allDay) : (exception.hours ?? []);
    const spans = merge(
      hours.flatMap(({ end, start }): Span[] => {
        const from = wallBoundary(date.toPlainDateTime(start), timeZone, "start");
        const endDate = Temporal.PlainTime.compare(end, start) <= 0 ? date.add({ days: 1 }) : date;
        const to = wallBoundary(endDate.toPlainDateTime(end), timeZone, "end");
        return to > from ? [[from, to]] : [];
      }),
    );
    dates.set(key, spans);
    return spans;
  }

  function available(range: InstantInterval): readonly InstantInterval[] {
    const start = range.start.epochNanoseconds;
    const end = range.end.epochNanoseconds;
    // Hours reach at most a day past their date, and a repeated midnight can shift a date's first
    // instant into its neighbour's wall time, so a day either side covers every span that counts.
    const first = range.start.toZonedDateTimeISO(timeZone).toPlainDate().subtract({ days: 2 });
    const last = range.end.toZonedDateTimeISO(timeZone).toPlainDate().add({ days: 1 });
    const spans: Span[] = [];
    for (
      let date = first;
      Temporal.PlainDate.compare(date, last) <= 0;
      date = date.add({ days: 1 })
    ) {
      for (const span of spansOn(date)) if (span[0] < end && span[1] > start) spans.push(span);
    }
    return Object.freeze(
      merge(spans).map(([from, to]) =>
        toInterval(from > start ? from : start, to < end ? to : end),
      ),
    );
  }

  function unavailable(range: InstantInterval): readonly InstantInterval[] {
    const closed: InstantInterval[] = [];
    let cursor = range.start;
    for (const open of available(range)) {
      if (Temporal.Instant.compare(cursor, open.start) < 0) {
        closed.push(instantInterval(cursor, open.start));
      }
      cursor = open.end;
    }
    if (Temporal.Instant.compare(cursor, range.end) < 0) {
      closed.push(instantInterval(cursor, range.end));
    }
    return Object.freeze(closed);
  }

  return Object.freeze({
    available,
    exceptionOn: (date: Temporal.PlainDate) => exceptions.get(isoDateKey(date)),
    isAvailable(range: InstantInterval) {
      const [open, ...rest] = available(range);
      return (
        open !== undefined &&
        rest.length === 0 &&
        open.start.equals(range.start) &&
        open.end.equals(range.end)
      );
    },
    timeZone,
    unavailable,
  });
}
