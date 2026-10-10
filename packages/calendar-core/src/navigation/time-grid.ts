import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { DayGridRow } from "../layout/day-grid";
import { slotDuration } from "../transactions/targets";
import type { TimeGridProjection } from "../views/time-grid/projection";
import { dayEventNavigation, dayFocus, eventFocus, eventsOnDate } from "./day-events";
import type { CalendarCellFocus, CalendarFocus } from "./focus";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./types";

type Input = CalendarSpatialNavigationInput<unknown, unknown>;
type Layout = TimeGridProjection<unknown>["days"][number]["events"][number];
type ResourceFocus = CalendarFocus["resourceId"];

/**
 * A column the keyboard moves through: a date's slots, events, and all-day cell, in a resource
 * when the view has resources. Columns are listed in the order the view lays them out.
 */
export interface TimeGridNavigationColumn {
  /** The all-day row the column's all-day cell belongs to. */
  readonly allDay: DayGridRow<unknown, EventId, ResourceId>;
  readonly date: Temporal.PlainDate;
  readonly events: readonly Layout[];
  readonly isToday: boolean;
  /** Left out in views without resources. */
  readonly resourceId?: ResourceId | null;
}

/** A time-grid column's nominal height, which layout fractions measure; exact as a double. */
const DAY_NANOSECONDS = 86_400_000_000_000;
const MIDNIGHT = Temporal.PlainTime.from("00:00");

/** Whether a wall time exists in the time zone; spring-forward gaps skip some. */
function exists(wall: Temporal.PlainDateTime, timeZone: string): boolean {
  return wall.toZonedDateTime(timeZone).toPlainDateTime().equals(wall);
}

function floorToSlot(wall: Temporal.PlainDateTime, snap: WallTimeSnapOptions) {
  return wall.round({
    roundingIncrement: snap.increment,
    roundingMode: "floor",
    smallestUnit: snap.smallestUnit,
  });
}

/** `result` with its focus in `resourceId`, unless the view has no resources. */
function inResource<TResult extends CalendarSpatialNavigation | null | undefined>(
  result: TResult,
  resourceId: ResourceFocus,
): TResult {
  if (resourceId === undefined || result == null || !("focus" in result)) return result;
  return { focus: { ...result.focus, resourceId } } as TResult;
}

/** Focus on `cell`, or `null` without one. */
function onCell(cell: CalendarCellFocus | null): CalendarSpatialNavigation | null {
  return cell === null ? null : { focus: cell };
}

/** The first slot at or after `time` on `date` that exists; the day itself if none does. */
export function slotOn(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  { environment, snap }: Pick<Input, "environment" | "snap">,
): CalendarCellFocus {
  const step = slotDuration(snap);
  for (let wall = floorToSlot(date.toPlainDateTime(time), snap); wall.toPlainDate().equals(date);) {
    if (exists(wall, environment.timeZone)) {
      return { date, kind: "slot", time: wall.toPlainTime() };
    }
    wall = wall.add(step);
  }
  return { date, kind: "day" };
}

/**
 * The next slot up or down that exists; `null` past the date's ends unless `acrossDates`, when it
 * continues into the neighbouring dates.
 */
export function stepSlot(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  direction: 1 | -1,
  { environment, snap }: Pick<Input, "environment" | "snap">,
  acrossDates = false,
): CalendarCellFocus | null {
  const step = slotDuration(snap);
  const move = (wall: Temporal.PlainDateTime) =>
    direction > 0 ? wall.add(step) : wall.subtract(step);
  const at = date.toPlainDateTime(time);
  const floored = floorToSlot(at, snap);
  // Two days on is past any gap, even a date the zone skipped.
  const stop = at.add({ days: 2 * direction });
  for (
    let wall = direction > 0 || floored.equals(at) ? move(floored) : floored;
    acrossDates
      ? Temporal.PlainDateTime.compare(wall, stop) * direction < 0
      : wall.toPlainDate().equals(date);
    wall = move(wall)
  ) {
    if (exists(wall, environment.timeZone)) {
      return { date: wall.toPlainDate(), kind: "slot", time: wall.toPlainTime() };
    }
  }
  return null;
}

