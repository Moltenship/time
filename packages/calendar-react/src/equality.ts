import type { CalendarWeekRules } from "@moltenship/calendar-core";
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
