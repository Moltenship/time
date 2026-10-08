import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
  type HalfOpenIntervalComparator,
  type InstantInterval,
  type PlainDateInterval,
  type PlainDateTimeInterval,
} from "./half-open";

interface IntervalEndpoints<TPoint> {
  readonly end: TPoint;
  readonly start: TPoint;
}

export type HalfOpenIntervalSplit<TInterval> =
  | readonly [interval: TInterval]
  | readonly [before: TInterval, after: TInterval];

function intervalContainsPoint<TPoint>(
  interval: IntervalEndpoints<TPoint>,
  point: TPoint,
  compare: HalfOpenIntervalComparator<TPoint>,
): boolean {
  return compare(interval.start, point) <= 0 && compare(point, interval.end) < 0;
}

function intervalContainsInterval<TPoint>(
  outer: IntervalEndpoints<TPoint>,
  inner: IntervalEndpoints<TPoint>,
  compare: HalfOpenIntervalComparator<TPoint>,
): boolean {
  return compare(outer.start, inner.start) <= 0 && compare(inner.end, outer.end) <= 0;
}

function intervalsIntersect<TPoint>(
  left: IntervalEndpoints<TPoint>,
  right: IntervalEndpoints<TPoint>,
  compare: HalfOpenIntervalComparator<TPoint>,
): boolean {
  return compare(left.start, right.end) < 0 && compare(left.end, right.start) > 0;
}

function intersectIntervals<TPoint, TInterval extends IntervalEndpoints<TPoint>>(
  left: TInterval,
  right: TInterval,
  compare: HalfOpenIntervalComparator<TPoint>,
  construct: (start: TPoint, end: TPoint) => TInterval,
): TInterval | null {
  const start = compare(left.start, right.start) >= 0 ? left.start : right.start;
  const end = compare(left.end, right.end) <= 0 ? left.end : right.end;

  return compare(start, end) < 0 ? construct(start, end) : null;
}

function splitInterval<TPoint, TInterval extends IntervalEndpoints<TPoint>>(
  interval: TInterval,
  splitAt: TPoint,
  compare: HalfOpenIntervalComparator<TPoint>,
  construct: (start: TPoint, end: TPoint) => TInterval,
): HalfOpenIntervalSplit<TInterval> {
  if (compare(splitAt, interval.start) <= 0 || compare(splitAt, interval.end) >= 0) {
    return Object.freeze([interval] as const);
  }

  return Object.freeze([
    construct(interval.start, splitAt),
    construct(splitAt, interval.end),
  ] as const);
}

/** Tests whether an instant belongs to an instant interval using `[start, end)` semantics. */
export function instantIntervalContains(
  interval: InstantInterval,
  instant: Temporal.Instant,
): boolean {
  return intervalContainsPoint(interval, instant, compareInstants);
}

/** Tests whether a date belongs to a date interval using `[start, end)` semantics. */
export function plainDateIntervalContains(
  interval: PlainDateInterval,
  date: Temporal.PlainDate,
): boolean {
  return intervalContainsPoint(interval, date, comparePlainDates);
}

/** Tests whether a date-time belongs to a date-time interval using `[start, end)` semantics. */
export function plainDateTimeIntervalContains(
  interval: PlainDateTimeInterval,
  dateTime: Temporal.PlainDateTime,
): boolean {
  return intervalContainsPoint(interval, dateTime, comparePlainDateTimes);
}

export function instantIntervalContainsInterval(
  outer: InstantInterval,
  inner: InstantInterval,
): boolean {
  return intervalContainsInterval(outer, inner, compareInstants);
}

export function plainDateIntervalContainsInterval(
  outer: PlainDateInterval,
  inner: PlainDateInterval,
): boolean {
  return intervalContainsInterval(outer, inner, comparePlainDates);
}

export function plainDateTimeIntervalContainsInterval(
  outer: PlainDateTimeInterval,
  inner: PlainDateTimeInterval,
): boolean {
  return intervalContainsInterval(outer, inner, comparePlainDateTimes);
}

export function instantIntervalsIntersect(left: InstantInterval, right: InstantInterval): boolean {
  return intervalsIntersect(left, right, compareInstants);
}

export function plainDateIntervalsIntersect(
  left: PlainDateInterval,
  right: PlainDateInterval,
): boolean {
  return intervalsIntersect(left, right, comparePlainDates);
}

export function plainDateTimeIntervalsIntersect(
  left: PlainDateTimeInterval,
  right: PlainDateTimeInterval,
): boolean {
  return intervalsIntersect(left, right, comparePlainDateTimes);
}

export function intersectInstantIntervals(
  left: InstantInterval,
  right: InstantInterval,
): InstantInterval | null {
  return intersectIntervals(left, right, compareInstants, instantInterval);
}

export function intersectPlainDateIntervals(
  left: PlainDateInterval,
  right: PlainDateInterval,
): PlainDateInterval | null {
  return intersectIntervals(left, right, comparePlainDates, plainDateInterval);
}

export function intersectPlainDateTimeIntervals(
  left: PlainDateTimeInterval,
  right: PlainDateTimeInterval,
): PlainDateTimeInterval | null {
  return intersectIntervals(left, right, comparePlainDateTimes, plainDateTimeInterval);
}

/** Splits only at an interior instant; endpoints and out-of-range points preserve the input. */
export function splitInstantInterval(
  interval: InstantInterval,
  splitAt: Temporal.Instant,
): HalfOpenIntervalSplit<InstantInterval> {
  return splitInterval(interval, splitAt, compareInstants, instantInterval);
}

/** Splits only at an interior date; endpoints and out-of-range dates preserve the input. */
export function splitPlainDateInterval(
  interval: PlainDateInterval,
  splitAt: Temporal.PlainDate,
): HalfOpenIntervalSplit<PlainDateInterval> {
  return splitInterval(interval, splitAt, comparePlainDates, plainDateInterval);
}

/** Splits only at an interior date-time; endpoints and out-of-range points preserve the input. */
export function splitPlainDateTimeInterval(
  interval: PlainDateTimeInterval,
  splitAt: Temporal.PlainDateTime,
): HalfOpenIntervalSplit<PlainDateTimeInterval> {
  return splitInterval(interval, splitAt, comparePlainDateTimes, plainDateTimeInterval);
}
