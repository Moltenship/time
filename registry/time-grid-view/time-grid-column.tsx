import {
  instantInterval,
  sameFocus,
  showsInResource,
  timedFragmentBox,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type CalendarEventPlacement,
  type CalendarFocus,
  type CalendarSlotFocus,
  type ResourceId,
  type TimeGridBand,
  type TimeGridColumn as Column,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useMemo } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import { percent, TimeGridEvent, type TimeGridEventFormats } from "./time-grid-event";

export interface TimeGridColumnFormats extends TimeGridEventFormats {
  /** A slot's date and time, for its accessible name. */
  readonly slot: Intl.DateTimeFormat;
}

/** The formats a column reads, made once per locale for all of a grid's columns. */
export function useTimeGridColumnFormats(locale: Intl.LocalesArgument): TimeGridColumnFormats {
  return useMemo(
    () => ({
      dayTime: new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        weekday: "short",
      }),
      slot: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "long",
        weekday: "long",
      }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    }),
    [locale],
  );
}

/** The resource a column shows, in a view with a column per resource. */
export interface TimeGridColumnResource {
  /** `null` for the unassigned bucket. */
  readonly id: ResourceId | null;
  /** Added to the accessible names of the column's slots and events. */
  readonly title: string;
}

export interface TimeGridColumnProps<TEvent> {
  /** The column's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  readonly day: TimeGridDay<TEvent>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Position of the now-line when the current time falls in this column. */
  readonly nowTop: number | null;
  readonly formats: TimeGridColumnFormats;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** The column's resource; without one, the column shows every resource's focus and drafts. */
  readonly resource?: TimeGridColumnResource;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly timeZone: string;
}

/** Whether focus is in a column's or row's resource; a side without one matches any resource. */
export function inResource(
  focus: CalendarFocus,
  resourceId: ResourceId | null | undefined,
): boolean {
  return (
    resourceId === undefined || focus.resourceId === undefined || focus.resourceId === resourceId
  );
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
  colIndex,
  day: { column, events, isToday },
  getEventColor,
  labelEvent,
  nowTop,
  formats,
  onOpenDay,
  resource,
  slotMinutes,
  timeZone,
}: TimeGridColumnProps<TEvent>) {
  const resourceId = resource?.id;
  const slot = useCalendarFocus(
    (focus) =>
      focus?.kind === "slot" && focus.date.equals(column.date) && inResource(focus, resourceId)
        ? focus
        : null,
    { isEqual: sameFocus },
  );
  const draft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      (resourceId === undefined || showsInResource(session.proposed.resourceIds, resourceId))
        ? draftBox(column, session.proposed)
        : null,
    { isEqual: sameBand },
  );
  const labelHere = useMemo<EventLabeler<TEvent>>(
    () => (resource === undefined ? labelEvent : (event) => labelEvent(event, resource.title)),
    [labelEvent, resource],
  );

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
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
            labelEvent={labelHere}
            layout={layout}
            formats={formats}
            resourceId={resourceId}
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
          // The column's own resource, so a gesture started here stays in it.
          focus={resourceId === undefined ? slot : { ...slot, resourceId }}
          label={[resource?.title, formats.slot.format(slot.date.toPlainDateTime(slot.time))]
            .filter((part) => part !== undefined)
            .join(", ")}
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
