import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
} from "@moltenship/calendar-temporal";

import type { CalendarEventInterval } from "../events";
import type { EventId, ResourceId } from "../ids";
import { intervalsEqual } from "../internal/interval-equality";
import type { NormalizedCalendarEvent } from "../snapshots/types";
import type { CalendarEventPlacement } from "./types";
import {
  positiveDuration,
  shiftWallClock,
  wallClockEndpoints,
  withWallClockEndpoints,
  type CalendarWallClockDelta,
  type DurationInput,
} from "./wall-clock";

const DEFAULT_MINIMUM_DURATION: Temporal.DurationLike = { minutes: 15 };

function earlier<TPoint>(left: TPoint, right: TPoint, compare: (a: TPoint, b: TPoint) => number) {
  return compare(left, right) <= 0 ? left : right;
}

function later<TPoint>(left: TPoint, right: TPoint, compare: (a: TPoint, b: TPoint) => number) {
  return compare(left, right) >= 0 ? left : right;
}

/** The placement of a normalized event, without its title, record, or other fields. */
export function eventPlacement<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>,
): CalendarEventPlacement<TResourceId> {
  const { resourceIds } = event;
  return event.kind === "timed"
    ? {
        end: event.end,
        kind: event.kind,
        resourceIds,
        sourceTimeZone: event.sourceTimeZone,
        start: event.start,
      }
    : event.kind === "all-day"
      ? { end: event.end, kind: event.kind, resourceIds, start: event.start }
      : { end: event.end, kind: event.kind, resourceIds, start: event.start };
}

/**
 * Moves a placement by a wall-clock delta whose day and time parts may differ in sign, such as
 * `{ days: 1, minutes: -30 }`. Timed events move in the display time zone, so an event at 09:00
 * moved by a week stays at 09:00 across a DST change. All-day events ignore the time part, and
 * floating events stay floating.
 */
export function moveEventPlacement<TResourceId extends ResourceId>(
  placement: CalendarEventPlacement<TResourceId>,
  delta: CalendarWallClockDelta,
  options: { readonly timeZone: string },
): CalendarEventPlacement<TResourceId> {
  if (placement.kind === "all-day") {
    return {
      ...placement,
      end: shiftWallClock(placement.end, delta),
      start: shiftWallClock(placement.start, delta),
    };
  }

  const current = wallClockEndpoints(placement, options.timeZone);
  const start = shiftWallClock(current.start, delta);
  let end = shiftWallClock(current.end, delta);
  // In a repeated (fold) hour, wall-clock order can disagree with exact order. Keep the exact
  // duration rather than produce an empty interval.
  if (Temporal.ZonedDateTime.compare(end, start) <= 0)
    end = start.add(current.start.until(current.end));
  return withWallClockEndpoints(placement, start, end);
}

/**
 * Moves one edge by a wall-clock delta, as `moveEventPlacement` moves both. The event cannot become shorter than `minimumDuration`
 * (default 15 minutes; all-day events keep at least one day), and an event that is already
 * shorter cannot shrink further.
 */
export function resizeEventPlacement<TResourceId extends ResourceId>(
  placement: CalendarEventPlacement<TResourceId>,
  edge: "start" | "end",
  delta: CalendarWallClockDelta,
  options: { readonly minimumDuration?: DurationInput; readonly timeZone: string },
): CalendarEventPlacement<TResourceId> {
  if (placement.kind === "all-day") {
    const { end, start } = placement;
    return edge === "start"
      ? {
          ...placement,
          start: earlier(
            shiftWallClock(start, delta),
            end.subtract({ days: 1 }),
            comparePlainDates,
          ),
        }
      : {
          ...placement,
          end: later(shiftWallClock(end, delta), start.add({ days: 1 }), comparePlainDates),
        };
  }

  const minimum = positiveDuration(options.minimumDuration ?? DEFAULT_MINIMUM_DURATION);
  const compare = (left: Temporal.ZonedDateTime, right: Temporal.ZonedDateTime) =>
    Temporal.ZonedDateTime.compare(left, right);
  const { end, start } = wallClockEndpoints(placement, options.timeZone);
  return edge === "start"
    ? withWallClockEndpoints(
        placement,
        earlier(
          shiftWallClock(start, delta),
          later(end.subtract(minimum), start, compare),
          compare,
        ),
        end,
      )
    : withWallClockEndpoints(
        placement,
        start,
        later(shiftWallClock(end, delta), earlier(start.add(minimum), end, compare), compare),
      );
}

/**
 * Creates the placement covering two cells, such as the time slots or day cells where a drag
 * started and ended. Cells may arrive in either order but must share a kind.
 */
export function createEventPlacement<TResourceId extends ResourceId>(
  anchor: CalendarEventInterval,
  focus: CalendarEventInterval,
  resourceIds: readonly TResourceId[] = [],
): CalendarEventPlacement<TResourceId> {
  if (anchor.kind === "timed" && focus.kind === "timed") {
    return {
      end: later(anchor.end, focus.end, compareInstants),
      kind: "timed",
      resourceIds,
      start: earlier(anchor.start, focus.start, compareInstants),
    };
  }
  if (anchor.kind === "all-day" && focus.kind === "all-day") {
    return {
      end: later(anchor.end, focus.end, comparePlainDates),
      kind: "all-day",
      resourceIds,
      start: earlier(anchor.start, focus.start, comparePlainDates),
    };
  }
  if (anchor.kind === "floating" && focus.kind === "floating") {
    return {
      end: later(anchor.end, focus.end, comparePlainDateTimes),
      kind: "floating",
      resourceIds,
      start: earlier(anchor.start, focus.start, comparePlainDateTimes),
    };
  }
  throw new TypeError("cell-kinds-must-match");
}

/** Converts a placement to the all-day dates it touches in the display time zone. */
export function toAllDayPlacement<TResourceId extends ResourceId>(
  placement: CalendarEventPlacement<TResourceId>,
  options: { readonly timeZone: string },
): CalendarEventPlacement<TResourceId> {
  if (placement.kind === "all-day") return placement;

  const { end, start } = wallClockEndpoints(placement, options.timeZone);
  const endDate = end.toPlainDate();
  return {
    end: end.equals(end.startOfDay()) ? endDate : endDate.add({ days: 1 }),
    kind: "all-day",
    resourceIds: placement.resourceIds,
    start: start.toPlainDate(),
  };
}

/** Converts a placement to a timed one that starts at `start` and lasts `duration`. */
export function toTimedPlacement<TResourceId extends ResourceId>(
  placement: CalendarEventPlacement<TResourceId>,
  start: Temporal.ZonedDateTime,
  duration: DurationInput,
): CalendarEventPlacement<TResourceId> {
  return {
    end: start.add(positiveDuration(duration)).toInstant(),
    kind: "timed",
    resourceIds: placement.resourceIds,
    sourceTimeZone: placement.kind === "timed" ? placement.sourceTimeZone : start.timeZoneId,
    start: start.toInstant(),
  };
}

export function isNonEmptyInterval(interval: CalendarEventInterval): boolean {
  switch (interval.kind) {
    case "timed":
      return compareInstants(interval.start, interval.end) < 0;
    case "all-day":
      return comparePlainDates(interval.start, interval.end) < 0;
    case "floating":
      return comparePlainDateTimes(interval.start, interval.end) < 0;
  }
}

export function placementsEqual(
  left: CalendarEventPlacement,
  right: CalendarEventPlacement,
): boolean {
  return (
    intervalsEqual(left, right) &&
    left.resourceIds.length === right.resourceIds.length &&
    left.resourceIds.every((resourceId) => right.resourceIds.includes(resourceId))
  );
}
