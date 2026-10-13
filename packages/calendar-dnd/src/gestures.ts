import {
  createPlacementBetween,
  movePlacementToTarget,
  resizePlacementToTarget,
  timeGridDateTimeAt,
  type CalendarEventPlacement,
  type CalendarInteractionTarget,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

/**
 * What the pointer is over: a point in a time column, or a whole day cell, and in a resource view
 * the resource around it (`null` for the unassigned bucket).
 */
export type PointerTarget = (
  | {
      readonly column: TimeGridColumn;
      readonly kind: "time";
      /** How far through the column's nominal day, from `0` at midnight to `1` at the next. */
      readonly y: number;
    }
  | { readonly date: Temporal.PlainDate; readonly kind: "day" }
) & { readonly resourceId?: ResourceId | null };

export interface GestureOptions {
  readonly snap: WallTimeSnapOptions;
  readonly timeZone: string;
}

/** The snapped time under the pointer. The keyboard reaches the same targets through slots. */
function interactionTarget(
  target: PointerTarget,
  snap: WallTimeSnapOptions,
): CalendarInteractionTarget {
  return target.kind === "day"
    ? target
    : {
        at: timeGridDateTimeAt(target.column, target.y, { snap }),
        kind: "time",
        resourceId: target.resourceId,
      };
}

/** Whether two placements are the same range, kind and resources. */
export function samePlacement(
  left: CalendarEventPlacement,
  right: CalendarEventPlacement,
): boolean {
  return (
    left.kind === right.kind &&
    left.start.toString() === right.start.toString() &&
    left.end.toString() === right.end.toString() &&
    left.resourceIds.length === right.resourceIds.length &&
    left.resourceIds.every((resourceId) => right.resourceIds.includes(resourceId))
  );
}

/**
 * Where a dragged event lands. Moves within one axis keep the event's kind; dropping a timed event
 * on a day cell makes it all-day, and dropping an all-day event on a time column makes it a
 * one-hour timed event. Dropping in another resource swaps that resource in `resourceIds`.
 */
export function movedPlacement<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  grab: PointerTarget,
  current: PointerTarget,
  { snap, timeZone }: GestureOptions,
): CalendarEventPlacement<TResourceId> {
  return movePlacementToTarget(
    original,
    interactionTarget(grab, snap),
    interactionTarget(current, snap),
    { timeZone },
  );
}

/** The placement after dragging one edge; `null` while the pointer is over the other axis. */
export function resizedPlacement<TResourceId extends ResourceId>(
  original: CalendarEventPlacement<TResourceId>,
  edge: "start" | "end",
  grab: PointerTarget,
  current: PointerTarget,
  options: GestureOptions,
): CalendarEventPlacement<TResourceId> | null {
  return resizePlacementToTarget(
    original,
    edge,
    interactionTarget(grab, options.snap),
    interactionTarget(current, options.snap),
    options,
  );
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
  // A slot starts at its floor, wherever in it the pointer is.
  const floor: WallTimeSnapOptions = { ...snap, mode: "floor" };
  return createPlacementBetween(
    interactionTarget(anchor, floor),
    interactionTarget(current, floor),
    {
      snap,
    },
  );
}

/** What an item dragged in from outside the calendar becomes: a new event, or a move of one. */
export type DroppedItem<TResourceId extends ResourceId> =
  | { readonly days: number; readonly duration: Temporal.Duration; readonly kind: "create" }
  | { readonly kind: "move"; readonly original: CalendarEventPlacement<TResourceId> };

/**
 * Where an item dragged in from outside lands, starting at the slot or day under the pointer. A
 * new event is `duration` long over a time column and `days` long over day cells, in the resource
 * it is dropped in. A moved event's start lands there, and its kind changes as an in-view drag's
 * would; in another resource, that resource takes the place of its first.
 */
export function droppedPlacement<TResourceId extends ResourceId>(
  item: DroppedItem<TResourceId>,
  target: PointerTarget,
  { snap, timeZone }: GestureOptions,
): CalendarEventPlacement<TResourceId> {
  // An item starts at the slot it is over, wherever in it the pointer is, as a created range does.
  const at = interactionTarget(target, { ...snap, mode: "floor" });
  if (item.kind === "move") {
    const { original } = item;
    const resourceId =
      target.resourceId === undefined ? undefined : (original.resourceIds[0] ?? null);
    const grab: CalendarInteractionTarget =
      original.kind === "all-day"
        ? { date: original.start, kind: "day", resourceId }
        : {
            at:
              original.kind === "timed"
                ? original.start.toZonedDateTimeISO(timeZone)
                : original.start.toZonedDateTime(timeZone),
            kind: "time",
            resourceId,
          };
    return movePlacementToTarget(original, grab, at, { timeZone });
  }
  const resourceIds = (target.resourceId == null ? [] : [target.resourceId]) as TResourceId[];
  return at.kind === "day"
    ? { end: at.date.add({ days: item.days }), kind: "all-day", resourceIds, start: at.date }
    : {
        end: at.at.add(item.duration).toInstant(),
        kind: "timed",
        resourceIds,
        start: at.at.toInstant(),
      };
}
