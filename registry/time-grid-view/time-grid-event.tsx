"use client";

import {
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridEventLayout,
} from "@moltenship/calendar";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipHandle,
} from "@registry/calendar-ui/tooltip";
import {
  isClipped,
  isCompact,
  laneBox,
  percent,
  resizeHandles,
  wallTimes,
  eventTimeRange,
  type TimeGridEventFormats,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import { compactTimeSeparator } from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridCompactIconClass,
  timeGridCompactLineClass,
  timeGridCompactTimeClass,
  timeGridEventClass,
  timeGridEventTimeClass,
  timeGridEventTitleClass,
  timeGridResizeEndClass,
  timeGridResizeStartClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import type { AnnotationEventInset } from "./time-grid-annotations";

export { eventTimeRange, percent } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridEventFormats } from "@registry/shared/time-grid-view/time-grid-geometry";

export interface TimeGridEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly formats: TimeGridEventFormats;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
  /**
   * Px kept free at each side of the event area, for the annotation rail when a mark is beside
   * the event or the events it shares space with. Its lanes share the rest.
   */
  readonly inset?: AnnotationEventInset;
  /** The root takes no changes, so the event has no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly layout: TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>;
  /** Rendered beside the visible dates of a scrolling grid: not a focus target. */
  readonly offscreen?: boolean;
  /** The resource this copy shows in, in a view with a column per resource. */
  readonly resourceId?: ResourceId | null;
  readonly timeZone: string;
}

/** What an event hands the shared tooltip: its full name, its title, and whether it's cut short. */
interface EventTooltipPayload {
  readonly clipped: () => boolean;
  readonly label: string;
  readonly title: string;
}

const EventTooltipContext = createContext<TooltipHandle<EventTooltipPayload> | undefined>(
  undefined,
);

/**
 * One tooltip for every event inside it, so a grid of hundreds of events mounts one tooltip
 * rather than one each. Wrap a view's grid in it; it renders the tooltip after the grid, not
 * inside it. An event outside one brings its own.
 */
export function TimeGridEventTooltip({ children }: { readonly children?: ReactNode }) {
  const [handle] = useState(() => createTooltipHandle<EventTooltipPayload>());
  return (
    <EventTooltipContext value={handle}>
      {children}
      <Tooltip
        // A clipped title shows at once, as the annotations' tooltip does.
        delay={0}
        handle={handle}
        onOpenChange={(open, details) => {
          // A title that fits needs no tooltip; one passed on by an event it fits closes.
          if (!open || details.payload?.clipped() === true) return;
          details.cancel();
          handle.close();
        }}
      >
        {({ payload }) => (
          // The tooltip names the event, so it carries the event's full name.
          <TooltipContent aria-label={payload?.label}>{payload?.title}</TooltipContent>
        )}
      </Tooltip>
    </EventTooltipContext>
  );
}

/**
 * A positioned event: title and time range, or one compact line when short. Render a column's
 * events in layout order, so stacked events draw over the ones they overlap. Resize handles mark
 * the edges that belong to this day, unless the event or the root is read-only; continued edges
 * are squared off instead. A short block keeps one handle, and handles take at most a third of the
 * height, so the rest still grabs to move.
 */
export function TimeGridEvent<TEvent>(props: TimeGridEventProps<TEvent>) {
  return use(EventTooltipContext) === undefined ? (
    <TimeGridEventTooltip>
      <EventBlock {...props} />
    </TimeGridEventTooltip>
  ) : (
    <EventBlock {...props} />
  );
}

function EventBlock<TEvent>({
  color,
  formats,
  icon,
  inset,
  isReadOnly = false,
  labelEvent,
  layout,
  offscreen,
  resourceId,
  timeZone,
}: TimeGridEventProps<TEvent>) {
  const tooltip = use(EventTooltipContext);
  const { fragment, height, left, top, width } = layout;
  const { event, endsAfterDay, startsBeforeDay } = fragment;
  const [start, end] = wallTimes(fragment, timeZone);
  const compact = isCompact(height);
  const handles = resizeHandles(fragment, compact, !isReadOnly && !event.isReadOnly);
  const chip = useEventChip(event, { date: fragment.date, labelEvent, offscreen, resourceId });
  const titleRef = useRef<HTMLSpanElement>(null);

  const grabbed = chip["data-grabbed"] !== undefined;
  // Not while a keyboard gesture moves the event.
  useEffect(() => {
    if (grabbed) tooltip?.close();
  }, [grabbed, tooltip]);

  // A title that doesn't fit shows in full in the tooltip while the event is hovered or focused.
  return (
    <TooltipTrigger
      handle={tooltip}
      payload={{
        clipped: () => !offscreen && !grabbed && isClipped(titleRef.current),
        label: chip["aria-label"],
        title: event.title,
      }}
      render={
        <EventChip
          // Given here, the trigger's own slot doesn't replace the event's.
          data-slot="calendar-event"
          color={color}
          {...chip}
          className={timeGridEventClass(compact, startsBeforeDay, endsAfterDay)}
          style={{ height: percent(height), top: percent(top), ...laneBox(left, width, inset) }}
        />
      }
    >
      {compact ? (
        <span ref={titleRef} className={timeGridCompactLineClass}>
          <span data-slot="calendar-event-title">
            <EventIcon className={timeGridCompactIconClass}>{icon}</EventIcon>
            {event.title}
          </span>
          <span className={timeGridCompactTimeClass}>
            {compactTimeSeparator}
            <span data-event-time>{formats.time.format(start.toPlainTime())}</span>
          </span>
        </span>
      ) : (
        <>
          <span ref={titleRef} data-slot="calendar-event-title" className={timeGridEventTitleClass}>
            <EventIcon>{icon}</EventIcon>
            {event.title}
          </span>
          <span data-event-time className={timeGridEventTimeClass}>
            {eventTimeRange(start, end, formats)}
          </span>
        </>
      )}
      {handles.start && (
        <span aria-hidden data-resize="start" className={timeGridResizeStartClass} />
      )}
      {handles.end && <span aria-hidden data-resize="end" className={timeGridResizeEndClass} />}
    </TooltipTrigger>
  );
}
