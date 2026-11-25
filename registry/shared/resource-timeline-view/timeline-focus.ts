import {
  resourceTimelineSpatialNavigation,
  sameFocus,
  timelineExtent,
  type CalendarCellFocus,
  type CalendarDayFocus,
  type CalendarEnvironmentBase,
  type CalendarFocus,
  type CalendarKeyboardSession,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type ResourceTimelineProjection,
  type TimeGridColumn,
} from "@moltenship/calendar";

import { slotsPerDay } from "./timeline-placement";

/** Pointer and keyboard both step by these slots in an hour timeline, so they reach the same times. */
export const timelineSnap = { increment: 30, smallestUnit: "minute" } as const;
/** The calendar's default slots, in which it finds where focus enters a view. */
const entrySnap = { increment: 15, smallestUnit: "minute" } as const;

/**
 * Where the calendar enters the view: today or the range's first day in the first row, at the
 * day's first wall time in an hour timeline. The calendar finds it in its default slots, so it
 * asks with those, whatever the view steps by, or the cell rendered for it isn't the tab stop.
 */
export function timelineEntry<TEvent>(input: {
  readonly environment: CalendarEnvironmentBase;
  readonly options: unknown;
  readonly projection: ResourceTimelineProjection<TEvent>;
  readonly range: PlainDateInterval;
}): CalendarCellFocus | null {
  const found = resourceTimelineSpatialNavigation({
    ...input,
    command: "home",
    focus: null,
    snap: entrySnap,
  });
  return found === null || !("focus" in found) || found.focus.kind === "event" ? null : found.focus;
}

/**
 * A time grid's slot as its whole day in a timeline of days, which the view asks the calendar to
 * focus, so keys act on the day, as a drag does; `null` for any other focus.
 */
export function slotDayFocus(
  unit: ResourceTimelineProjection<unknown>["unit"],
  focus: CalendarFocus | null,
): CalendarDayFocus | null {
  return unit === "day" && focus?.kind === "slot"
    ? { date: focus.date, kind: "day", resourceId: focus.resourceId }
    : null;
}

export interface CellTargets {
  /** The cells each row renders a keyboard target for, by row index. */
  readonly cells: ReadonlyMap<number, readonly CalendarCellFocus[]>;
  /** Rows and slots that render even when scrolled away, so the targets and a focused event do. */
  readonly rows: readonly number[];
  readonly slots: readonly number[];
}

/**
 * Where keyboard focus can land. The first row always holds the view's entry, where the calendar
 * enters it, which is the tab stop until something has focus or when the focus can't show here.
 * The focused cell sits in its row; focus from a view without resources names none and sits in
 * the first row, as navigation moves it from there. A time grid's slot covers its whole day in a
 * timeline of days, keeping its kind until the view's request to make it a day is accepted, so it
 * stays the tab stop while the owner holds it. These, and a focused event's element, stay
 * rendered while scrolled away.
 */
export function cellTargets<TEvent>(
  focus: CalendarFocus | null,
  entry: CalendarCellFocus | null,
  { columns, rows, unit }: ResourceTimelineProjection<TEvent>,
  range: PlainDateInterval,
): CellTargets {
  if (entry === null) return { cells: new Map(), rows: [], slots: [] };
  const perDay = slotsPerDay(unit);
  const slotCount = columns.length * perDay;
  const dayOf = (date: Temporal.PlainDate) => range.start.until(date).days;
  // A slot from a time grid sits on its whole day in a timeline of days.
  const slotOf = (cell: CalendarCellFocus) =>
    dayOf(cell.date) * perDay + (unit === "hour" && cell.kind === "slot" ? cell.time.hour : 0);

  const cells = new Map<number, CalendarCellFocus[]>([[0, [entry]]]);
  const pinned = { rows: [0], slots: [slotOf(entry)] };
  if (focus === null) return { cells, ...pinned };

  const day = dayOf(focus.date);
  const rowOf = (eventId?: EventId) =>
    focus.resourceId !== undefined
      ? rows.findIndex(({ resource }) => resource.id === focus.resourceId)
      : eventId === undefined
        ? 0
        : rows.findIndex((row) => eventStart(row, eventId, day, slotCount) !== undefined);

  if (focus.kind !== "event") {
    const row = day >= 0 && day < columns.length ? rowOf() : -1;
    if (row !== -1) {
      // Named after its row, a resource-less focus can't also match the entry beside it.
      const cell = { ...focus, resourceId: rows[row]!.resource.id };
      const targets = cells.get(row) ?? [];
      if (!targets.some((target) => sameFocus(target, cell))) cells.set(row, [...targets, cell]);
      pinned.rows.push(row);
      pinned.slots.push(slotOf(cell));
    }
  } else {
    const row = rowOf(focus.eventId);
    const slot = row === -1 ? undefined : eventStart(rows[row]!, focus.eventId, day, slotCount);
    if (slot !== undefined) {
      pinned.rows.push(row);
      pinned.slots.push(slot);
    }
  }
  return { cells, ...pinned };
}

/**
 * The slot an event's element starts in within a row; `undefined` when the row doesn't show it.
 * Over days, an event around a date the wall clock skips shows in pieces: the one holding `day`.
 */
function eventStart<TEvent>(
  row: ResourceTimelineProjection<TEvent>["rows"][number],
  eventId: EventId,
  day: number,
  slotCount: number,
): number | undefined {
  if ("segments" in row) {
    const pieces = row.segments.filter(({ event }) => event.id === eventId);
    const piece = pieces.find(({ column, span }) => column <= day && day < column + span);
    return (piece ?? pieces[0])?.column;
  }
  const bar = row.bars.find(({ event }) => event.id === eventId);
  return bar === undefined ? undefined : Math.min(slotCount - 1, Math.floor(bar.start * slotCount));
}

/** A stretch of a row, in slots. */
export type TimelineStretch = readonly [start: number, end: number];

export const sameStretch = (left: TimelineStretch | null, right: TimelineStretch | null) =>
  left === right || (left?.[0] === right?.[0] && left?.[1] === right?.[1]);

/**
 * Where a keyboard create's draft falls in a resource's row, in slots; `null` while there is none
 * there. Select it from the keyboard session, compared with `sameStretch`.
 */
export function rowDraft(
  session: CalendarKeyboardSession | null,
  resourceId: ResourceId | null,
  columns: readonly TimeGridColumn[],
  slotCount: number,
): TimelineStretch | null {
  if (session === null || session.eventId !== null) return null;
  if (session.cursor.resourceId !== resourceId) return null;
  const extent = timelineExtent(columns, session.proposed);
  return extent === null ? null : [extent.start * slotCount, extent.end * slotCount];
}

/** A key that expands or collapses a group from a cell of its row: Shift+Enter. */
export function isGroupToggleKey(event: { readonly key: string; readonly shiftKey: boolean }) {
  return event.key === "Enter" && event.shiftKey;
}
