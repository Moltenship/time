import {
  defineCalendarView,
  timeGridStrategy,
  type CalendarViewRendererProps,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { TimeGridAllDay } from "./time-grid-all-day";
import { TimeGridBody } from "./time-grid-body";
import { TimeGridHeader } from "./time-grid-header";

export interface TimeGridViewOptions<TEvent> {
  /** Registered view a week's header date opens, usually `"day"`; without it dates are static. */
  readonly dayView?: string;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
}

export type TimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/** Day columns under a sticky header and all-day row, with a scrolling 24-hour body. */
export function TimeGridView<TEvent>({
  actions,
  environment,
  options,
  projection,
}: TimeGridViewProps<TEvent>) {
  const { days } = projection;

  return (
    <div
      data-slot="time-grid"
      className="flex h-full min-h-0 flex-col [--calendar-gutter-width:3rem] sm:[--calendar-gutter-width:4rem]"
    >
      <div className="shrink-0 overflow-hidden border-b border-calendar-grid [scrollbar-gutter:stable]">
        <TimeGridHeader
          actions={actions}
          days={days}
          dayView={options.dayView}
          environment={environment}
        />
        <TimeGridAllDay days={days} getEventColor={options.getEventColor} row={projection.allDay} />
      </div>
      <TimeGridBody days={days} environment={environment} getEventColor={options.getEventColor} />
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