function columnAt(
  columns: readonly TimeGridNavigationColumn[],
  date: Temporal.PlainDate,
  resourceId: ResourceFocus,
): number {
  // Focus without a resource, as from a view without them, is in the date's first column.
  return columns.findIndex(
    (column) =>
      column.date.equals(date) && (resourceId === undefined || column.resourceId === resourceId),
  );
}

interface Place {
  readonly date: Temporal.PlainDate;
  readonly resourceId?: ResourceFocus;
}

/**
 * Where a horizontal key leads from the column at `index`: left and right step through the
 * columns, and past either end to the column at the other end a whole range away; Home and End
 * go to the first and last column, and the Page keys move by the range in the same column.
 */
function across(
  columns: readonly TimeGridNavigationColumn[],
  index: number,
  { date, resourceId }: Place,
  { command, environment, range }: Input,
): Place | null {
  const days = range.start.until(range.end).days;
  const shifted = (column: TimeGridNavigationColumn, by: number): Place => ({
    date: column.date.add({ days: by }),
    resourceId: column.resourceId,
  });
  switch (command) {
    case "left":
    case "right": {
      const step = (command === "right" ? 1 : -1) * (environment.direction === "rtl" ? -1 : 1);
      // A date the view does not show steps by days, as after a focus carried over.
      if (index === -1) return { date: date.add({ days: step }), resourceId };
      const next = index + step;
      if (next < 0) return shifted(columns.at(-1)!, -days);
      return next >= columns.length ? shifted(columns[0]!, days) : columns[next]!;
    }
    case "home":
      return columns[0] ?? null;
    case "end":
      return columns.at(-1) ?? null;
    case "page-up":
      return { date: date.subtract({ days }), resourceId };
    case "page-down":
      return { date: date.add({ days }), resourceId };
    default:
      return null;
  }
}

/**
 * The cells' own moves: slots step by the snap increment and stop at the day's ends (up from the
 * first slot reaches the all-day cell), the all-day cell goes down to the first slot, and the
 * horizontal keys move between columns (see `across`), keeping the row.
 */
function fromCell(
  cell: CalendarCellFocus,
  columns: readonly TimeGridNavigationColumn[],
  input: Input,
): CalendarSpatialNavigation | null {
  const { command } = input;
  const { date, resourceId } = cell;
  const index = columnAt(columns, date, resourceId);
  const own = resourceId ?? columns[index]?.resourceId;

  switch (command) {
    case "up":
      return inResource(
        cell.kind === "slot"
          ? (onCell(stepSlot(date, cell.time, -1, input)) ?? dayFocus(date))
          : null,
        own,
      );
    case "down":
      return inResource(
        cell.kind === "slot"
          ? onCell(stepSlot(date, cell.time, 1, input))
          : { focus: slotOn(date, MIDNIGHT, input) },
        own,
      );
    case "enter": {
      if (cell.kind === "day") return null;
      // The rendered boxes, not the wall-clock endpoints, which a repeated hour can reverse.
      const at = cell.time.since(MIDNIGHT).total({ unit: "nanoseconds" });
      const covering = sortedEvents(columns[index]).find(
        ({ height, top }) =>
          Math.round(top * DAY_NANOSECONDS) <= at &&
          at < Math.round((top + height) * DAY_NANOSECONDS),
      );
      return covering === undefined
        ? null
        : inResource(eventFocus(date, covering.fragment.event.id), own);
    }
    case "exit":
      return null;
    default: {
      const next = across(columns, index, { date, resourceId: own }, input);
      if (next === null) return null;
      const target =
        cell.kind === "slot" ? { focus: slotOn(next.date, cell.time, input) } : dayFocus(next.date);
      return inResource(target, next.resourceId);
    }
  }
}

/** A column's events top to bottom, then left to right. */
function sortedEvents(column: TimeGridNavigationColumn | undefined): readonly Layout[] {
  return (column?.events ?? []).toSorted(
    (left, right) => left.top - right.top || left.left - right.left,
  );
}

/** The nearest event beside `current` that shares some of its height. */
function besideEvent(events: readonly Layout[], current: Layout, side: 1 | -1): Layout | undefined {
  const overlapping = events.filter(
    (other) =>
      other !== current &&
      other.top < current.top + current.height &&
      current.top < other.top + other.height &&
      Math.sign(other.left - current.left) === side,
  );
  return overlapping.toSorted(
    (left, right) => Math.abs(left.left - current.left) - Math.abs(right.left - current.left),
  )[0];
}

