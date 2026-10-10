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
 * What the pointer is over: a height in a time-grid column, or a whole day cell, and in a resource
 * view the resource around it (`null` for the unassigned bucket).
 */
export type PointerTarget = (
  | { readonly column: TimeGridColumn; readonly kind: "time"; readonly y: number }
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
