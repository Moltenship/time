import { snapZonedWallTime, type WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { CalendarCellFocus } from "../navigation/focus";
import type { NormalizedCalendarEvent } from "../snapshots/types";
import { eventPlacement, placementsEqual } from "../transactions/placement";
import {
  createPlacementBetween,
  movePlacementToTarget,
  resizePlacementToTarget,
  type CalendarInteractionOptions,
  type CalendarInteractionTarget,
} from "../transactions/targets";
import type { CalendarEventPlacement, CalendarEventProposal } from "../transactions/types";
import { wallClockEndpoints } from "../transactions/wall-clock";
import type { CalendarInteractionCause } from "./announcements";

/** A keyboard move, resize, or create between grabbing and committing or cancelling. */
export interface CalendarKeyboardSession<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly cause: CalendarInteractionCause;
  /** The cell the gesture is over now; navigation keys move it as they move focus. */
  readonly cursor: CalendarCellFocus;
  /** The event being changed; `null` when creating. */
  readonly eventId: TEventId | null;
  /** The cell the gesture started from. */
  readonly grab: CalendarCellFocus;
  /** The event's placement before the gesture; `null` when creating. */
  readonly original: CalendarEventPlacement<TResourceId> | null;
  /** What committing proposes. */
  readonly proposed: CalendarEventPlacement<TResourceId>;
}

export type CalendarKeyboardSessionStart<
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | { readonly cause: "create"; readonly cell: CalendarCellFocus }
  | {
      readonly cause: Exclude<CalendarInteractionCause, "create">;
      /** The cell the event's focused element sits in, where `"exit"` navigation leads. */
      readonly cell: CalendarCellFocus;
      readonly event: NormalizedCalendarEvent<unknown, TEventId, TResourceId>;
    };

/** The slot a wall time falls in. */
function slotOf(
  wallTime: Temporal.PlainDateTime,
  snap: WallTimeSnapOptions,
  resourceId: CalendarCellFocus["resourceId"],
): CalendarCellFocus {
  const start = wallTime.round({
    roundingIncrement: snap.increment,
    roundingMode: "floor",
    smallestUnit: snap.smallestUnit,
  });
  return { date: start.toPlainDate(), kind: "slot", resourceId, time: start.toPlainTime() };
}

/**
 * The cell at an edge of the event, on the axis and in the resource of the cell its element sits
 * in, so stepping the cursor moves that edge and focus stays on the event.
 */
function edgeCell(
  placement: CalendarEventPlacement,
  edge: "start" | "end",
  cell: CalendarCellFocus,
  { snap, timeZone }: CalendarInteractionOptions,
): CalendarCellFocus {
  const { resourceId } = cell;
  if (placement.kind === "all-day") {
    const date = edge === "start" ? placement.start : placement.end.subtract({ days: 1 });
    return { date, kind: "day", resourceId };
  }
  const { end, start } = wallClockEndpoints(placement, timeZone);
  // The end is exclusive, so its edge is the last slot or day the event covers.
  const at = (edge === "start" ? start : end.subtract({ nanoseconds: 1 })).toPlainDateTime();
  return cell.kind === "day"
    ? { date: at.toPlainDate(), kind: "day", resourceId }
    : slotOf(at, snap, resourceId);
}

function targetOf(
  cell: CalendarCellFocus,
  { snap, timeZone }: CalendarInteractionOptions,
): CalendarInteractionTarget {
  const { resourceId } = cell;
  return cell.kind === "day"
    ? { date: cell.date, kind: "day", resourceId }
    : {
        at: snapZonedWallTime(cell.date.toPlainDateTime(cell.time), { ...snap, timeZone }),
        kind: "time",
        resourceId,
      };
}

/** The pointer's placement rules, applied to cells. */
function placementAt<TResourceId extends ResourceId>(
  cause: CalendarInteractionCause,
  original: CalendarEventPlacement<TResourceId> | null,
  grab: CalendarCellFocus,
  cursor: CalendarCellFocus,
  options: CalendarInteractionOptions,
): CalendarEventPlacement<TResourceId> | null {
  const from = targetOf(grab, options);
  const to = targetOf(cursor, options);
  if (original === null) return createPlacementBetween(from, to, options);
  if (cause === "move") return movePlacementToTarget(original, from, to, options);
  const edge = cause === "resize-start" ? "start" : "end";
  return resizePlacementToTarget(original, edge, from, to, options);
}

/**
 * Grabs an event to move or resize it, or a cell to create an event in. A resize grabs the edge,
 * so the cursor starts at the event's first or last slot or day.
 */
export function startKeyboardSession<TEventId extends EventId, TResourceId extends ResourceId>(
  start: CalendarKeyboardSessionStart<TEventId, TResourceId>,
  options: CalendarInteractionOptions,
): CalendarKeyboardSession<TEventId, TResourceId> {
  if (start.cause === "create") {
    const proposed = placementAt<TResourceId>("create", null, start.cell, start.cell, options)!;
    return {
      cause: "create",
      cursor: start.cell,
      eventId: null,
      grab: start.cell,
      original: null,
      proposed,
    };
  }
  const original = eventPlacement(start.event);
  const grab =
    start.cause === "move"
      ? start.cell
      : edgeCell(original, start.cause === "resize-start" ? "start" : "end", start.cell, options);
  return {
    cause: start.cause,
    cursor: grab,
    eventId: start.event.id,
    grab,
    original,
    proposed: original,
  };
}

/**
 * Moves the cursor to another cell. A step the gesture cannot take, such as resizing or creating
 * across the all-day row or shrinking an event past its minimum, returns `session` unchanged. A
 * resize that overshoots the minimum stops there, with the cursor on the edge it reached.
 */
export function moveKeyboardCursor<TEventId extends EventId, TResourceId extends ResourceId>(
  session: CalendarKeyboardSession<TEventId, TResourceId>,
  cursor: CalendarCellFocus,
  options: CalendarInteractionOptions,
): CalendarKeyboardSession<TEventId, TResourceId> {
  const { cause } = session;
  const proposed = placementAt(cause, session.original, session.grab, cursor, options);
  if (proposed === null) return session;
  if (cause !== "resize-end" && cause !== "resize-start") return { ...session, cursor, proposed };
  if (placementsEqual(proposed, session.proposed)) return session;
  const edge = cause === "resize-start" ? "start" : "end";
  return { ...session, cursor: edgeCell(proposed, edge, cursor, options), proposed };
}

/** The proposal committing the session makes; `null` when it would change nothing. */
export function keyboardSessionProposal<TEventId extends EventId, TResourceId extends ResourceId>(
  session: CalendarKeyboardSession<TEventId, TResourceId>,
): CalendarEventProposal<TEventId, TResourceId> | null {
  const { cause, eventId, original, proposed } = session;
  if (eventId === null || original === null) return { cause: "create", proposed };
  if (cause === "create" || placementsEqual(proposed, original)) return null;
  return { cause, eventId, proposed };
}
