import { positiveTimeDuration } from "../internal/time-duration.ts";
import {
  compareInstants,
  comparePlainDateTimes,
  instantInterval,
  plainDateTimeInterval,
  type InstantInterval,
  type PlainDateTimeInterval,
} from "../intervals/half-open.ts";
import { intersectInstantIntervals } from "../intervals/operations.ts";
import {
  zonedDayRange,
  zonedDayTransitions,
  type ZonedDayRange,
  type ZonedOffsetTransition,
} from "./day.ts";
import { zonedWallTimeKeyForTimeZoneId } from "./machine-keys.ts";
import {
  projectInstantToZonedTime,
  resolveZonedWallTime,
  type ZonedTimeEnvironment,
  type ZonedWallTimeKind,
  type ZonedWallTimeOccurrence,
  type ZonedWallTimeProjection,
} from "./projection.ts";

const NOMINAL_DAY_NANOSECONDS = 86_400_000_000_000n;
export const DEFAULT_ZONED_SLOT_LIMIT = 10_000;

export interface ZonedDaySlotsOptions extends ZonedTimeEnvironment {
  readonly limit?: number;
  readonly slotDuration: Temporal.DurationLike;
}

export interface ZonedDaySlotOccurrence {
  readonly interval: InstantInterval;
  readonly key: string;
  readonly start: ZonedWallTimeOccurrence;
}

export interface ZonedDaySlotSegment {
  readonly key: string;
  readonly kind: ZonedWallTimeKind;
  readonly occurrences: readonly ZonedDaySlotOccurrence[];
  readonly physicalDurationNanoseconds: bigint;
  readonly projection: ZonedWallTimeProjection;
  readonly wallRange: PlainDateTimeInterval;
}

export interface ZonedDaySlot {
  readonly index: number;
  readonly key: string;
  readonly kind: ZonedWallTimeKind | "transition";
  readonly physicalDurationNanoseconds: bigint;
  readonly segments: readonly ZonedDaySlotSegment[];
  readonly wallRange: PlainDateTimeInterval;
}

export interface ZonedDaySlots {
  /** Physical pieces owned by the boundary day whose projected wall date is adjacent to `day.date`. */
  readonly carryoverOccurrences: readonly ZonedDaySlotOccurrence[];
  readonly day: ZonedDayRange;
  readonly disambiguation: ZonedTimeEnvironment["disambiguation"];
  readonly physicalDurationNanoseconds: bigint;
  readonly slotDuration: Temporal.Duration;
  readonly slotDurationNanoseconds: bigint;
  readonly slots: readonly ZonedDaySlot[];
  readonly timeZone: string;
  readonly transitions: readonly ZonedOffsetTransition[];
}

function carryoverOccurrence(
  start: Temporal.Instant,
  end: Temporal.Instant,
  timeZone: string,
): ZonedDaySlotOccurrence {
  const projection = projectInstantToZonedTime(start, timeZone);

  return Object.freeze({
    interval: instantInterval(start, end),
    key: projection.key,
    start: projection,
  });
}

function slotLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("invalid-zoned-slot-limit");
  }

  return value;
}

function segmentBoundaries(
  slotRange: PlainDateTimeInterval,
  transitions: readonly ZonedOffsetTransition[],
): readonly Temporal.PlainDateTime[] {
  const candidates = [slotRange.start, slotRange.end];

  for (const transition of transitions) {
    for (const boundary of [transition.affectedWallRange.start, transition.affectedWallRange.end]) {
      if (
        comparePlainDateTimes(boundary, slotRange.start) > 0 &&
        comparePlainDateTimes(boundary, slotRange.end) < 0
      ) {
        candidates.push(boundary);
      }
    }
  }

  candidates.sort(comparePlainDateTimes);
  return Object.freeze(
    candidates.filter(
      (candidate, index) =>
        index === 0 || !candidate.equals(candidates[index - 1] as Temporal.PlainDateTime),
    ),
  );
}

function buildSegment(
  wallRange: PlainDateTimeInterval,
  environment: ZonedTimeEnvironment,
  day: ZonedDayRange,
): ZonedDaySlotSegment {
  const projection = resolveZonedWallTime(wallRange.start, environment);
  const wallDuration = wallRange.start.until(wallRange.end, { largestUnit: "hour" });
  const occurrences: ZonedDaySlotOccurrence[] = [];

  if (day.interval !== null) {
    for (const start of projection.occurrences) {
      const interval = intersectInstantIntervals(
        instantInterval(start.instant, start.instant.add(wallDuration)),
        day.interval,
      );
      if (interval !== null) {
        occurrences.push(Object.freeze({ interval, key: start.key, start }));
      }
    }
  }
  const physicalDurationNanoseconds = occurrences.reduce(
    (total, item) =>
      total + item.interval.end.epochNanoseconds - item.interval.start.epochNanoseconds,
    0n,
  );

  return Object.freeze({
    key: `${projection.key}|segment-end:${wallRange.end.toString({ smallestUnit: "nanosecond" })}`,
    kind: projection.kind,
    occurrences: Object.freeze(occurrences),
    physicalDurationNanoseconds,
    projection,
    wallRange,
  });
}

