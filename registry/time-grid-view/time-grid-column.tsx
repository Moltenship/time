import {
  instantInterval,
  sameFocus,
  timedFragmentBox,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type CalendarEventPlacement,
  type CalendarSlotFocus,
  type TimeGridBand,
  type TimeGridColumn as Column,
  type TimeGridDay,
} from "@moltenship/calendar";

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
  readonly formats: TimeGridEventFormats & {
    /** A slot's date and time, for its accessible name. */
    readonly slot: Intl.DateTimeFormat;
  };
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly timeZone: string;
}

function bandStyle({ height, top }: TimeGridBand) {
  return { height: percent(height), top: percent(top) };
}

const DAY_MINUTES = 24 * 60;

/** Where a keyboard create's timed draft falls in a column, or `null` when it misses it. */
function draftBox(column: Column, placement: CalendarEventPlacement): TimeGridBand | null {
  const day = column.day.interval;
  if (day === null || placement.kind === "all-day") return null;
  const instant = (point: Temporal.Instant | Temporal.PlainDateTime) =>
    point instanceof Temporal.Instant
      ? point
      : point.toZonedDateTime(column.day.timeZone).toInstant();
  const start = instant(placement.start);
  const end = instant(placement.end);
  const from = Temporal.Instant.compare(start, day.start) > 0 ? start : day.start;
  const to = Temporal.Instant.compare(end, day.end) < 0 ? end : day.end;
  return Temporal.Instant.compare(from, to) < 0
    ? timedFragmentBox(column, instantInterval(from, to))
    : null;
}

function sameBand(left: TimeGridBand | null, right: TimeGridBand | null): boolean {
  return left === right || (left?.top === right?.top && left?.height === right?.height);
}

/**
 * The keyboard's cursor on a slot of this column, rendered only while a slot has focus. Space
 * starts a create there and Enter moves into the events covering it.
 */
function TimeGridSlot({
  focus,
  label,
  onOpenDay,
  slotMinutes,
}: {
  readonly focus: CalendarSlotFocus;
  readonly label: string;
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly slotMinutes: number;
}) {
  const roving = useRovingFocus(focus);
  const minutes = focus.time.hour * 60 + focus.time.minute;

  return (
    <div
      role="button"
      aria-label={label}
      {...roving}
      onKeyDown={(event) => {
        // Shift+Enter opens the day, as clicking its header date does.
        if (onOpenDay !== undefined && event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenDay(focus.date);
        }
      }}
      className="pointer-events-none absolute inset-x-0 z-10 rounded-sm focus-visible:bg-calendar-selection focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring"
      style={{ height: percent(slotMinutes / DAY_MINUTES), top: percent(minutes / DAY_MINUTES) }}
    />
  );
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
  onOpenDay,
  slotMinutes,
  timeZone,
}: TimeGridColumnProps<TEvent>) {
  const slot = useCalendarFocus(
    (focus) => (focus?.kind === "slot" && focus.date.equals(column.date) ? focus : null),
    { isEqual: sameFocus },
  );
  const draft = useCalendarInteraction(
    (session) => (session?.eventId === null ? draftBox(column, session.proposed) : null),
    { isEqual: sameBand },
  );

  return (
    <div
      role="gridcell"
      data-date={column.date.toString()}
      data-today={isToday ? "" : undefined}
      className="relative min-w-0 border-s border-calendar-grid"
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
      {/* The inline-end margin keeps a strip free for creating an event beside busy blocks. */}
      <div className="absolute inset-y-0 start-0 end-2">
        {events.map((layout) => (
          <TimeGridEvent
            key={`${typeof layout.fragment.event.id}:${layout.fragment.event.id}`}
            color={getEventColor?.(layout.fragment.event.event)}
            labelEvent={labelEvent}
            layout={layout}
            formats={formats}
            timeZone={timeZone}
          />
        ))}
        {draft !== null && (
          <div
            aria-hidden
            data-slot="time-grid-draft"
            className="pointer-events-none absolute inset-x-0 rounded-md bg-calendar-selection"
            style={bandStyle(draft)}
          />
        )}
      </div>
      {slot !== null && (
        <TimeGridSlot
          focus={slot}
          label={formats.slot.format(slot.date.toPlainDateTime(slot.time))}
          onOpenDay={onOpenDay}
          slotMinutes={slotMinutes}
        />
      )}
      {nowTop !== null && (
        <div
          aria-hidden
          data-slot="time-grid-now"
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-calendar-now",
            "before:absolute before:-top-1 before:-start-1.5 before:size-2.5 before:rounded-full before:bg-calendar-now",
          )}
          style={{ top: percent(nowTop) }}
        />
      )}
    </div>
  );
}
