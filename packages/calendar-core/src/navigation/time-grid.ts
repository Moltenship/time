import type { WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import type { EventId } from "../ids";
import { slotDuration } from "../transactions/targets";
import type { TimeGridProjection } from "../views/time-grid/projection";
import { dayEventNavigation, dayFocus, eventFocus, eventsOnDate } from "./day-events";
import type { CalendarCellFocus } from "./focus";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./types";

type Input = CalendarSpatialNavigationInput<TimeGridProjection<unknown>, unknown>;

/** A time-grid column's nominal height, which layout fractions measure; exact as a double. */
const DAY_NANOSECONDS = 86_400_000_000_000;
type Layout = TimeGridProjection<unknown>["days"][number]["events"][number];

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

function slotFocus(wall: Temporal.PlainDateTime): CalendarSpatialNavigation {
  return { focus: { date: wall.toPlainDate(), kind: "slot", time: wall.toPlainTime() } };
}

/** The first slot at or after `time` on `date` that exists; the day itself if none does. */
function slotOn(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  { environment, snap }: Input,
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

/** The next slot up or down that exists on the same date; `null` past the day's ends. */
function stepSlot(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  direction: 1 | -1,
  { environment, snap }: Input,
): CalendarSpatialNavigation | null {
  const step = slotDuration(snap);
  const at = date.toPlainDateTime(time);
  const floored = floorToSlot(at, snap);
  let wall =
    direction > 0 ? floored.add(step) : floored.equals(at) ? floored.subtract(step) : floored;
  for (
    ;
    wall.toPlainDate().equals(date);
    wall = direction > 0 ? wall.add(step) : wall.subtract(step)
  ) {
    if (exists(wall, environment.timeZone)) return slotFocus(wall);
  }
  return null;
}

function entryDate({ command, projection, range }: Input): Temporal.PlainDate {
  if (command === "end") return range.end.subtract({ days: 1 });
  return projection.days.find((day) => day.isToday)?.column.date ?? range.start;
}

/**
 * The cells' own moves: slots step by the snap increment and stop at the day's ends (up from the
 * first slot reaches the all-day cell), the all-day cell goes down to the first slot, and left,
 * right, Home, End, and the Page keys move by days, keeping the row.
 */
function fromCell(cell: CalendarCellFocus, input: Input): CalendarSpatialNavigation | null {
  const { command, environment, projection, range } = input;
  const { date } = cell;
  const forward = environment.direction === "rtl" ? -1 : 1;
  const days = range.start.until(range.end).days;
  const across = (next: Temporal.PlainDate) =>
    cell.kind === "slot" ? { focus: slotOn(next, cell.time, input) } : dayFocus(next);

  switch (command) {
    case "up":
      return cell.kind === "slot" ? (stepSlot(date, cell.time, -1, input) ?? dayFocus(date)) : null;
    case "down":
      return cell.kind === "slot"
        ? stepSlot(date, cell.time, 1, input)
        : { focus: slotOn(date, Temporal.PlainTime.from("00:00"), input) };
    case "left":
      return across(date.subtract({ days: forward }));
    case "right":
      return across(date.add({ days: forward }));
    case "home":
      return across(range.start);
    case "end":
      return across(range.end.subtract({ days: 1 }));
    case "page-up":
      return across(date.subtract({ days }));
    case "page-down":
      return across(date.add({ days }));
    case "enter": {
      if (cell.kind === "day") return null;
      // The rendered boxes, not the wall-clock endpoints, which a repeated hour can reverse.
      const at = cell.time.since(Temporal.PlainTime.from("00:00")).total({ unit: "nanoseconds" });
      const covering = columnEvents(projection, date).find(
        ({ height, top }) =>
          Math.round(top * DAY_NANOSECONDS) <= at &&
          at < Math.round((top + height) * DAY_NANOSECONDS),
      );
      return covering === undefined ? null : eventFocus(date, covering.fragment.event.id);
    }
    case "exit":
      return null;
  }
}

/** A column's events top to bottom, then left to right. */
function columnEvents(
  projection: TimeGridProjection<unknown>,
  date: Temporal.PlainDate,
): readonly Layout[] {
  const day = projection.days.find(({ column }) => column.date.equals(date));
  return (day?.events ?? []).toSorted(
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
  input: Input,
): CalendarSpatialNavigation | null {
  const { command, environment } = input;
  const current = events[index]!;
  const { date, start } = current.fragment;
  // The event's first slot, or the next real one when its floor falls in a spring-forward gap.
  const cell = slotOn(date, start.toPlainTime(), input);
  const next = (layout: Layout | undefined) =>
    layout === undefined ? null : eventFocus(date, layout.fragment.event.id);
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
      return { focus: cell };
    case "enter":
      return null;
    default:
      return fromCell(cell, input);
  }
}

function eventIndex(events: readonly Layout[], eventId: EventId): number {
  return events.findIndex(({ fragment }) => fragment.event.id === eventId);
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
export function timeGridSpatialNavigation(input: Input): CalendarSpatialNavigation | null {
  const { command, focus, projection } = input;
  if (focus === null) return dayFocus(entryDate(input));
  if (focus.kind === "slot") return fromCell(focus, input);

  const { date } = focus;
  const allDay = eventsOnDate([projection.allDay], date);
  if (focus.kind === "day" || allDay.includes(focus.eventId)) {
    const below = { focus: slotOn(date, Temporal.PlainTime.from("00:00"), input) };
    const handled = dayEventNavigation(allDay, focus, command, below);
    return handled !== undefined ? handled : fromCell({ date, kind: "day" }, input);
  }

  const events = columnEvents(projection, date);
  const index = eventIndex(events, focus.eventId);
  if (index !== -1) return fromColumnEvent(events, index, input);
  // An event the grid no longer shows on this date leaves from the date.
  return command === "exit" ? dayFocus(date) : fromCell({ date, kind: "day" }, input);
}
