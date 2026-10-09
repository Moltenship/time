import {
  defineCalendarView,
  timeGridStrategy,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarPointer,
  type CalendarViewRendererProps,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar";
import { useMemo, useRef } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
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

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;

export type TimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/**
 * Day columns under a sticky header and all-day row, with a scrolling 24-hour body. Drag an event
 * to move it (into the all-day row to make it all-day), its edges to resize it, or empty time to
 * create one; changes go to the root's `onEventChange`. From the keyboard the grid is one tab
 * stop: arrow keys move between all-day cells, 15-minute slots, and events, and Space picks up an
 * event (Shift+Space to resize) or starts an event on the focused slot or day.
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
  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    columns,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: scrollRef,
    snap,
    timeZone: environment.timeZone,
  });
  const keyboard = useViewKeyboard({ snap });
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(environment.locale, { dateStyle: "full" });
    return (date: Temporal.PlainDate) => format.format(date);
  }, [environment.locale]);
  const { dayView } = options;
  const openDay =
    dayView === undefined || days.length === 1
      ? undefined
      : (date: Temporal.PlainDate) => {
          actions.setAnchorDate(date);
          actions.setView(dayView);
        };

  return (
    // Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell.
    <div
      ref={pointerRef}
      role="grid"
      aria-label={timeGridTitle(range, environment.locale)}
      {...keyboard}
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
          formatDate={formatDate}
          getEventColor={options.getEventColor}
          labelEvent={labelEvent}
          onOpenDay={openDay}
          row={projection.allDay}
        />
      </div>
      <TimeGridBody
        days={days}
        environment={environment}
        getEventColor={options.getEventColor}
        labelEvent={labelEvent}
        onOpenDay={openDay}
        scrollRef={scrollRef}
        slotMinutes={snap.increment}
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
