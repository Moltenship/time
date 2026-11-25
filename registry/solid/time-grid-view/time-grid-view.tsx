import {
  defineCalendarView,
  timeGridStrategy,
  timeGridTitle,
  type CalendarViewRendererProps,
  type OverlapLayoutOptions,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo } from "solid-js";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { fullDateFormat } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridHeadClass,
  timeGridViewClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { TimeGridAllDay } from "./time-grid-all-day";
import { TimeGridBody } from "./time-grid-body";
import { TimeGridEventTooltip } from "./time-grid-event";
import { TimeGridHeader } from "./time-grid-header";
import { gutterStyle, useTimeGridZones } from "./time-grid-zones";

/**
 * Overlapping events sit side by side in lanes (`overlapLayout: "columns"`, the default), in lanes
 * of equal width (`"equal"`), or cascade (`"stack"`, indented by `stackIndent`).
 * `getEventOverlapLayout` gives events their own layout, such as their calendar's: a group of
 * overlapping events that all agree takes it, and any other group `overlapLayout`.
 */
export interface TimeGridViewOptions<TEvent> extends OverlapLayoutOptions<TEvent> {
  /** Registered view a week's header date opens, usually `"day"`; without it dates are static. */
  readonly dayView?: string;
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
}

export type TimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/**
 * Day columns under a sticky header and all-day row, with a scrolling 24-hour body. Today's
 * column shows the current time as a line, overlapping events share the column in lanes, and the
 * all-day row collapses busy days to three lanes and "+N more". The grid is one tab stop.
 */
export function TimeGridView<TEvent>(props: TimeGridViewProps<TEvent>) {
  const days = () => props.projection.days;
  const columns = createMemo(() => days().map(({ column }) => column));
  const zones = useTimeGridZones(() => props.environment, columns);
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const formatDate = createMemo(() => fullDateFormat(props.environment.locale));

  return (
    <TimeGridEventTooltip>
      {/* Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell. */}
      <div
        role="grid"
        aria-label={timeGridTitle(props.range, props.environment.locale)}
        data-slot="time-grid"
        class={timeGridViewClass(props.isReadOnly)}
        style={gutterStyle(zones())}
      >
        <div class={timeGridHeadClass}>
          <TimeGridHeader
            actions={props.actions}
            days={days()}
            dayView={props.options.dayView}
            environment={props.environment}
            zones={zones()}
          />
          <TimeGridAllDay
            days={days()}
            formatDate={formatDate()}
            getEventColor={props.options.getEventColor}
            getEventIcon={props.options.getEventIcon}
            labelEvent={labelEvent()}
            row={props.projection.allDay}
          />
        </div>
        <TimeGridBody
          days={days()}
          environment={props.environment}
          getEventColor={props.options.getEventColor}
          getEventIcon={props.options.getEventIcon}
          isReadOnly={props.isReadOnly}
          labelEvent={labelEvent()}
          zones={zones()}
        />
      </div>
    </TimeGridEventTooltip>
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

/**
 * Three columns from the anchor date, named `3-day`: more than a day where a week's seven columns
 * don't fit, as on a phone. Previous and Next move three days.
 */
export function createThreeDayView<TEvent = unknown>(
  defaultOptions: TimeGridViewOptions<TEvent> = {},
) {
  return timeGridView("3-day", { count: 3, kind: "days" }, defaultOptions);
}
