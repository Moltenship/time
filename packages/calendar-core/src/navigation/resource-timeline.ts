import type { EventId } from "../ids";
import type {
  ResourceTimelineDayRow,
  ResourceTimelineHourRow,
  ResourceTimelineProjection,
} from "../views/resource-timeline/projection";
import { eventsOnDate } from "./day-events";
import type { CalendarCellFocus, CalendarEventFocus } from "./focus";
import { slotOn, stepSlot } from "./time-grid";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./types";

type Input = CalendarSpatialNavigationInput<ResourceTimelineProjection<unknown>, unknown>;
type Row = ResourceTimelineDayRow<unknown> | ResourceTimelineHourRow<unknown>;

const DAY_NANOSECONDS = 86_400_000_000_000;
const MIDNIGHT = Temporal.PlainTime.from("00:00");

/** An event in a row, in the order left and right walk them. */
interface RowEvent {
  /** The first visible date its element covers. */
  readonly date: Temporal.PlainDate;
  readonly eventId: EventId;
  /** The wall time of its first cell: where it starts, or the range's start when earlier. */
  readonly start: Temporal.PlainDateTime;
}

function inRow(cell: CalendarCellFocus | null, row: Row): CalendarSpatialNavigation | null {
  return cell === null ? null : { focus: { ...cell, resourceId: row.resource.id } };
}

/** The cell on `date` at `time`: the day, or the first slot at or after the time that exists. */
function cellAt(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  input: Input,
): CalendarCellFocus {
  return input.projection.unit === "day" ? { date, kind: "day" } : slotOn(date, time, input);
}

/** The range's last cell of a kind: its last day, or the last slot before it ends. */
function lastCell(kind: CalendarCellFocus["kind"], input: Input): CalendarCellFocus | null {
  const { range } = input;
  return kind === "day"
    ? { date: range.end.subtract({ days: 1 }), kind: "day" }
    : stepSlot(range.end, MIDNIGHT, -1, input, true);
}

/** A row's events in layout order: earlier start, then lane. */
function rowEvents(row: Row, { projection, range }: Input): readonly RowEvent[] {
  if (projection.unit === "day") {
    return (row as ResourceTimelineDayRow<unknown>).segments
      .toSorted((left, right) => left.column - right.column || left.lane - right.lane)
      .map(({ column, event }) => {
        const date = range.start.add({ days: column });
        return { date, eventId: event.id, start: date.toPlainDateTime() };
      });
  }
  const days = projection.columns.length;
  return (row as ResourceTimelineHourRow<unknown>).bars
    .toSorted((left, right) => left.start - right.start || left.lane - right.lane)
    .map(({ event, start }) => {
      const scaled = start * days;
      const index = Math.min(days - 1, Math.floor(scaled));
      const date = projection.columns[index]!.date;
      const nanoseconds = Math.round((scaled - index) * DAY_NANOSECONDS);
      return { date, eventId: event.id, start: date.toPlainDateTime().add({ nanoseconds }) };
    });
}

/** The events covering a cell (a slot, or any part of a day), top lane first. */
function eventsAt(row: Row, cell: CalendarCellFocus, { projection, range }: Input): EventId[] {
  if (projection.unit === "day") {
    const { laneCount, segments } = row as ResourceTimelineDayRow<unknown>;
    return [...eventsOnDate([{ laneCount, range, segments }], cell.date)];
  }
  // Whole nanoseconds along the range, so a bar ending where a cell starts does not cover it.
  const total = projection.columns.length * DAY_NANOSECONDS;
  const from =
    range.start.until(cell.date).days * DAY_NANOSECONDS +
    (cell.kind === "slot" ? cell.time.since(MIDNIGHT).total({ unit: "nanoseconds" }) : 0);
  const to = cell.kind === "slot" ? from + 1 : from + DAY_NANOSECONDS;
  return (row as ResourceTimelineHourRow<unknown>).bars
    .filter(({ end, start }) => Math.round(start * total) < to && from < Math.round(end * total))
    .toSorted((left, right) => left.lane - right.lane)
    .map(({ event }) => event.id);
}

/**
 * The cells' own moves: left and right step a day or a slot along the row, past midnight and out
 * of the range; up and down keep the time in the neighbouring row; Home and End go to the range's
 * first and last cell, and the Page keys move by the range. A day stays a day in an hour
 * timeline, as a resize of an all-day bar needs.
 */
