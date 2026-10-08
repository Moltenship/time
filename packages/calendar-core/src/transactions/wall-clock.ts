import type { ResourceId } from "../ids";
import type { CalendarEventPlacement } from "./types";

export type DurationInput = Temporal.Duration | Temporal.DurationLike;

/**
 * A wall-clock offset. Its calendar part (years to days) and time part may differ in sign, as in
 * `{ days: 1, minutes: -30 }`; a `Temporal.Duration` also qualifies.
 */
export interface CalendarWallClockDelta {
  readonly days?: number;
  readonly hours?: number;
  readonly microseconds?: number;
  readonly milliseconds?: number;
  readonly minutes?: number;
  readonly months?: number;
  readonly nanoseconds?: number;
  readonly seconds?: number;
  readonly weeks?: number;
  readonly years?: number;
}

/** Applies a delta's calendar part on the wall clock, then its time part as exact time. */
export function shiftWallClock<TPoint extends Temporal.ZonedDateTime | Temporal.PlainDate>(
  point: TPoint,
  delta: CalendarWallClockDelta,
): TPoint {
  const {
    days = 0,
    hours = 0,
    microseconds = 0,
    milliseconds = 0,
    minutes = 0,
    months = 0,
    nanoseconds = 0,
    seconds = 0,
    weeks = 0,
    years = 0,
  } = delta;
  const calendar = { days, months, weeks, years };
  if (point instanceof Temporal.PlainDate) return point.add(calendar) as TPoint;
  return (point as Temporal.ZonedDateTime)
    .add(calendar)
    .add({ hours, microseconds, milliseconds, minutes, nanoseconds, seconds }) as TPoint;
}

export type WallClockPlacement<TResourceId extends ResourceId> = Exclude<
  CalendarEventPlacement<TResourceId>,
  { readonly kind: "all-day" }
>;

export function positiveDuration(value: DurationInput): Temporal.Duration {
  const duration = Temporal.Duration.from(value);
  if (duration.sign <= 0) throw new RangeError("duration-must-be-positive");
  return duration;
}

/**
 * Timed endpoints on the display zone's wall clock. Floating endpoints use UTC as a DST-free wall
 * clock, so both kinds share zoned arithmetic and floating events stay floating.
 */
export function wallClockEndpoints(
  placement: WallClockPlacement<ResourceId>,
  timeZone: string,
): { readonly end: Temporal.ZonedDateTime; readonly start: Temporal.ZonedDateTime } {
  return placement.kind === "timed"
    ? {
        end: placement.end.toZonedDateTimeISO(timeZone),
        start: placement.start.toZonedDateTimeISO(timeZone),
      }
    : { end: placement.end.toZonedDateTime("UTC"), start: placement.start.toZonedDateTime("UTC") };
}

export function withWallClockEndpoints<TResourceId extends ResourceId>(
  placement: WallClockPlacement<TResourceId>,
  start: Temporal.ZonedDateTime,
  end: Temporal.ZonedDateTime,
): CalendarEventPlacement<TResourceId> {
  return placement.kind === "timed"
    ? { ...placement, end: end.toInstant(), start: start.toInstant() }
    : { ...placement, end: end.toPlainDateTime(), start: start.toPlainDateTime() };
}
