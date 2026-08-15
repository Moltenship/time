import {
  compareInstants,
  comparePlainDateTimes,
  instantInterval,
  plainDateTimeInterval,
  type InstantInterval,
  type PlainDateTimeInterval,
} from "../intervals/half-open";
import { instantKey, zonedDayKeyForTimeZoneId } from "./machine-keys";

export const DEFAULT_ZONED_DAY_SPLIT_LIMIT = 10_000;

const MINIMUM_INSTANT_NANOSECONDS = -8_640_000_000_000_000_000_000n;
const MAXIMUM_INSTANT_NANOSECONDS = 8_640_000_000_000_000_000_000n;
// Temporal offsets are smaller than 24 hours, so two consecutive offsets differ by less than 48.
const MAXIMUM_TIME_ZONE_OFFSET_SPAN_NANOSECONDS = 172_800_000_000_000n;
const MAXIMUM_ZONED_DAY_BOUNDARY_CORRECTIONS = 4;

interface ZonedDayRangeBase {
  readonly date: Temporal.PlainDate;
  readonly duration: Temporal.Duration;
  readonly durationNanoseconds: bigint;
  readonly end: Temporal.Instant;
  readonly endBoundary: Temporal.ZonedDateTime;
  readonly key: string;
  readonly start: Temporal.Instant;
  readonly startBoundary: Temporal.ZonedDateTime;
  readonly timeZone: string;
}

export interface AvailableZonedDayRange extends ZonedDayRangeBase {
  readonly interval: InstantInterval;
  readonly kind: "available";
}

export interface SkippedZonedDayRange extends ZonedDayRangeBase {
  readonly interval: null;
  readonly kind: "skipped";
}

export type ZonedDayRange = AvailableZonedDayRange | SkippedZonedDayRange;

export interface ZonedOffsetTransition {
  readonly affectedWallRange: PlainDateTimeInterval;
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly kind: "fold" | "gap";
  readonly offsetAfter: string;
  readonly offsetBefore: string;
  readonly offsetDeltaNanoseconds: number;
  readonly timeZone: string;
}

export interface ZonedDaySplit {
  readonly continuesAfterDay: boolean;
  readonly continuesBeforeDay: boolean;
  readonly date: Temporal.PlainDate;
  readonly day: AvailableZonedDayRange;
  readonly interval: InstantInterval;
  readonly key: string;
  readonly timeZone: string;
}

export interface SplitInstantRangeByZonedDayOptions {
  readonly limit?: number;
}

function positiveLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("invalid-zoned-day-split-limit");
  }

  return value;
}

/** Returns the actual instant extent of one nominal date in an explicit timezone. */
export function zonedDayRange(date: Temporal.PlainDate, timeZone: string): ZonedDayRange {
  const startBoundary = date.toZonedDateTime(timeZone);
  const endBoundary = date.add({ days: 1 }).toZonedDateTime(timeZone);
  const start = startBoundary.toInstant();
  const end = endBoundary.toInstant();
  const ordering = compareInstants(start, end);

  if (ordering > 0) {
    throw new RangeError("zoned-day-boundaries-reversed");
  }

  const base = {
    date,
    duration: start.until(end, { largestUnit: "hour" }),
    durationNanoseconds: end.epochNanoseconds - start.epochNanoseconds,
    end,
    endBoundary,
    key: zonedDayKeyForTimeZoneId(date, startBoundary.timeZoneId),
    start,
    startBoundary,
    timeZone: startBoundary.timeZoneId,
  };

  if (ordering === 0) {
    return Object.freeze({ ...base, interval: null, kind: "skipped" });
  }

  return Object.freeze({ ...base, interval: instantInterval(start, end), kind: "available" });
}

function wallRangesIntersect(
  leftStart: Temporal.PlainDateTime,
  leftEnd: Temporal.PlainDateTime,
  right: PlainDateTimeInterval,
): boolean {
  return (
    comparePlainDateTimes(leftStart, right.end) < 0 &&
    comparePlainDateTimes(leftEnd, right.start) > 0
  );
}

