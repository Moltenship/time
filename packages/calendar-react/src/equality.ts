import type {
  AvailabilityHours,
  CalendarAvailability,
  CalendarWeekRules,
} from "@moltenship/calendar-core";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";

export function sameElements<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((value, index) => Object.is(value, right[index])))
  );
}

/** Compares own enumerable properties with `Object.is`; non-objects compare with `Object.is`. */
export function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && Object.is(left[key as keyof T], right[key as keyof T]),
    )
  );
}

export function samePlainDate(
  left: Temporal.PlainDate | null | undefined,
  right: Temporal.PlainDate | null | undefined,
): boolean {
  return left === right || (left != null && right != null && left.equals(right));
}

export function sameInstant(
  left: Temporal.Instant | undefined,
  right: Temporal.Instant | undefined,
): boolean {
  return left === right || (left !== undefined && right !== undefined && left.equals(right));
}

export function sameRange(
  left: PlainDateInterval | undefined,
  right: PlainDateInterval | undefined,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.start.equals(right.start) &&
      left.end.equals(right.end))
  );
}

export function sameWeekRules(left: CalendarWeekRules, right: CalendarWeekRules): boolean {
  return (
    left === right ||
    (left.firstDay === right.firstDay &&
      left.minimalDays === right.minimalDays &&
      sameElements(left.weekend, right.weekend))
  );
}

function sameList<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  same: (left: T, right: T) => boolean,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.length === right.length &&
      left.every((value, index) => same(value, right[index]!)))
  );
}

/** Temporal dates and times by value; anything else, such as invalid input, by identity. */
function sameTemporal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Temporal.PlainTime) {
    return right instanceof Temporal.PlainTime && left.equals(right);
  }
  return (
    left instanceof Temporal.PlainDate && right instanceof Temporal.PlainDate && left.equals(right)
  );
}

function sameHours(left: AvailabilityHours, right: AvailabilityHours): boolean {
  return sameTemporal(left.start, right.start) && sameTemporal(left.end, right.end);
}

/** Compares working hours by value, so an inline `availability` keeps its shading cached. */
export function sameAvailability(
  left: CalendarAvailability | undefined,
  right: CalendarAvailability | undefined,
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.timeZone === right.timeZone &&
      sameList(
        left.weekly,
        right.weekly,
        (a, b) => sameHours(a, b) && sameList(a.days, b.days, Object.is),
      ) &&
      sameList(
        left.exceptions,
        right.exceptions,
        (a, b) =>
          sameTemporal(a.date, b.date) &&
          a.label === b.label &&
          sameList(a.hours, b.hours, sameHours),
      ))
  );
}
