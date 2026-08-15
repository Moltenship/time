import { positiveTimeDuration } from "../internal/time-duration.ts";
import {
  comparePlainDateTimes,
  instantInterval,
  plainDateTimeInterval,
  type InstantInterval,
  type PlainDateTimeInterval,
} from "../intervals/half-open.ts";
import {
  zonedDayRange,
  zonedDayTransitions,
  type ZonedDayRange,
  type ZonedOffsetTransition,
} from "./day.ts";
import { zonedWallTimeKeyForTimeZoneId } from "./machine-keys.ts";
import {
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
  readonly day: ZonedDayRange;
  readonly disambiguation: ZonedTimeEnvironment["disambiguation"];
  readonly slotDuration: Temporal.Duration;
  readonly slotDurationNanoseconds: bigint;
  readonly slots: readonly ZonedDaySlot[];
  readonly timeZone: string;
  readonly transitions: readonly ZonedOffsetTransition[];
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
): ZonedDaySlotSegment {
  const projection = resolveZonedWallTime(wallRange.start, environment);
  const wallDuration = wallRange.start.until(wallRange.end, { largestUnit: "hour" });
  const occurrences = projection.occurrences.map((start) => {
    const end = start.instant.add(wallDuration);
    return Object.freeze({
      interval: instantInterval(start.instant, end),
      key: start.key,
      start,
    });
  });
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

  return Object.freeze({
    day,
    disambiguation: options.disambiguation,
    slotDuration: step.duration,
    slotDurationNanoseconds: step.nanoseconds,
    slots: Object.freeze(slots),
    timeZone: day.timeZone,
    transitions,
  });
}
