import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type {
  EventDayFragment,
  EventId,
  ResourceId,
  TimeGridEventLayout,
} from "@moltenship/calendar";
import { useRef, useState, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { TooltipContent } from "@registry/ui/tooltip";
import { cn } from "cn";

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
  return dash !== undefined && /^\s*[–—-]\s*$/u.test(dash) ? dash : " – ";
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
    return formats.time.formatRange(start.toPlainTime(), end.toPlainTime());
  }
  const dash = rangeDash(formats.time, start.toPlainTime(), end.toPlainTime());
  return `${formats.time.format(start.toPlainTime())}${dash}${formats.dayTime.format(end)}`;
}

/**
 * A positioned event: title and time range, or one compact line when short. Render a column's
 * events in layout order, so stacked events draw over the ones they overlap. Resize handles mark
 * the edges that belong to this day; continued edges are squared off instead. A short block keeps
 * one handle, and handles take at most a third of the height, so the rest still grabs to move.
 */
export function TimeGridEvent<TEvent>({
  color,
  formats,
  icon,
  labelEvent,
  layout,
  offscreen,
  resourceId,
  timeZone,
}: TimeGridEventProps<TEvent>) {
  const { fragment, height, left, top, width } = layout;
  const { event, endsAfterDay, startsBeforeDay } = fragment;
  const [start, end] = wallTimes(fragment, timeZone);
  const compact = height * 24 * 60 < COMPACT_MINUTES;
  const resizable = !event.isReadOnly;
  const chip = useEventChip(event, { date: fragment.date, labelEvent, offscreen, resourceId });
  const titleRef = useRef<HTMLSpanElement>(null);
  const [titleShown, setTitleShown] = useState(false);

  // A title that doesn't fit shows in full in a tooltip while the event is hovered or focused.
  return (
    <TooltipPrimitive.Root
      // Not while a keyboard gesture moves the event.
      disabled={offscreen || chip["data-grabbed"] !== undefined}
      onOpenChange={(open, details) => {
        // Escape belongs to the calendar, which cancels a gesture or leaves the event with it; the
        // tooltip only closes.
        if (details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
        }
        setTitleShown(open && isClipped(titleRef.current));
      }}
      open={titleShown}
    >
      {/* Base UI's own trigger, so the event keeps `data-slot="calendar-event"`. */}
      <TooltipPrimitive.Trigger
        render={
          <EventChip
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
            style={{
              height: percent(height),
              insetInlineStart: percent(left),
              top: percent(top),
              width: percent(width),
            }}
          />
        }
      >
        {compact ? (
          <span ref={titleRef} className="truncate">
            {/* Smaller, to fit the compact line without making it taller. */}
            <EventIcon className="size-2.5 [&_svg]:size-2.5">{icon}</EventIcon>
            {event.title}
            <span className="font-normal opacity-80">
              , <span data-event-time>{formats.time.format(start.toPlainTime())}</span>
            </span>
          </span>
        ) : (
          <>
            <span ref={titleRef} className="line-clamp-2">
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
      </TooltipPrimitive.Trigger>
      <TooltipContent>{event.title}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}
