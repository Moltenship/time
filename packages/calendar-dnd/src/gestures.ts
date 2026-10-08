import {
  createEventPlacement,
  moveEventPlacement,
  resizeEventPlacement,
  timeGridDateTimeAt,
  toAllDayPlacement,
  toTimedPlacement,
  type CalendarEventPlacement,
  type CalendarWallClockDelta,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

/** What the pointer is over: a height in a time-grid column, or a whole day cell. */
export type PointerTarget =
  | { readonly column: TimeGridColumn; readonly kind: "time"; readonly y: number }
  | { readonly date: Temporal.PlainDate; readonly kind: "day" };

export interface GestureOptions {
  readonly snap: WallTimeSnapOptions;
  readonly timeZone: string;
}

/** Length of an all-day event dropped onto a time column. */
const DROPPED_ALL_DAY_DURATION: Temporal.DurationLike = { hours: 1 };

function timeAt(
  target: Extract<PointerTarget, { kind: "time" }>,
  snap: WallTimeSnapOptions,
): Temporal.ZonedDateTime {
  return timeGridDateTimeAt(target.column, target.y, { snap });
}

/** One snap increment, used as a slot length and as the minimum resize. */
function snapDuration({ increment, smallestUnit }: WallTimeSnapOptions): Temporal.Duration {
  const unit = smallestUnit.endsWith("s") ? smallestUnit : `${smallestUnit}s`;
  return Temporal.Duration.from({ [unit]: increment } as Temporal.DurationLike);
}

/** Calendar days plus a time-of-day offset; the two parts may differ in sign. */
function wallClockDelta(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
): CalendarWallClockDelta {
  const time = to.toPlainTime().since(from.toPlainTime());
  return {
    days: from.toPlainDate().until(to.toPlainDate()).days,
    hours: time.hours,
    microseconds: time.microseconds,
    milliseconds: time.milliseconds,
    minutes: time.minutes,
    nanoseconds: time.nanoseconds,
    seconds: time.seconds,
  };
}

/**
 * Where a dragged event lands. Moves within one axis keep the event's kind; dropping a timed event
 * on a day cell makes it all-day, and dropping an all-day event on a time column makes it a
 * one-hour timed event.
 */
export function movedPlacement<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  grab: PointerTarget,
  current: PointerTarget,
  { snap, timeZone }: GestureOptions,
): CalendarEventPlacement<TResourceId> {
  if (current.kind === "day") {
    if (grab.kind === "day") {
      return moveEventPlacement(
        original,
        { days: grab.date.until(current.date).days },
        { timeZone },
      );
    }
    const allDay = toAllDayPlacement(original, { timeZone });
    return moveEventPlacement(
      allDay,
      { days: (allDay.start as Temporal.PlainDate).until(current.date).days },
      { timeZone },
    );
  }

  const at = timeAt(current, snap);
  if (grab.kind === "time") {
    return moveEventPlacement(original, wallClockDelta(timeAt(grab, snap), at), { timeZone });
  }
  if (original.kind === "all-day") return toTimedPlacement(original, at, DROPPED_ALL_DAY_DURATION);
  const start =
    original.kind === "timed"
      ? original.start.toZonedDateTimeISO(timeZone)
      : original.start.toZonedDateTime(timeZone);
  return moveEventPlacement(original, wallClockDelta(start, at), { timeZone });
}

/** The placement after dragging one edge; `null` while the pointer is over the other axis. */
export function resizedPlacement<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  edge: "start" | "end",
  grab: PointerTarget,
  current: PointerTarget,
  { snap, timeZone }: GestureOptions,
): CalendarEventPlacement<TResourceId> | null {
  if (grab.kind === "time" && current.kind === "time") {
    const delta = wallClockDelta(timeAt(grab, snap), timeAt(current, snap));
    return resizeEventPlacement(original, edge, delta, {
      minimumDuration: snapDuration(snap),
      timeZone,
    });
  }
  if (grab.kind === "day" && current.kind === "day") {
    return resizeEventPlacement(
      original,
      edge,
      { days: grab.date.until(current.date).days },
      { timeZone },
    );
  }
  return null;
}

/**
 * The new event spanning the slots or day cells from where the drag started to where it is now;
 * `null` while the pointer is over the other axis.
 */
export function createdPlacement<TResourceId extends ResourceId>(
  anchor: PointerTarget,
  current: PointerTarget,
  { snap }: GestureOptions,
): CalendarEventPlacement<TResourceId> | null {
  if (anchor.kind === "time" && current.kind === "time") {
    const slot = snapDuration(snap);
    const cell = (target: typeof anchor) => {
      const start = timeAt(target, { ...snap, mode: "floor" });
      return { end: start.add(slot).toInstant(), kind: "timed", start: start.toInstant() } as const;
    };
    return createEventPlacement(cell(anchor), cell(current));
  }
  if (anchor.kind === "day" && current.kind === "day") {
    const cell = ({ date }: typeof anchor) =>
      ({ end: date.add({ days: 1 }), kind: "all-day", start: date }) as const;
    return createEventPlacement(cell(anchor), cell(current));
  }
  return null;
}
