import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { ResourceId } from "../ids";
import {
  createEventPlacement,
  moveEventPlacement,
  resizeEventPlacement,
  toAllDayPlacement,
  toTimedPlacement,
} from "./placement";
import type { CalendarEventPlacement } from "./types";
import type { CalendarWallClockDelta } from "./wall-clock";

/**
 * What a pointer or keyboard interaction is over: a snapped wall-clock time in a time-grid
 * column, or a whole day (a month cell, or a time grid's all-day row). In a resource view it is
 * also in a resource, or in the unassigned bucket (`null`); views without resources leave
 * `resourceId` out.
 */
export type CalendarInteractionTarget = (
  | { readonly at: Temporal.ZonedDateTime; readonly kind: "time" }
  | { readonly date: Temporal.PlainDate; readonly kind: "day" }
) & { readonly resourceId?: ResourceId | null };

export interface CalendarInteractionOptions {
  /** Time-grid slots: the shortest a resize leaves a timed event, and a created event's unit. */
  readonly snap: WallTimeSnapOptions;
  /** The display time zone. */
  readonly timeZone: string;
}

/** Length of an all-day event dropped onto a time column. */
const DROPPED_ALL_DAY_DURATION: Temporal.DurationLike = { hours: 1 };

/** One snap increment. */
export function slotDuration({ increment, smallestUnit }: WallTimeSnapOptions): Temporal.Duration {
  const unit = smallestUnit.endsWith("s") ? smallestUnit : `${smallestUnit}s`;
  return Temporal.Duration.from({ [unit]: increment } as Temporal.DurationLike);
}

/**
 * The delta that carries `from` onto `to` under the placement helpers' rules: the calendar-day
 * difference on the wall clock, then the exact time from there to `to`. The grabbed point lands
 * on the target even when the offset changes, and the event's other endpoints still move by
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
 * The event's resources after one of its fragments moves from resource `from` to `to`: `to` takes
 * `from`'s place, so the event moves rather than gaining a copy. `null` is the unassigned bucket:
 * leaving it adds `to`, and entering it drops `from`. A resource the event already has is not
 * repeated.
 */
function reassignResource<TResourceId extends ResourceId>(
  resourceIds: readonly TResourceId[],
  from: TResourceId | null,
  to: TResourceId | null,
): readonly TResourceId[] {
  if (from === to) return resourceIds;
  const kept = resourceIds.filter((resourceId) => resourceId !== from);
  if (to === null || kept.includes(to)) return kept;
  const index = from === null ? -1 : resourceIds.indexOf(from);
  return index === -1 ? [...resourceIds, to] : resourceIds.with(index, to);
}

/** Whether both targets are in the same resource, or neither view has resources. */
function sameResource(left: CalendarInteractionTarget, right: CalendarInteractionTarget): boolean {
  return left.resourceId === right.resourceId;
}

/**
 * Where an event grabbed at `grab` lands over `target`. Moves within one axis keep the event's
 * kind; a timed event over a day becomes all-day, and an all-day event over a time becomes a
 * one-hour timed event. Moving to another resource swaps that resource in the event's
 * `resourceIds`, keeping its others.
 */
export function movePlacementToTarget<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  grab: CalendarInteractionTarget,
  target: CalendarInteractionTarget,
  options: Pick<CalendarInteractionOptions, "timeZone">,
): CalendarEventPlacement<TResourceId> {
  const moved = moveInTime(original, grab, target, options);
  if (grab.resourceId === undefined || target.resourceId === undefined) return moved;
  // Targets carry the view's resource IDs, which are the event's own resource ID type.
  const resourceIds = reassignResource(
    original.resourceIds,
    grab.resourceId as TResourceId | null,
    target.resourceId as TResourceId | null,
  );
  return resourceIds === original.resourceIds ? moved : { ...moved, resourceIds };
}

function moveInTime<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  grab: CalendarInteractionTarget,
  target: CalendarInteractionTarget,
  { timeZone }: Pick<CalendarInteractionOptions, "timeZone">,
): CalendarEventPlacement<TResourceId> {
  if (target.kind === "day") {
    if (grab.kind === "day") {
      return moveEventPlacement(
        original,
        { days: grab.date.until(target.date).days },
        { timeZone },
      );
    }
    const allDay = toAllDayPlacement(original, { timeZone });
    return moveEventPlacement(allDay, { days: allDay.start.until(target.date).days }, { timeZone });
  }

  if (grab.kind === "time") {
    return moveEventPlacement(original, deltaBetween(grab.at, target.at, original.kind), {
      timeZone,
    });
  }
  if (original.kind === "all-day") {
    return toTimedPlacement(original, target.at, DROPPED_ALL_DAY_DURATION);
  }
  const start =
    original.kind === "timed"
      ? original.start.toZonedDateTimeISO(timeZone)
      : original.start.toZonedDateTime(timeZone);
  return moveEventPlacement(original, deltaBetween(start, target.at, original.kind), { timeZone });
}

/**
 * The placement after moving one edge from `grab` to `target`; `null` across axes or resources.
 */
export function resizePlacementToTarget<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  edge: "start" | "end",
  grab: CalendarInteractionTarget,
  target: CalendarInteractionTarget,
  { snap, timeZone }: CalendarInteractionOptions,
): CalendarEventPlacement<TResourceId> | null {
  if (!sameResource(grab, target)) return null;
  if (grab.kind === "time" && target.kind === "time") {
    return resizeEventPlacement(original, edge, deltaBetween(grab.at, target.at, original.kind), {
      minimumDuration: slotDuration(snap),
      timeZone,
    });
  }
  if (grab.kind === "day" && target.kind === "day") {
    return resizeEventPlacement(
      original,
      edge,
      { days: grab.date.until(target.date).days },
      { timeZone },
    );
  }
  return null;
}

/**
 * A new event covering the cells from `anchor` to `target`: slots starting at their snapped
 * times, or whole days, in the anchor's resource. `null` across axes or resources.
 */
export function createPlacementBetween<TResourceId extends ResourceId>(
  anchor: CalendarInteractionTarget,
  target: CalendarInteractionTarget,
  { snap }: Pick<CalendarInteractionOptions, "snap">,
): CalendarEventPlacement<TResourceId> | null {
  if (!sameResource(anchor, target)) return null;
  const resourceIds = (anchor.resourceId == null ? [] : [anchor.resourceId]) as TResourceId[];
  if (anchor.kind === "time" && target.kind === "time") {
    const slot = slotDuration(snap);
    const cell = ({ at }: typeof anchor) =>
      ({ end: at.add(slot).toInstant(), kind: "timed", start: at.toInstant() }) as const;
    return createEventPlacement(cell(anchor), cell(target), resourceIds);
  }
  if (anchor.kind === "day" && target.kind === "day") {
    const cell = ({ date }: typeof anchor) =>
      ({ end: date.add({ days: 1 }), kind: "all-day", start: date }) as const;
    return createEventPlacement(cell(anchor), cell(target), resourceIds);
  }
  return null;
}
