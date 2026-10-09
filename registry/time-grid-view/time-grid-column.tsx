import type { TimeGridBand, TimeGridDay } from "@moltenship/calendar";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import { percent, TimeGridEvent, type TimeGridEventFormats } from "./time-grid-event";

export interface TimeGridColumnProps<TEvent> {
  readonly day: TimeGridDay<TEvent>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Position of the now-line when the current time falls in this column. */
  readonly nowTop: number | null;
  readonly formats: TimeGridEventFormats;
  readonly timeZone: string;
}

function bandStyle({ height, top }: TimeGridBand) {
  return { height: percent(height), top: percent(top) };
}

/**
 * One day's 24 hours, a cell of the grid's timed row. `data-date` marks the full-height column for pointer hit-testing; spring
 * forward hours are hatched and repeated fall-back hours tinted.
 */
export function TimeGridColumn<TEvent>({
  day: { column, events, isToday },
  getEventColor,
  labelEvent,
  nowTop,
  formats,
  timeZone,
}: TimeGridColumnProps<TEvent>) {
  return (
    <div
      role="gridcell"
      data-date={column.date.toString()}
      data-today={isToday ? "" : undefined}
      className="relative min-w-0 border-l border-calendar-grid"
    >
      {column.gaps.map((band) => (
        <div
          key={`gap:${band.top}`}
          className="absolute inset-x-0 bg-[repeating-linear-gradient(-45deg,transparent_0_5px,var(--calendar-grid)_5px_6px)]"
          style={bandStyle(band)}
          title="Skipped: clocks moved forward"
        />
      ))}
      {column.folds.map((band) => (
        <div
          key={`fold:${band.top}`}
          className="absolute inset-x-0 bg-calendar-selection"
          style={bandStyle(band)}
          title="Repeated: clocks moved back"
        />
      ))}
      {/* The right margin keeps a strip free for creating an event beside busy blocks. */}
      <div className="absolute inset-y-0 right-2 left-0">
        {events.map((layout) => (
          <TimeGridEvent
            key={`${typeof layout.fragment.event.id}:${layout.fragment.event.id}`}
            color={getEventColor?.(layout.fragment.event.event)}
            label={labelEvent(layout.fragment.event)}
            layout={layout}
            formats={formats}
            timeZone={timeZone}
          />
        ))}
      </div>
      {nowTop !== null && (
        <div
          aria-hidden
          data-slot="time-grid-now"
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-calendar-now",
            "before:absolute before:-top-1 before:-left-1.5 before:size-2.5 before:rounded-full before:bg-calendar-now",
          )}
          style={{ top: percent(nowTop) }}
        />
      )}
    </div>
  );
}
