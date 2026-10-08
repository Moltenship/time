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

/**
 * The delta that carries `from` onto `to` under the placement helpers' rules: the calendar-day
 * difference on the wall clock, then the exact time from there to `to`. The grabbed point lands
 * under the pointer even when the offset changes, and the event's other endpoints still move by
 * whole calendar days. The parts may differ in sign. Floating events have no offsets, so their
 * time part is wall time.
 */
function deltaBetween(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
  kind: CalendarEventPlacement["kind"],
): CalendarWallClockDelta {
  const days = from.toPlainDate().until(to.toPlainDate()).days;
  const time =
    kind === "floating"
      ? from.toPlainDateTime().add({ days }).until(to.toPlainDateTime(), { largestUnit: "hours" })
      : from.add({ days }).until(to, { largestUnit: "hours" });
  return {
    days,
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
      { days: allDay.start.until(current.date).days },
      { timeZone },
    );
  }

  const at = timeAt(current, snap);
  if (grab.kind === "time") {
    return moveEventPlacement(original, deltaBetween(timeAt(grab, snap), at, original.kind), {
      timeZone,
    });
  }
  if (original.kind === "all-day") return toTimedPlacement(original, at, DROPPED_ALL_DAY_DURATION);
  const start =
    original.kind === "timed"
      ? original.start.toZonedDateTimeISO(timeZone)
      : original.start.toZonedDateTime(timeZone);
  return moveEventPlacement(original, deltaBetween(start, at, original.kind), { timeZone });
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
    const delta = deltaBetween(timeAt(grab, snap), timeAt(current, snap), original.kind);
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
