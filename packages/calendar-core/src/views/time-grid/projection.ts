import type { CalendarEventInterval } from "../../events";
import type { EventId, ResourceId } from "../../ids";
import { layoutDayGridRow, type DayGridRow } from "../../layout/day-grid";
import { splitEventsByDay, type EventDayFragment } from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import type { CalendarViewProjectionInput, CalendarViewStrategy } from "../../views";
import { timeGridColumns, type TimeGridColumn } from "./columns";
import { layoutTimeGrid, type TimeGridEventLayout } from "./layout";
import { navigateTimeGrid, timeGridRange, timeGridTitle, type TimeGridSpan } from "./range";

const DAY_NANOSECONDS = 86_400_000_000_000n;
/** Shorter events still reserve a quarter hour, so they stay readable and clickable. */
const MINIMUM_EVENT_HEIGHT = 15 / (24 * 60);

export interface TimeGridDay<TEvent> {
  readonly column: TimeGridColumn;
  /** Timed and floating events shorter than a day, positioned within the column. */
  readonly events: readonly TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>[];
  readonly isToday: boolean;
}

export interface TimeGridProjection<TEvent> {
  /** All-day events and events lasting a day or longer, packed into lanes across the days. */
  readonly allDay: DayGridRow<TEvent, EventId, ResourceId>;
  readonly days: readonly TimeGridDay<TEvent>[];
}

export type TimeGridProjectionInput<TEvent> = Pick<
  CalendarViewProjectionInput<unknown, TEvent>,
  "environment" | "range" | "snapshot" | "today"
>;

/**
 * Like Google Calendar, an event of 24 hours or more sits in a time grid's all-day row, not in
 * its columns. Interaction previews use this too, so they land where the event will render.
 */
export function belongsInTimeGridAllDayRow(interval: CalendarEventInterval): boolean {
  switch (interval.kind) {
    case "all-day":
      return true;
    case "timed":
      return interval.end.epochNanoseconds - interval.start.epochNanoseconds >= DAY_NANOSECONDS;
    case "floating":
      return Temporal.PlainDateTime.compare(interval.start.add({ days: 1 }), interval.end) <= 0;
  }
}

/** Splits the visible events into the all-day row and per-day columns of positioned blocks. */
export function projectTimeGrid<TEvent>({
  environment,
  range,
  snapshot,
  today,
}: TimeGridProjectionInput<TEvent>): TimeGridProjection<TEvent> {
  const { timeZone } = environment;
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, range, timeZone),
    range,
    timeZone,
  );
  const allDay = fragments.filter((fragment) => belongsInTimeGridAllDayRow(fragment.event));
  const timed = fragments.filter((fragment) => !belongsInTimeGridAllDayRow(fragment.event));
  const columns = timeGridColumns(range, timeZone);
  const layouts = layoutTimeGrid(columns, timed, { minHeight: MINIMUM_EVENT_HEIGHT });

  return Object.freeze({
    allDay: layoutDayGridRow(range, allDay),
    days: Object.freeze(
      columns.map((column, index) =>
        Object.freeze({
          column,
          events: layouts[index]!,
          isToday: today !== null && column.date.equals(today),
        }),
      ),
    ),
  });
}

/** Range, navigation, title, and projection for a day, week, or N-day time grid. */
export function timeGridStrategy<TOptions = undefined, TEvent = unknown>(
  span: TimeGridSpan,
): CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> {
  const strategy: CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> = {
    getRange: (anchor, environment) => timeGridRange(anchor, span, environment.weekRules),
    getTitle: (range, environment) => timeGridTitle(range, environment.locale),
    navigate: (anchor, delta) => navigateTimeGrid(anchor, delta, span),
    project: projectTimeGrid,
  };
  return Object.freeze(strategy);
}
