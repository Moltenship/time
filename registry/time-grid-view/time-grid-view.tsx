import {
  defineCalendarView,
  timeGridStrategy,
  timeGridTitle,
  useCalendarPointer,
  type CalendarViewRendererProps,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar";
import { useMemo, useRef } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { TimeGridAllDay } from "./time-grid-all-day";
import { TimeGridBody } from "./time-grid-body";
import { TimeGridHeader } from "./time-grid-header";

export interface TimeGridViewOptions<TEvent> {
  /** Registered view a week's header date opens, usually `"day"`; without it dates are static. */
  readonly dayView?: string;
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
}

export type TimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/**
 * Day columns under a sticky header and all-day row, with a scrolling 24-hour body. Drag an event
 * to move it (into the all-day row to make it all-day), its edges to resize it, or empty time to
 * create one; changes go to the root's `onEventChange`.
 */
export function TimeGridView<TEvent>({
  actions,
  environment,
  events,
  options,
  projection,
  range,
}: TimeGridViewProps<TEvent>) {
  const { days } = projection;
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => days.map(({ column }) => column), [days]);
  const pointerRef = useCalendarPointer({
    columns,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: scrollRef,
    timeZone: environment.timeZone,
  });
  const labelEvent = useEventLabel(environment, options.describeEvent);

  return (
    // Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell.
    <div
      ref={pointerRef}
      role="grid"
      aria-label={timeGridTitle(range, environment.locale)}
      data-slot="time-grid"
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] [--calendar-gutter-width:3rem] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize sm:[--calendar-gutter-width:4rem]"
    >
      <div className="shrink-0 overflow-hidden border-b border-calendar-grid [scrollbar-gutter:stable]">
        <TimeGridHeader
          actions={actions}
          days={days}
          dayView={options.dayView}
          environment={environment}
        />
        <TimeGridAllDay
          days={days}
          getEventColor={options.getEventColor}
          labelEvent={labelEvent}
          row={projection.allDay}
        />
      </div>
      <TimeGridBody
        days={days}
        environment={environment}
        getEventColor={options.getEventColor}
        labelEvent={labelEvent}
        scrollRef={scrollRef}
      />
    </div>
  );
}

function timeGridView<const TName extends string, TEvent>(
  name: TName,
  span: TimeGridSpan,
  defaultOptions: TimeGridViewOptions<TEvent>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: timeGridStrategy<TimeGridViewOptions<TEvent>, TEvent>(span),
    Renderer: TimeGridView<TEvent>,
  });
}

/** Seven columns starting on the calendar's `weekRules.firstDay`. */
export function createWeekView<TEvent = unknown>(defaultOptions: TimeGridViewOptions<TEvent> = {}) {
  return timeGridView("week", { kind: "week" }, defaultOptions);
}

/** One column for the anchor date. */
export function createDayView<TEvent = unknown>(defaultOptions: TimeGridViewOptions<TEvent> = {}) {
  return timeGridView("day", { count: 1, kind: "days" }, defaultOptions);
}