function fromColumnEvent(
  events: readonly Layout[],
  index: number,
  resourceId: ResourceFocus,
  columns: readonly TimeGridNavigationColumn[],
  input: Input,
): CalendarSpatialNavigation | null {
  const { command, environment } = input;
  const current = events[index]!;
  const { date, start } = current.fragment;
  // The event's first slot, or the next real one when its floor falls in a spring-forward gap.
  const cell = { ...slotOn(date, start.toPlainTime(), input), resourceId };
  const next = (layout: Layout | undefined) =>
    layout === undefined
      ? null
      : inResource(eventFocus(date, layout.fragment.event.id), resourceId);
  const forward = environment.direction === "rtl" ? -1 : 1;

  switch (command) {
    case "up":
      return next(events[index - 1]);
    case "down":
      return next(events[index + 1]);
    case "left":
      return next(besideEvent(events, current, forward === 1 ? -1 : 1));
    case "right":
      return next(besideEvent(events, current, forward === 1 ? 1 : -1));
    case "exit":
      return inResource({ focus: cell }, resourceId);
    case "enter":
      return null;
    default:
      return fromCell(cell, columns, input);
  }
}

/**
 * Spatial navigation through time-grid columns in layout order, as `timeGridSpatialNavigation`
 * describes; every focus it returns is in its column's resource.
 */
export function timeGridColumnsNavigation(
  input: Input,
  columns: readonly TimeGridNavigationColumn[],
): CalendarSpatialNavigation | null {
  const { command, focus } = input;
  if (focus === null) {
    const entry =
      command === "end" ? columns.at(-1) : (columns.find(({ isToday }) => isToday) ?? columns[0]);
    return entry === undefined ? null : inResource(dayFocus(entry.date), entry.resourceId);
  }
  if (focus.kind === "slot") return fromCell(focus, columns, input);

  const { date } = focus;
  const column = columns[columnAt(columns, date, focus.resourceId)];
  const resourceId = focus.resourceId ?? column?.resourceId;
  const dayCell: CalendarCellFocus = { date, kind: "day", resourceId };
  const allDay = column === undefined ? [] : eventsOnDate([column.allDay], date);
  if (focus.kind === "day" || allDay.includes(focus.eventId)) {
    const below = inResource({ focus: slotOn(date, MIDNIGHT, input) }, resourceId);
    const handled = dayEventNavigation(allDay, focus, command, below);
    return handled !== undefined
      ? inResource(handled, resourceId)
      : fromCell(dayCell, columns, input);
  }

  const events = sortedEvents(column);
  const index = events.findIndex(({ fragment }) => fragment.event.id === focus.eventId);
  if (index !== -1) return fromColumnEvent(events, index, resourceId, columns, input);
  // An event the grid no longer shows on this date leaves from the date.
  return command === "exit"
    ? inResource(dayFocus(date), resourceId)
    : fromCell(dayCell, columns, input);
}

/**
 * Spatial navigation for a day, week, or N-day time grid from `projectTimeGrid`.
 *
 * - Slots move up and down by the snap increment, skipping wall times a spring-forward change
 *   removes; up from the first slot reaches the date's all-day cell, and down from that cell the
 *   first slot. Left and right move by a day, Home and End to the first and last visible day,
 *   and Page Up and Page Down by the whole range, keeping the time.
 * - `"enter"` moves from a slot to the first event covering it, or from an all-day cell into its
 *   events. In a column, up and down walk its events in order and left and right move between
 *   events that overlap; `"exit"` returns to the slot where the event starts.
 * - All-day events behave as in a month: up and down walk the date's events, leaving above to the
 *   all-day cell and below to the first slot.
 */
export function timeGridSpatialNavigation(
  input: CalendarSpatialNavigationInput<TimeGridProjection<unknown>, unknown>,
): CalendarSpatialNavigation | null {
  const { allDay, days } = input.projection;
  return timeGridColumnsNavigation(
    input,
    days.map(({ column, events, isToday }) => ({ allDay, date: column.date, events, isToday })),
  );
}
