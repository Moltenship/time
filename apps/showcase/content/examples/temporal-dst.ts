// #region day
import {
  resolveZonedWallTime,
  slotsInZonedDay,
  snapZonedWallTime,
  zonedDayRange,
} from "@moltenship/calendar-temporal";

/** How many hours a date lasts in a time zone: 23, 24 or 25 in most of them. */
export function hoursInDay(date: Temporal.PlainDate, timeZone: string): number {
  return zonedDayRange(date, timeZone).duration.total("hours");
}
// #endregion day

// #region query
/** Whether an event's instants overlap a date in a time zone. */
export function isOnDate(
  event: { readonly start: Temporal.Instant; readonly end: Temporal.Instant },
  date: Temporal.PlainDate,
  timeZone: string,
): boolean {
  const day = zonedDayRange(date, timeZone);
  // A few zones have skipped a whole date. Such a date has no instants to compare with.
  if (day.kind === "skipped") return false;
  return (
    Temporal.Instant.compare(event.start, day.interval.end) < 0 &&
    Temporal.Instant.compare(event.end, day.interval.start) > 0
  );
}
// #endregion query

// #region rows
export interface HourRow {
  /** The time on the wall clock, such as "02:00". */
  readonly label: string;
  /** "gap" for an hour the clocks skip, "fold" for one they repeat, else "unique". */
  readonly kind: string;
  /** When the row starts: no instant in a gap, two in a fold. */
  readonly starts: readonly Temporal.Instant[];
}

/** The hour rows of a day view. Every day has the same 24 labels, whatever its length. */
export function hourRows(date: Temporal.PlainDate, timeZone: string): HourRow[] {
  const { slots } = slotsInZonedDay(date, {
    timeZone,
    disambiguation: "compatible",
    slotDuration: { hours: 1 },
  });
  return slots.map((slot) => ({
    label: slot.wallRange.start.toPlainTime().toString({ smallestUnit: "minute" }),
    kind: slot.kind,
    starts: slot.segments.flatMap((segment) =>
      segment.occurrences.map((occurrence) => occurrence.interval.start),
    ),
  }));
}
// #endregion rows

// #region pick
export type PickedTime =
  | { readonly ok: true; readonly instant: Temporal.Instant }
  | { readonly ok: false; readonly reason: string };

/** The instant of a date and time a person typed into a form. */
export function pickTime(wallTime: Temporal.PlainDateTime, timeZone: string): PickedTime {
  const result = resolveZonedWallTime(wallTime, { timeZone, disambiguation: "compatible" });

  if (result.status === "rejected") return { ok: false, reason: "That time can't be used." };
  if (result.kind === "gap") {
    // The clocks skipped this time. `adjustment` has the time "compatible" moved it to.
    const moved = result.adjustment?.resolvedWallTime.toPlainTime().toString({
      smallestUnit: "minute",
    });
    return { ok: false, reason: `The clocks skip that time. Did you mean ${moved}?` };
  }
  // In a fold the time happens twice, and `selected` is the first of `occurrences`.
  return { ok: true, instant: result.selected.instant };
}
// #endregion pick

// #region snap
/** A pointer's position on a day view, rounded to the 15-minute grid. */
export function snapToGrid(wallTime: Temporal.PlainDateTime, timeZone: string) {
  return snapZonedWallTime(wallTime, { timeZone, increment: 15, smallestUnit: "minute" });
}
// #endregion snap