/** Returns timezone offset transitions whose affected wall interval intersects the nominal date. */
export function zonedDayTransitions(
  date: Temporal.PlainDate,
  timeZone: string,
): readonly ZonedOffsetTransition[] {
  const day = zonedDayRange(date, timeZone);
  const wallStart = date.toPlainDateTime();
  const wallEnd = date.add({ days: 1 }).toPlainDateTime();
  const searchStartNanoseconds =
    day.start.epochNanoseconds === MINIMUM_INSTANT_NANOSECONDS
      ? MINIMUM_INSTANT_NANOSECONDS
      : day.start.epochNanoseconds - 1n;
  const latestRelevantTransitionNanoseconds =
    day.end.epochNanoseconds >
    MAXIMUM_INSTANT_NANOSECONDS - MAXIMUM_TIME_ZONE_OFFSET_SPAN_NANOSECONDS
      ? MAXIMUM_INSTANT_NANOSECONDS
      : day.end.epochNanoseconds + MAXIMUM_TIME_ZONE_OFFSET_SPAN_NANOSECONDS;
  let cursor = new globalThis.Temporal.ZonedDateTime(searchStartNanoseconds, day.timeZone);
  const transitions: ZonedOffsetTransition[] = [];

  for (;;) {
    const after = cursor.getTimeZoneTransition("next");
    if (after === null || after.epochNanoseconds > latestRelevantTransitionNanoseconds) {
      break;
    }

    const instant = after.toInstant();
    const before = instant.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(day.timeZone);
    const offsetDeltaNanoseconds = after.offsetNanoseconds - before.offsetNanoseconds;
    if (offsetDeltaNanoseconds !== 0) {
      const afterWallTime = after.toPlainDateTime();
      const affectedWallRange =
        offsetDeltaNanoseconds > 0
          ? plainDateTimeInterval(
              afterWallTime.subtract({ nanoseconds: offsetDeltaNanoseconds }),
              afterWallTime,
            )
          : plainDateTimeInterval(
              afterWallTime,
              afterWallTime.add({ nanoseconds: -offsetDeltaNanoseconds }),
            );

      if (wallRangesIntersect(wallStart, wallEnd, affectedWallRange)) {
        transitions.push(
          Object.freeze({
            affectedWallRange,
            instant,
            key: instantKey(instant),
            kind: offsetDeltaNanoseconds > 0 ? "gap" : "fold",
            offsetAfter: after.offset,
            offsetBefore: before.offset,
            offsetDeltaNanoseconds,
            timeZone: day.timeZone,
          }),
        );
      }
    }

    cursor = after;
  }

  return Object.freeze(transitions);
}

function zonedDayContainingInstant(
  instant: Temporal.Instant,
  timeZone: string,
): AvailableZonedDayRange {
  let date = instant.toZonedDateTimeISO(timeZone).toPlainDate();

  for (let correction = 0; correction < MAXIMUM_ZONED_DAY_BOUNDARY_CORRECTIONS; correction += 1) {
    const day = zonedDayRange(date, timeZone);
    if (
      day.kind === "available" &&
      compareInstants(day.start, instant) <= 0 &&
      compareInstants(instant, day.end) < 0
    ) {
      return day;
    }

    date =
      compareInstants(instant, day.start) < 0 ? date.subtract({ days: 1 }) : date.add({ days: 1 });
  }

  throw new RangeError("instant-not-contained-by-projected-zoned-day");
}

/** Splits an absolute interval at actual zoned-day boundaries without inventing skipped dates. */
export function splitInstantRangeByZonedDay(
  range: InstantInterval,
  timeZone: string,
  options: SplitInstantRangeByZonedDayOptions = {},
): readonly ZonedDaySplit[] {
  const limit = positiveLimit(options.limit ?? DEFAULT_ZONED_DAY_SPLIT_LIMIT);
  const splits: ZonedDaySplit[] = [];
  let current = range.start;

  while (compareInstants(current, range.end) < 0) {
    if (splits.length >= limit) {
      throw new RangeError("zoned-day-split-limit-exceeded");
    }

    const day = zonedDayContainingInstant(current, timeZone);
    const date = day.date;

    const end = compareInstants(day.end, range.end) < 0 ? day.end : range.end;
    const interval = instantInterval(current, end);
    splits.push(
      Object.freeze({
        continuesAfterDay: compareInstants(range.end, day.end) > 0,
        continuesBeforeDay: compareInstants(range.start, day.start) < 0,
        date,
        day,
        interval,
        key: `${day.key}|${instantKey(current)}`,
        timeZone: day.timeZone,
      }),
    );
    current = end;
  }

  return Object.freeze(splits);
}
