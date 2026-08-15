const validatedHalfOpenInterval: unique symbol = Symbol("validated-half-open-interval");

export type HalfOpenIntervalComparator<TPoint> = (left: TPoint, right: TPoint) => number;

export type HalfOpenInterval<TPoint, TKind extends string> = Readonly<{
  end: TPoint;
  start: TPoint;
  [validatedHalfOpenInterval]: TKind;
}>;

export type InstantInterval = HalfOpenInterval<Temporal.Instant, "instant">;
export type PlainDateInterval = HalfOpenInterval<Temporal.PlainDate, "plain-date">;
export type PlainDateTimeInterval = HalfOpenInterval<Temporal.PlainDateTime, "plain-date-time">;

export interface HalfOpenIntervalIssue<TPoint> {
  readonly code: "start-not-before-end";
  readonly end: TPoint;
  readonly start: TPoint;
}

export type HalfOpenIntervalValidation<TPoint, TKind extends string> =
  | {
      readonly interval: HalfOpenInterval<TPoint, TKind>;
      readonly valid: true;
    }
  | {
      readonly issue: HalfOpenIntervalIssue<TPoint>;
      readonly valid: false;
    };

export class InvalidHalfOpenIntervalError<TPoint> extends RangeError {
  readonly code = "start-not-before-end";
  readonly end: TPoint;
  readonly start: TPoint;

  constructor(start: TPoint, end: TPoint) {
    super("start-not-before-end");
    this.name = "InvalidHalfOpenIntervalError";
    this.start = start;
    this.end = end;
  }
}

export function validateHalfOpenInterval<TPoint, const TKind extends string>(
  kind: TKind,
  start: TPoint,
  end: TPoint,
  compare: HalfOpenIntervalComparator<TPoint>,
): HalfOpenIntervalValidation<TPoint, TKind> {
  if (!(compare(start, end) < 0)) {
    return {
      valid: false,
      issue: { code: "start-not-before-end", start, end },
    };
  }

  return {
    valid: true,
    interval: Object.freeze({
      start,
      end,
      [validatedHalfOpenInterval]: kind,
    }),
  };
}

export function halfOpenInterval<TPoint, const TKind extends string>(
  kind: TKind,
  start: TPoint,
  end: TPoint,
  compare: HalfOpenIntervalComparator<TPoint>,
): HalfOpenInterval<TPoint, TKind> {
  const validation = validateHalfOpenInterval(kind, start, end, compare);
  if (!validation.valid) {
    throw new InvalidHalfOpenIntervalError(start, end);
  }

  return validation.interval;
}

export function compareInstants(left: Temporal.Instant, right: Temporal.Instant): number {
  return globalThis.Temporal.Instant.compare(left, right);
}

export function comparePlainDates(left: Temporal.PlainDate, right: Temporal.PlainDate): number {
  return globalThis.Temporal.PlainDate.compare(left, right);
}

export function comparePlainDateTimes(
  left: Temporal.PlainDateTime,
  right: Temporal.PlainDateTime,
): number {
  return globalThis.Temporal.PlainDateTime.compare(left, right);
}

export function comparePlainTimes(left: Temporal.PlainTime, right: Temporal.PlainTime): number {
  return globalThis.Temporal.PlainTime.compare(left, right);
}

export function instantInterval(start: Temporal.Instant, end: Temporal.Instant): InstantInterval {
  return halfOpenInterval("instant", start, end, compareInstants);
}

export function plainDateInterval(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): PlainDateInterval {
  return halfOpenInterval("plain-date", start, end, comparePlainDates);
}

export function plainDateTimeInterval(
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
): PlainDateTimeInterval {
  return halfOpenInterval("plain-date-time", start, end, comparePlainDateTimes);
}