function carryoverOccurrences(
  day: ZonedDayRange,
  slots: readonly ZonedDaySlot[],
): readonly ZonedDaySlotOccurrence[] {
  if (day.interval === null) {
    return Object.freeze([]);
  }

  const represented = slots
    .flatMap((slot) => slot.segments.flatMap((segment) => segment.occurrences))
    .toSorted((left, right) => compareInstants(left.interval.start, right.interval.start));
  const carryover: ZonedDaySlotOccurrence[] = [];
  let cursor = day.start;

  for (const occurrence of represented) {
    if (compareInstants(occurrence.interval.end, cursor) <= 0) {
      continue;
    }
    if (compareInstants(cursor, occurrence.interval.start) < 0) {
      carryover.push(carryoverOccurrence(cursor, occurrence.interval.start, day.timeZone));
    }
    if (compareInstants(cursor, occurrence.interval.end) < 0) {
      cursor = occurrence.interval.end;
    }
  }

  if (compareInstants(cursor, day.end) < 0) {
    carryover.push(carryoverOccurrence(cursor, day.end, day.timeZone));
  }

  return Object.freeze(carryover);
}

/**
 * Builds a nominal wall-clock grid. Gaps have zero occurrences, folds have two, and a timezone
 * transition inside a configured slot produces explicit sub-segments.
 */
export function slotsInZonedDay(
  date: Temporal.PlainDate,
  options: ZonedDaySlotsOptions,
): ZonedDaySlots {
  const step = positiveTimeDuration(options.slotDuration, "invalid-zoned-slot-duration");
  const limit = slotLimit(options.limit ?? DEFAULT_ZONED_SLOT_LIMIT);
  const slotCount = (NOMINAL_DAY_NANOSECONDS + step.nanoseconds - 1n) / step.nanoseconds;
  if (slotCount > BigInt(limit)) {
    throw new RangeError("zoned-slot-limit-exceeded");
  }

  const day = zonedDayRange(date, options.timeZone);
  const environment = {
    disambiguation: options.disambiguation,
    timeZone: day.timeZone,
  } as const;
  const transitions = zonedDayTransitions(date, day.timeZone);
  const wallDayStart = date.toPlainDateTime();
  const slots: ZonedDaySlot[] = [];

  for (let startOffset = 0n; startOffset < NOMINAL_DAY_NANOSECONDS;) {
    const endOffset =
      startOffset + step.nanoseconds < NOMINAL_DAY_NANOSECONDS
        ? startOffset + step.nanoseconds
        : NOMINAL_DAY_NANOSECONDS;
    const wallStart = wallDayStart.add({ nanoseconds: Number(startOffset) });
    const wallEnd = wallDayStart.add({ nanoseconds: Number(endOffset) });
    const wallRange = plainDateTimeInterval(wallStart, wallEnd);
    const boundaries = segmentBoundaries(wallRange, transitions);
    const segments: ZonedDaySlotSegment[] = [];

    for (let index = 1; index < boundaries.length; index += 1) {
      segments.push(
        buildSegment(
          plainDateTimeInterval(boundaries[index - 1]!, boundaries[index]!),
          environment,
          day,
        ),
      );
    }

    const physicalDurationNanoseconds = segments.reduce(
      (total, segment) => total + segment.physicalDurationNanoseconds,
      0n,
    );
    slots.push(
      Object.freeze({
        index: slots.length,
        key: zonedWallTimeKeyForTimeZoneId(wallStart, day.timeZone),
        kind: segments.length === 1 ? segments[0]!.kind : "transition",
        physicalDurationNanoseconds,
        segments: Object.freeze(segments),
        wallRange,
      }),
    );
    startOffset = endOffset;
  }

  const frozenSlots = Object.freeze(slots);
  const carryover = carryoverOccurrences(day, frozenSlots);

  return Object.freeze({
    carryoverOccurrences: carryover,
    day,
    disambiguation: options.disambiguation,
    physicalDurationNanoseconds: day.durationNanoseconds,
    slotDuration: step.duration,
    slotDurationNanoseconds: step.nanoseconds,
    slots: frozenSlots,
    timeZone: day.timeZone,
    transitions,
  });
}