function fromCell(
  cell: CalendarCellFocus,
  rowIndex: number,
  input: Input,
): CalendarSpatialNavigation | null {
  const { command, environment, projection, range } = input;
  const row = projection.rows[rowIndex]!;
  const days = range.start.until(range.end).days;
  const sameKind = (date: Temporal.PlainDate): CalendarCellFocus =>
    cell.kind === "day" ? { date, kind: "day" } : slotOn(date, cell.time, input);
  const step = (direction: 1 | -1) =>
    inRow(
      cell.kind === "day"
        ? { date: cell.date.add({ days: direction }), kind: "day" }
        : stepSlot(cell.date, cell.time, direction, input, true),
      row,
    );
  const forward = environment.direction === "rtl" ? -1 : 1;

  switch (command) {
    case "left":
      return step(forward === 1 ? -1 : 1);
    case "right":
      return step(forward === 1 ? 1 : -1);
    case "up":
    case "down": {
      const next = projection.rows[rowIndex + (command === "up" ? -1 : 1)];
      return next === undefined ? null : inRow(cell, next);
    }
    case "home":
      return inRow(
        cell.kind === "day" ? sameKind(range.start) : slotOn(range.start, MIDNIGHT, input),
        row,
      );
    case "end":
      return inRow(lastCell(cell.kind, input), row);
    case "page-up":
      return inRow(sameKind(cell.date.subtract({ days })), row);
    case "page-down":
      return inRow(sameKind(cell.date.add({ days })), row);
    case "enter": {
      const [eventId] = eventsAt(row, cell, input);
      if (eventId === undefined) return null;
      return { focus: { date: cell.date, eventId, kind: "event", resourceId: row.resource.id } };
    }
    case "exit":
      return null;
  }
}

function fromEvent(
  focus: CalendarEventFocus,
  rowIndex: number,
  input: Input,
): CalendarSpatialNavigation | null {
  const { command, environment, projection } = input;
  const row = projection.rows[rowIndex]!;
  const events = rowEvents(row, input);
  // An event with gaps between its dates shows more than once; this one holds the focus's date.
  const position = events.findLastIndex(
    ({ date, eventId }) =>
      eventId === focus.eventId && Temporal.PlainDate.compare(date, focus.date) <= 0,
  );
  const current = events[position] ?? events.find(({ eventId }) => eventId === focus.eventId);
  if (current === undefined) {
    // An event the row no longer shows leaves from its date.
    const cell = cellAt(focus.date, MIDNIGHT, input);
    return command === "exit" ? inRow(cell, row) : fromCell(cell, rowIndex, input);
  }

  const cell = cellAt(current.start.toPlainDate(), current.start.toPlainTime(), input);
  const index = events.indexOf(current);
  const forward = environment.direction === "rtl" ? -1 : 1;
  const toEvent = (other: RowEvent | undefined): CalendarSpatialNavigation | null =>
    other === undefined
      ? null
      : {
          focus: {
            date: other.date,
            eventId: other.eventId,
            kind: "event",
            resourceId: row.resource.id,
          },
        };

  switch (command) {
    case "left":
      return toEvent(events[index - forward]);
    case "right":
      return toEvent(events[index + forward]);
    case "exit":
      return inRow(cell, row);
    case "enter":
      return null;
    default:
      // Up and down leave for the neighbouring row; the rest move as from the event's cell.
      return fromCell(cell, rowIndex, input);
  }
}

/**
 * Spatial navigation for a resource timeline from `projectResourceTimeline`: the time grid's moves
 * with its axes swapped.
 *
 * - Cells are days in a day timeline and slots of the snap increment in an hour timeline, where a
 *   day, as a keyboard resize of an all-day bar holds, steps by days. Left and
 *   right step along the row (past midnight, skipping wall times a spring-forward change removes,
 *   and out of the range, which pages the view), up and down move to the same time in the
 *   previous or next visible row, Home and End to the range's first and last cell, and Page Up
 *   and Page Down by the whole range. Focus enters on today, or the range's first cell.
 * - `"enter"` moves into the events covering the cell in its row, top lane first. On an event,
 *   left and right walk the row's events in time order, up and down leave for the neighbouring
 *   row, and `"exit"` returns to the cell where the event starts.
 *
 * Every focus names its row's resource. Focus without one, as from a view without resources,
 * moves from the first row.
 */
export function resourceTimelineSpatialNavigation(input: Input): CalendarSpatialNavigation | null {
  const { command, focus, projection, range } = input;
  if (projection.rows.length === 0) return null;
  if (focus === null) {
    const kind = projection.unit === "day" ? "day" : "slot";
    if (command === "end") return inRow(lastCell(kind, input), projection.rows.at(-1)!);
    const { today } = projection;
    const showsToday =
      today !== null &&
      Temporal.PlainDate.compare(range.start, today) <= 0 &&
      Temporal.PlainDate.compare(today, range.end) < 0;
    return inRow(cellAt(showsToday ? today : range.start, MIDNIGHT, input), projection.rows[0]!);
  }

  const found = projection.rows.findIndex(({ resource }) => resource.id === focus.resourceId);
  const rowIndex = found === -1 ? 0 : found;
  if (focus.kind === "event") return fromEvent(focus, rowIndex, input);
  // A day timeline has no slots. An hour timeline keeps a day, as a keyboard gesture on an
  // all-day bar steps by days, and a slot's own time, as from a view with finer slots: up and
  // down keep it, and stepping along the row aligns it to the snap.
  return fromCell(
    focus.kind === "day" || projection.unit === "hour"
      ? focus
      : cellAt(focus.date, focus.time, input),
    rowIndex,
    input,
  );
}
