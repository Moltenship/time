import type { IcsWeekdayNumber } from "@moltenship/ics";

import { weekdayNumbers } from "../internal/dates";

/**
 * How a move rewrites a rule's ordinal weekdays, such as the 2nd Tuesday to the 2nd Wednesday. Each
 * occurrence stays in its month (or year) and becomes the new weekday there, which isn't always a
 * fixed number of days away.
 */
export interface RecurrenceOrdinalShift {
  readonly entries: readonly { readonly from: IcsWeekdayNumber; readonly to: IcsWeekdayNumber }[];
  /** What the ordinals count within. */
  readonly period: "month" | "year";
}

function position(date: Temporal.PlainDate, period: RecurrenceOrdinalShift["period"]) {
  return period === "month"
    ? { index: date.day, length: date.daysInMonth, start: date.with({ day: 1 }) }
    : { index: date.dayOfYear, length: date.daysInYear, start: date.with({ day: 1, month: 1 }) };
}

/** Which `ordinal` of its weekday the date is in its period, counted from the end when negative. */
function ordinalOf(
  date: Temporal.PlainDate,
  period: RecurrenceOrdinalShift["period"],
  fromEnd: boolean,
) {
  const { index, length } = position(date, period);
  return fromEnd ? -Math.ceil((length - index + 1) / 7) : Math.ceil(index / 7);
}

/** The `ordinal` `weekday` of the period `date` is in; `undefined` when it has none. */
function nthWeekday(
  date: Temporal.PlainDate,
  period: RecurrenceOrdinalShift["period"],
  { ordinal = 1, weekday }: IcsWeekdayNumber,
): Temporal.PlainDate | undefined {
  const { length, start } = position(date, period);
  const target = weekdayNumbers[weekday];
  let index: number;
  if (ordinal > 0) {
    index = 1 + ((target - start.dayOfWeek + 7) % 7) + (ordinal - 1) * 7;
  } else {
    const last = start.add({ days: length - 1 });
    index = length - ((last.dayOfWeek - target + 7) % 7) - (-ordinal - 1) * 7;
  }
  return index < 1 || index > length ? undefined : start.add({ days: index - 1 });
}

/**
 * Where an occurrence on `date` goes: the new weekday of the same month or year. `undefined` when
 * the date matches no ordinal entry, as an RDATE may not; `null` when the period lacks the new
 * weekday, as a fifth one can.
 */
export function mapOrdinal(
  shift: RecurrenceOrdinalShift,
  date: Temporal.PlainDate,
): Temporal.PlainDate | null | undefined {
  for (const { from, to } of shift.entries) {
    const ordinal = from.ordinal ?? 1;
    if (
      date.dayOfWeek === weekdayNumbers[from.weekday] &&
      ordinalOf(date, shift.period, ordinal < 0) === ordinal
    ) {
      return nthWeekday(date, shift.period, to) ?? null;
    }
  }
  return undefined;
}
