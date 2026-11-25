"use client";

import {
  withAsciiSpaces,
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridEventLayout,
} from "@moltenship/calendar";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipHandle,
} from "@registry/calendar-ui/tooltip";
import { cn } from "cn";

import type { AnnotationEventInset } from "./time-grid-annotations";

type DayFragment = EventDayFragment<unknown, EventId, ResourceId>;

export interface TimeGridEventFormats {
  /** A wall time on another day, with its weekday. */
  readonly dayTime: Intl.DateTimeFormat;
  /** A wall time. */
  readonly time: Intl.DateTimeFormat;
}

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

/** Blocks shorter than this show title and start time on one line. */
const COMPACT_MINUTES = 45;

export function percent(fraction: number): string {
  return `${fraction * 100}%`;
}

/** Where a lane sits across the event area, less what `inset` keeps free at its sides. */
function laneBox(left: number, width: number, inset: AnnotationEventInset | undefined) {
  if (inset === undefined) return { insetInlineStart: percent(left), width: percent(width) };
  const area = `(100% - ${inset.start + inset.end}px)`;
  return {
    insetInlineStart: `calc(${inset.start}px + ${left} * ${area})`,
    width: `calc(${width} * ${area})`,
  };
}

/** The event's own start and end on the wall clock, even on the second day of an overnight event. */
function wallTimes({ event, end, start }: DayFragment, timeZone: string) {
  switch (event.kind) {
    case "timed":
      return [
        event.start.toZonedDateTimeISO(timeZone).toPlainDateTime(),
        event.end.toZonedDateTimeISO(timeZone).toPlainDateTime(),
      ] as const;
    case "floating":
      return [event.start, event.end] as const;
    case "all-day":
      return [start, end] as const;
  }
}

/** The dash between the ends of a same-day range in this locale, when it is a plain dash. */
function rangeDash(
  format: Intl.DateTimeFormat,
  start: Temporal.PlainTime,
  end: Temporal.PlainTime,
): string {
  const parts = format.formatRangeToParts(start, end);
  const dash = parts.find(
    (part, index) => part.source === "shared" && parts[index - 1]?.source === "startRange",
  )?.value;
  return dash !== undefined && /^\s*[–—-]\s*$/u.test(dash) ? withAsciiSpaces(dash) : " – ";
}

/**
 * Whether a title shows less than all of itself: cut short by its clamp or by its event's box.
 * Rounding can leave a pixel of overflow on a title that fits, so a pixel doesn't count.
 */
function isClipped(title: HTMLElement | null): boolean {
  const box = title?.closest("[data-event-id]")?.getBoundingClientRect();
  return (
    title != null &&
    box !== undefined &&
    (title.scrollWidth > title.clientWidth + 1 ||
      title.scrollHeight > title.clientHeight + 1 ||
      title.getBoundingClientRect().bottom > box.bottom + 1)
  );
}

/**
 * "18:15 – 19:00", or with the end's weekday when it falls on a later date ("18:15 – ter., 18:00"),
 * so an overnight event never reads as ending before it starts. Ending at the next midnight still
 * reads as a time.
 */
export function eventTimeRange(
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
  formats: TimeGridEventFormats,
): string {
  const nextMidnight = start.toPlainDate().add({ days: 1 }).toPlainDateTime();
  if (Temporal.PlainDateTime.compare(end, nextMidnight) <= 0) {
    return withAsciiSpaces(formats.time.formatRange(start.toPlainTime(), end.toPlainTime()));
  }
  const dash = rangeDash(formats.time, start.toPlainTime(), end.toPlainTime());
  return `${formats.time.format(start.toPlainTime())}${dash}${formats.dayTime.format(end)}`;
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
  const compact = height * 24 * 60 < COMPACT_MINUTES;
  const resizable = !isReadOnly && !event.isReadOnly;
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
          className={cn(
            // Raised while hovered, and above that while focused, so a stacked event's title shows
            // over the ones covering it, wherever the pointer rests. The padding falls back to the
            // old `px-1.5 py-1` for a theme copied before its tokens.
            "group absolute flex-col items-stretch gap-0 px-[var(--calendar-event-padding-x,calc(var(--spacing)*1.5))] shadow-[0_0_0_1px_var(--calendar-surface,var(--background))] hover:z-10 focus:z-20 focus-visible:z-20",
            compact
              ? "flex-row items-center gap-1 py-0 text-[0.6875rem] leading-none"
              : "py-[var(--calendar-event-padding-y,var(--spacing))]",
            startsBeforeDay && "rounded-t-none",
            endsAfterDay && "rounded-b-none",
          )}
          style={{ height: percent(height), top: percent(top), ...laneBox(left, width, inset) }}
        />
      }
    >
      {compact ? (
        <span ref={titleRef} className="truncate">
          <span data-slot="calendar-event-title">
            {/* Smaller, to fit the compact line without making it taller. */}
            <EventIcon className="size-2.5 [&_svg]:size-2.5">{icon}</EventIcon>
            {event.title}
          </span>
          <span className="font-normal opacity-80">
            , <span data-event-time>{formats.time.format(start.toPlainTime())}</span>
          </span>
        </span>
      ) : (
        <>
          <span ref={titleRef} data-slot="calendar-event-title" className="line-clamp-2">
            <EventIcon>{icon}</EventIcon>
            {event.title}
          </span>
          <span data-event-time className="truncate font-normal tabular-nums opacity-80">
            {eventTimeRange(start, end, formats)}
          </span>
        </>
      )}
      {resizable && !startsBeforeDay && (!compact || endsAfterDay) && (
        <span
          aria-hidden
          data-resize="start"
          className="absolute inset-x-0 top-0 h-1.5 max-h-1/3 cursor-ns-resize"
        />
      )}
      {resizable && !endsAfterDay && (
        <span
          aria-hidden
          data-resize="end"
          className="absolute inset-x-0 bottom-0 flex h-1.5 max-h-1/3 cursor-ns-resize justify-center after:mt-auto after:mb-0.5 after:h-0.5 after:w-4 after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover:after:opacity-40"
        />
      )}
    </TooltipTrigger>
  );
}
