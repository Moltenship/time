import type { CalendarEventBase, CalendarEventIntervalOf } from "@moltenship/calendar-core";

export const BENCHMARK_FIXTURE_SEED = 0x54_49_4d_45;
export const BENCHMARK_EVENT_COUNT = 10_000;
export const BENCHMARK_EVENT_DAY_SPAN = 365;
export const BENCHMARK_RESOURCE_COUNT = 500;

export interface FixtureEventData {
  readonly endUnit: number;
  readonly ordinal: number;
  readonly startUnit: number;
}

export type FixtureEvent = CalendarEventBase<FixtureEventData, string, string> &
  CalendarEventIntervalOf<string, string, string>;

export interface BenchmarkFixtureSet {
  readonly events: readonly FixtureEvent[];
  readonly seed: number;
}

export interface BenchmarkFixtureOptions {
  readonly eventCount?: number;
  /** How many resources the events are spread over. */
  readonly resourceCount?: number;
  readonly seed?: number;
}

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name}-must-be-a-positive-safe-integer`);
  }
}

function padded(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isoDate(dayIndex: number): string {
  let year = 2026;
  let month = 8;
  let remainingDays = dayIndex;

  while (remainingDays >= daysInMonth(year, month)) {
    remainingDays -= daysInMonth(year, month);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return `${padded(year, 4)}-${padded(month, 2)}-${padded(remainingDays + 1, 2)}`;
}

function isoDateTime(minute: number, suffix: "" | "Z"): string {
  const dayIndex = Math.floor(minute / 1_440);
  const minuteOfDay = minute % 1_440;
  const hour = Math.floor(minuteOfDay / 60);
  const minuteOfHour = minuteOfDay % 60;

  return `${isoDate(dayIndex)}T${padded(hour, 2)}:${padded(minuteOfHour, 2)}:00${suffix}`;
}

/** A seeded generator of integers below `upperBound`, so every fixture is the same each run. */
export function createRandom(seed: number): (upperBound: number) => number {
  let state = seed >>> 0;

  return (upperBound: number): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const normalized = (value ^ (value >>> 14)) >>> 0;
    return normalized % upperBound;
  };
}

function resourceId(ordinal: number): string {
  return `resource-${padded(ordinal, 3)}`;
}

function createResourceIds(
  ordinal: number,
  resourceCount: number,
  random: (upperBound: number) => number,
): readonly string[] {
  const count = 1 + (ordinal % 19 === 0 ? 2 : ordinal % 7 === 0 ? 1 : 0);
  const ids = Array.from({ length: count }, (_, index) =>
    resourceId((random(resourceCount) + index * 37) % resourceCount),
  );
  return Object.freeze([...new Set(ids)]);
}

function createEvent(
  ordinal: number,
  resourceCount: number,
  random: (upperBound: number) => number,
): FixtureEvent {
  const id = `event-${padded(ordinal, 5)}`;
  const resourceIds = createResourceIds(ordinal, resourceCount, random);

  if (ordinal % 10 === 0) {
    const startDay = random(BENCHMARK_EVENT_DAY_SPAN);
    const daySpan = 1 + random(5);
    return Object.freeze({
      data: Object.freeze({
        endUnit: (startDay + daySpan) * 1_440,
        ordinal,
        startUnit: startDay * 1_440,
      }),
      end: isoDate(startDay + daySpan),
      id,
      kind: "all-day",
      resourceIds,
      start: isoDate(startDay),
      title: `All-day ${padded(ordinal, 5)}`,
    });
  }

  const clusteredStart = random(BENCHMARK_EVENT_DAY_SPAN) * 1_440 + 8 * 60 + random(24) * 15;
  const duration = 15 * (1 + random(12));

  if (ordinal % 10 === 1) {
    return Object.freeze({
      data: Object.freeze({
        endUnit: clusteredStart + duration,
        ordinal,
        startUnit: clusteredStart,
      }),
      end: isoDateTime(clusteredStart + duration, ""),
      id,
      kind: "floating",
      resourceIds,
      start: isoDateTime(clusteredStart, ""),
      title: `Floating ${padded(ordinal, 5)}`,
    });
  }

  return Object.freeze({
    data: Object.freeze({
      endUnit: clusteredStart + duration,
      ordinal,
      startUnit: clusteredStart,
    }),
    end: isoDateTime(clusteredStart + duration, "Z"),
    id,
    kind: "timed",
    resourceIds,
    sourceTimeZone: ordinal % 3 === 0 ? "America/New_York" : "UTC",
    start: isoDateTime(clusteredStart, "Z"),
    title: `Timed ${padded(ordinal, 5)}`,
  });
}

export function generateBenchmarkFixtures(
  options: BenchmarkFixtureOptions = {},
): BenchmarkFixtureSet {
  const eventCount = options.eventCount ?? BENCHMARK_EVENT_COUNT;
  const resourceCount = options.resourceCount ?? BENCHMARK_RESOURCE_COUNT;
  const seed = options.seed ?? BENCHMARK_FIXTURE_SEED;

  assertCount("event-count", eventCount);
  assertCount("resource-count", resourceCount);
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("seed-must-be-a-safe-integer");
  }

  const random = createRandom(seed);
  const events = Object.freeze(
    Array.from({ length: eventCount }, (_, ordinal) => createEvent(ordinal, resourceCount, random)),
  );

  return Object.freeze({ events, seed });
}
