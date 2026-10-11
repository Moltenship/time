import {
  instantInterval,
  zonedDayRange,
  type InstantInterval,
} from "@moltenship/calendar-temporal";

import { wallEpochNanoseconds, wallExtent } from "../views/time-grid/geometry";
import type { AvailabilitySchedule } from "./types";

/**
 * Why time is closed: `"outside-hours"` before, between, or after a date's open hours (its
 * exception's included), `"closed-day"` on a date the weekly hours leave closed, and
 * `"exception"` on a date an exception closes.
 */
export type UnavailableReason = "closed-day" | "exception" | "outside-hours";

/** Why some closed time is closed, and whether open time meets it. */
export interface ClosedTime {
  readonly reason: UnavailableReason;
  /** The label of the date's exception, such as "Public holiday". */
  readonly label?: string;
  /** Whether open time ends where it starts, rather than closed time running on past the range. */
  readonly opensBefore: boolean;
  /** Whether open time starts where it ends. */
  readonly opensAfter: boolean;
}

/** Closed time with its reason; see `availabilityClosures`. */
export interface AvailabilityClosure extends ClosedTime {
  readonly interval: InstantInterval;
}

const DAY_NANOSECONDS = 86_400_000_000_000n;

/**
 * Every instant whose wall time can fall on `days` dates from `first`. Offsets stay within ±24
 * hours, so a day either side covers them, a repeated hour after the last midnight included.
 */
export function datesWindow(first: Temporal.PlainDate, days: number): InstantInterval {
  const midnight = wallEpochNanoseconds(first.toPlainDateTime());
  return instantInterval(
    Temporal.Instant.fromEpochNanoseconds(midnight - DAY_NANOSECONDS),
    Temporal.Instant.fromEpochNanoseconds(midnight + BigInt(days + 1) * DAY_NANOSECONDS),
  );
}

/**
 * Whether no time on `date`'s wall clock in `timeZone` is open, a repeated hour after midnight
 * included. A date the time zone skips is never closed.
 */
export function isClosedOn(
  schedule: AvailabilitySchedule,
  date: Temporal.PlainDate,
  timeZone: string,
): boolean {
  if (zonedDayRange(date, timeZone).interval === null) return false;
  return schedule
    .available(datesWindow(date, 1))
    .every((open) => wallExtent(date, 1, timeZone, open) === null);
}

/** Why closed time on a date of the schedule's wall clock is closed, with its exception's label. */
function closedReason(
  schedule: AvailabilitySchedule,
  date: Temporal.PlainDate,
): Pick<ClosedTime, "label" | "reason"> {
  const exception = schedule.exceptionOn(date);
  const reason: UnavailableReason = !isClosedOn(schedule, date, schedule.timeZone)
    ? "outside-hours"
    : exception === undefined
      ? "closed-day"
      : "exception";
  return exception?.label === undefined ? { reason } : { label: exception.label, reason };
}

/** The first midnight on `timeZone`'s wall clock after `instant`. */
function nextMidnight(instant: Temporal.Instant, timeZone: string): Temporal.Instant {
  let date = instant.toZonedDateTimeISO(timeZone).toPlainDate();
  for (;;) {
    date = date.add({ days: 1 });
    // A repeated midnight can put the next date's first instant before a time still on this one.
    const midnight = date.toZonedDateTime(timeZone).toInstant();
    if (Temporal.Instant.compare(midnight, instant) > 0) return midnight;
  }
}

/**
 * The closed parts of `range`, in time order, each with why it's closed. Closed time is split
 * where its reason or label changes from one date of the schedule's wall clock to the next, so
 * a weekend after Friday's hours is its own piece; open time meets a piece only at the ends of
 * the closed time it belongs to.
 */
export function availabilityClosures(
  schedule: AvailabilitySchedule,
  range: InstantInterval,
): readonly AvailabilityClosure[] {
  const { timeZone } = schedule;
  const closures: AvailabilityClosure[] = [];
  for (const closed of schedule.unavailable(range)) {
    const pieces: { end: Temporal.Instant; start: Temporal.Instant; why: ClosedTime }[] = [];
    let cursor = closed.start;
    while (Temporal.Instant.compare(cursor, closed.end) < 0) {
      const midnight = nextMidnight(cursor, timeZone);
      const end = Temporal.Instant.compare(midnight, closed.end) < 0 ? midnight : closed.end;
      const why = {
        ...closedReason(schedule, cursor.toZonedDateTimeISO(timeZone).toPlainDate()),
        opensAfter: false,
        opensBefore: false,
      };
      const last = pieces.at(-1);
      if (last?.why.reason === why.reason && last.why.label === why.label) last.end = end;
      else pieces.push({ end, start: cursor, why });
      cursor = end;
    }
    pieces.forEach(({ end, start, why }, index) =>
      closures.push(
        Object.freeze({
          ...why,
          interval: instantInterval(start, end),
          opensAfter: index === pieces.length - 1 && !closed.end.equals(range.end),
          opensBefore: index === 0 && !closed.start.equals(range.start),
        }),
      ),
    );
  }
  return Object.freeze(closures);
}
