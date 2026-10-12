# @moltenship/calendar-temporal API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-temporal`

```ts
interface AvailableZonedDayRange extends ZonedDayRangeBase {
  readonly interval: InstantInterval;
  readonly kind: "available";
}
interface CalendarClock {
  instant(): Temporal.Instant;
}
export declare const DEFAULT_INSTANT_ITERATION_LIMIT = 10000;
export declare const DEFAULT_PLAIN_DATE_ITERATION_LIMIT = 10000;
export declare const DEFAULT_ZONED_DAY_SPLIT_LIMIT = 10000;
export declare const DEFAULT_ZONED_SLOT_LIMIT = 10000;
type HalfOpenInterval<TPoint, TKind extends string> = Readonly<{
  end: TPoint;
  start: TPoint;
  [validatedHalfOpenInterval]: TKind;
}>;
type HalfOpenIntervalComparator<TPoint> = (left: TPoint, right: TPoint) => number;
interface HalfOpenIntervalIssue<TPoint> {
  readonly code: "start-not-before-end";
  readonly end: TPoint;
  readonly start: TPoint;
}
type HalfOpenIntervalSplit<TInterval> = readonly [interval: TInterval] | readonly [before: TInterval, after: TInterval];
type HalfOpenIntervalValidation<TPoint, TKind extends string> = {
  readonly interval: HalfOpenInterval<TPoint, TKind>;
  readonly valid: true;
} | {
  readonly issue: HalfOpenIntervalIssue<TPoint>;
  readonly valid: false;
};
type InstantInterval = HalfOpenInterval<Temporal.Instant, "instant">;
interface InstantIterationOptions {
  readonly limit?: number;
  readonly step: Temporal.DurationLike;
}
type InstantRoundingMode = NonNullable<Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]>;
interface InstantRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: InstantRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}
export declare class InvalidHalfOpenIntervalError<TPoint> extends RangeError {
  readonly code = "start-not-before-end";
  readonly end: TPoint;
  readonly start: TPoint;
  constructor(start: TPoint, end: TPoint);
}
interface MonthGrid {
  readonly month: Temporal.PlainDate;
  readonly range: PlainDateInterval;
  readonly weeks: readonly PlainDateInterval[];
}
interface MonthGridOptions extends WeekRangeOptions {
  readonly fixedWeeks?: boolean;
}
type PlainDateInterval = HalfOpenInterval<Temporal.PlainDate, "plain-date">;
interface PlainDateIterationOptions {
  readonly limit?: number;
  readonly stepDays?: number;
}
type PlainDateTimeInterval = HalfOpenInterval<Temporal.PlainDateTime, "plain-date-time">;
type PlainTimeRoundingMode = NonNullable<Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]>;
interface PlainTimeRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: PlainTimeRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}
interface RejectedZonedWallTimeProjection extends ZonedWallTimeProjectionBase {
  readonly adjustment: null;
  readonly kind: "fold" | "gap";
  readonly selected: null;
  readonly selectedBy: null;
  readonly status: "rejected";
}
interface ResolvedZonedWallTimeProjection extends ZonedWallTimeProjectionBase {
  readonly adjustment: ZonedWallTimeAdjustment | null;
  readonly selected: ZonedWallTimeOccurrence;
  readonly selectedBy: ZonedWallTimeSelection;
  readonly status: "resolved";
}
interface SkippedZonedDayRange extends ZonedDayRangeBase {
  readonly interval: null;
  readonly kind: "skipped";
}
interface SnappedPlainTime {
  readonly days: 0 | 1;
  readonly time: Temporal.PlainTime;
}
interface SplitInstantRangeByZonedDayOptions {
  readonly limit?: number;
}
type TemporalDisambiguation = NonNullable<Temporal.DisambiguationOptions["disambiguation"]>;
type WallTimeSnapMode = "ceil" | "floor" | "nearest";
interface WallTimeSnapOptions {
  readonly increment: number;
  readonly mode?: WallTimeSnapMode;
  readonly smallestUnit: Temporal.TimeUnit;
}
interface WeekRangeOptions {
  readonly weekStartsOn: WeekStartsOn;
}
type WeekStartsOn = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ZonedDayRange = AvailableZonedDayRange | SkippedZonedDayRange;
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
interface ZonedDaySlot {
  readonly index: number;
  readonly key: string;
  readonly kind: ZonedWallTimeKind | "transition";
  readonly physicalDurationNanoseconds: bigint;
  readonly segments: readonly ZonedDaySlotSegment[];
  readonly wallRange: PlainDateTimeInterval;
}
interface ZonedDaySlotOccurrence {
  readonly interval: InstantInterval;
  readonly key: string;
  readonly start: ZonedWallTimeOccurrence;
}
interface ZonedDaySlotSegment {
  readonly key: string;
  readonly kind: ZonedWallTimeKind;
  readonly occurrences: readonly ZonedDaySlotOccurrence[];
  readonly physicalDurationNanoseconds: bigint;
  readonly projection: ZonedWallTimeProjection;
  readonly wallRange: PlainDateTimeInterval;
}
interface ZonedDaySlots {
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
interface ZonedDaySlotsOptions extends ZonedTimeEnvironment {
  readonly limit?: number;
  readonly slotDuration: Temporal.DurationLike;
}
interface ZonedDaySplit {
  readonly continuesAfterDay: boolean;
  readonly continuesBeforeDay: boolean;
  readonly date: Temporal.PlainDate;
  readonly day: AvailableZonedDayRange;
  readonly interval: InstantInterval;
  readonly key: string;
  readonly timeZone: string;
}
interface ZonedInstantProjection {
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly offset: string;
  readonly offsetNanoseconds: number;
  readonly timeZone: string;
  readonly wallTime: Temporal.PlainDateTime;
  readonly wallTimeKey: string;
  readonly zonedDateTime: Temporal.ZonedDateTime;
}
interface ZonedOffsetTransition {
  readonly affectedWallRange: PlainDateTimeInterval;
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly kind: "fold" | "gap";
  readonly offsetAfter: string;
  readonly offsetBefore: string;
  readonly offsetDeltaNanoseconds: number;
  readonly timeZone: string;
}
interface ZonedTimeEnvironment {
  readonly disambiguation: TemporalDisambiguation;
  readonly timeZone: string;
}
interface ZonedWallTimeAdjustment {
  readonly direction: "earlier" | "later";
  readonly requestedWallTime: Temporal.PlainDateTime;
  readonly resolvedWallTime: Temporal.PlainDateTime;
  readonly wallTimeDelta: Temporal.Duration;
}
type ZonedWallTimeKind = "fold" | "gap" | "unique";
interface ZonedWallTimeOccurrence {
  readonly instant: Temporal.Instant;
  readonly key: string;
  readonly offset: string;
  readonly offsetNanoseconds: number;
  readonly wallTime: Temporal.PlainDateTime;
  readonly zonedDateTime: Temporal.ZonedDateTime;
}
type ZonedWallTimeProjection = RejectedZonedWallTimeProjection | ResolvedZonedWallTimeProjection;
interface ZonedWallTimeProjectionBase {
  readonly disambiguation: TemporalDisambiguation;
  readonly key: string;
  readonly kind: ZonedWallTimeKind;
  readonly occurrences: readonly ZonedWallTimeOccurrence[];
  readonly requestedWallTime: Temporal.PlainDateTime;
  readonly timeZone: string;
}
type ZonedWallTimeSelection = "earlier" | "later" | "unique";
interface ZonedWallTimeSnapOptions extends WallTimeSnapOptions {
  readonly fold?: "earlier" | "later";
  readonly timeZone: string;
}
export declare function compareInstants(left: Temporal.Instant, right: Temporal.Instant): number;
export declare function comparePlainDateTimes(left: Temporal.PlainDateTime, right: Temporal.PlainDateTime): number;
export declare function comparePlainDates(left: Temporal.PlainDate, right: Temporal.PlainDate): number;
export declare function comparePlainTimes(left: Temporal.PlainTime, right: Temporal.PlainTime): number;
export declare function createFixedClock(instant: Temporal.Instant): CalendarClock;
export declare function createSystemClock(): CalendarClock;
export declare function halfOpenInterval<TPoint, const TKind extends string>(kind: TKind, start: TPoint, end: TPoint, compare: HalfOpenIntervalComparator<TPoint>): HalfOpenInterval<TPoint, TKind>;
export declare function instantInterval(start: Temporal.Instant, end: Temporal.Instant): InstantInterval;
export declare function instantIntervalContains(interval: InstantInterval, instant: Temporal.Instant): boolean;
export declare function instantIntervalContainsInterval(outer: InstantInterval, inner: InstantInterval): boolean;
export declare function instantIntervalsIntersect(left: InstantInterval, right: InstantInterval): boolean;
export declare function instantKey(instant: Temporal.Instant): string;
export declare function intersectInstantIntervals(left: InstantInterval, right: InstantInterval): InstantInterval | null;
export declare function intersectPlainDateIntervals(left: PlainDateInterval, right: PlainDateInterval): PlainDateInterval | null;
export declare function intersectPlainDateTimeIntervals(left: PlainDateTimeInterval, right: PlainDateTimeInterval): PlainDateTimeInterval | null;
export declare function iterateInstants(range: InstantInterval, options: InstantIterationOptions): Generator<Temporal.Instant, void, undefined>;
export declare function iteratePlainDates(range: PlainDateInterval, options?: PlainDateIterationOptions): Generator<Temporal.PlainDate, void, undefined>;
export declare function monthGrid(date: Temporal.PlainDate, options: MonthGridOptions): MonthGrid;
export declare function plainDateInterval(start: Temporal.PlainDate, end: Temporal.PlainDate): PlainDateInterval;
export declare function plainDateIntervalContains(interval: PlainDateInterval, date: Temporal.PlainDate): boolean;
export declare function plainDateIntervalContainsInterval(outer: PlainDateInterval, inner: PlainDateInterval): boolean;
export declare function plainDateIntervalsIntersect(left: PlainDateInterval, right: PlainDateInterval): boolean;
export declare function plainDateKey(date: Temporal.PlainDate): string;
export declare function plainDateTimeInterval(start: Temporal.PlainDateTime, end: Temporal.PlainDateTime): PlainDateTimeInterval;
export declare function plainDateTimeIntervalContains(interval: PlainDateTimeInterval, dateTime: Temporal.PlainDateTime): boolean;
export declare function plainDateTimeIntervalContainsInterval(outer: PlainDateTimeInterval, inner: PlainDateTimeInterval): boolean;
export declare function plainDateTimeIntervalsIntersect(left: PlainDateTimeInterval, right: PlainDateTimeInterval): boolean;
export declare function plainDateTimeKey(dateTime: Temporal.PlainDateTime): string;
export declare function projectInstantToZonedTime(instant: Temporal.Instant, timeZone: string): ZonedInstantProjection;
export declare function resolveZonedWallTime(requestedWallTime: Temporal.PlainDateTime, environment: ZonedTimeEnvironment): ZonedWallTimeProjection;
export declare function roundInstant(instant: Temporal.Instant, options: InstantRoundingOptions): Temporal.Instant;
export declare function roundPlainTime(time: Temporal.PlainTime, options: PlainTimeRoundingOptions): Temporal.PlainTime;
export declare function slotsInZonedDay(date: Temporal.PlainDate, options: ZonedDaySlotsOptions): ZonedDaySlots;
export declare function snapPlainTime(time: Temporal.PlainTime, options: WallTimeSnapOptions): SnappedPlainTime;
export declare function snapZonedDateTime(zonedDateTime: Temporal.ZonedDateTime, options: WallTimeSnapOptions): Temporal.ZonedDateTime;
export declare function snapZonedWallTime(wallTime: Temporal.PlainDateTime, options: ZonedWallTimeSnapOptions): Temporal.ZonedDateTime;
export declare function splitInstantInterval(interval: InstantInterval, splitAt: Temporal.Instant): HalfOpenIntervalSplit<InstantInterval>;
export declare function splitInstantRangeByZonedDay(range: InstantInterval, timeZone: string, options?: SplitInstantRangeByZonedDayOptions): readonly ZonedDaySplit[];
export declare function splitPlainDateInterval(interval: PlainDateInterval, splitAt: Temporal.PlainDate): HalfOpenIntervalSplit<PlainDateInterval>;
export declare function splitPlainDateTimeInterval(interval: PlainDateTimeInterval, splitAt: Temporal.PlainDateTime): HalfOpenIntervalSplit<PlainDateTimeInterval>;
export declare function validateHalfOpenInterval<TPoint, const TKind extends string>(kind: TKind, start: TPoint, end: TPoint, compare: HalfOpenIntervalComparator<TPoint>): HalfOpenIntervalValidation<TPoint, TKind>;
declare const validatedHalfOpenInterval: unique symbol;
export declare function weekRange(date: Temporal.PlainDate, options: WeekRangeOptions): PlainDateInterval;
export declare function zonedDayKey(date: Temporal.PlainDate, timeZone: string): string;
export declare function zonedDayRange(date: Temporal.PlainDate, timeZone: string): ZonedDayRange;
export declare function zonedDayTransitions(date: Temporal.PlainDate, timeZone: string): readonly ZonedOffsetTransition[];
export declare function zonedWallTimeKey(dateTime: Temporal.PlainDateTime, timeZone: string): string;

export {
  type AvailableZonedDayRange,
  type CalendarClock,
  type HalfOpenInterval,
  type HalfOpenIntervalComparator,
  type HalfOpenIntervalIssue,
  type HalfOpenIntervalSplit,
  type HalfOpenIntervalValidation,
  type InstantInterval,
  type InstantIterationOptions,
  type InstantRoundingMode,
  type InstantRoundingOptions,
  type MonthGrid,
  type MonthGridOptions,
  type PlainDateInterval,
  type PlainDateIterationOptions,
  type PlainDateTimeInterval,
  type PlainTimeRoundingMode,
  type PlainTimeRoundingOptions,
  type RejectedZonedWallTimeProjection,
  type ResolvedZonedWallTimeProjection,
  type SkippedZonedDayRange,
  type SnappedPlainTime,
  type SplitInstantRangeByZonedDayOptions,
  type TemporalDisambiguation,
  type WallTimeSnapMode,
  type WallTimeSnapOptions,
  type WeekRangeOptions,
  type WeekStartsOn,
  type ZonedDayRange,
  type ZonedDaySlot,
  type ZonedDaySlotOccurrence,
  type ZonedDaySlotSegment,
  type ZonedDaySlots,
  type ZonedDaySlotsOptions,
  type ZonedDaySplit,
  type ZonedInstantProjection,
  type ZonedOffsetTransition,
  type ZonedTimeEnvironment,
  type ZonedWallTimeAdjustment,
  type ZonedWallTimeKind,
  type ZonedWallTimeOccurrence,
  type ZonedWallTimeProjection,
  type ZonedWallTimeSelection,
  type ZonedWallTimeSnapOptions,
};
```
