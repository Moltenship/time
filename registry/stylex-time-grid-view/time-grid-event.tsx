"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  withAsciiSpaces,
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridEventLayout,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  calendarConsts,
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

import type { AnnotationEventInset } from "./time-grid-annotations";

const slideFromBottom = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, 0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromLeft = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(-0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromRight = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0.5rem, 0, 0) scale3d(0.95, 0.95, 0.95)" },
});
const slideFromTop = stylex.keyframes({
  from: { opacity: 0, transform: "translate3d(0, -0.5rem, 0) scale3d(0.95, 0.95, 0.95)" },
});
const zoomOut = stylex.keyframes({
  to: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" },
});

const styles = stylex.create({
  // Raised while hovered, and above that while focused, so a stacked event's title shows over the
  // ones covering it, wherever the pointer rests.
  event: {
    alignItems: "stretch",
    boxShadow: {
      default: `0 0 0 1px ${calendarConsts.surface}`,
      "[data-grabbed]": {
        default: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
        "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      },
      "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}, 0 0 0 1px ${calendarConsts.surface}`,
      "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}, 0 0 0 1px ${calendarConsts.surface}`,
    },
    flexDirection: "column",
    gap: 0,
    paddingInline: calendarVars["--calendar-event-padding-x"],
    position: "absolute",
    zIndex: {
      default: null,
      ":focus": 20,
      ":focus-visible": 20,
      ":hover": 10,
      "[data-grabbed]": 20,
    },
  },
  eventCompact: {
    alignItems: "center",
    flexDirection: "row",
    fontSize: "0.6875rem",
    gap: "0.25rem",
    lineHeight: 1,
    paddingBlock: 0,
  },
  eventEndsAfter: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  eventFull: {
    paddingBlock: calendarVars["--calendar-event-padding-y"],
  },
  eventStartsBefore: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handle: {
    cursor: "ns-resize",
    height: "0.375rem",
    insetInline: 0,
    maxHeight: "calc(100% / 3)",
    position: "absolute",
  },
  handleEnd: {
    "::after": {
      backgroundColor: "currentColor",
      borderRadius: "9999px",
      content: '""',
      height: "0.125rem",
      marginBottom: "0.125rem",
      marginTop: "auto",
      opacity: { default: 0, [stylex.when.ancestor(":hover", calendarMarker)]: 0.4 },
      transitionDuration: "150ms",
      transitionProperty: "opacity",
      transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      width: "1rem",
    },
    bottom: 0,
    display: "flex",
    justifyContent: "center",
  },
  handleStart: {
    top: 0,
  },
  iconCompact: {
    "--calendar-event-icon-size": "0.625rem",
    height: "0.625rem",
    width: "0.625rem",
  },
  positioner: {
    isolation: "isolate",
    zIndex: 50,
  },
  time: {
    fontWeight: 400,
    opacity: 0.8,
  },
  timeRange: {
    fontVariantNumeric: "tabular-nums",
  },
  titleClamped: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    display: "-webkit-box",
    overflow: "hidden",
  },
  tooltip: {
    alignItems: "center",
    animationDuration: "150ms",
    animationName: {
      default: null,
      "[data-closed]": zoomOut,
      "[data-open]": {
        default: null,
        '[data-side="bottom"]': slideFromTop,
        '[data-side="inline-end"]': slideFromLeft,
        '[data-side="inline-start"]': slideFromRight,
        '[data-side="left"]': slideFromRight,
        '[data-side="right"]': slideFromLeft,
        '[data-side="top"]': slideFromBottom,
      },
    },
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "calc(var(--radius) * 0.8)",
    color: calendarVars["--background"],
    display: "inline-flex",
    fontSize: "0.75rem",
    gap: "0.375rem",
    lineHeight: "1rem",
    maxWidth: "20rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    transformOrigin: "var(--transform-origin)",
    width: "fit-content",
    zIndex: 50,
  },
  tooltipArrow: {
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "2px",
    bottom: { default: null, '[data-side="top"]': "-0.625rem" },
    fill: calendarVars["--foreground"],
    height: "0.625rem",
    left: {
      default: null,
      '[data-side="inline-end"]': "-0.25rem",
      '[data-side="right"]': "-0.25rem",
    },
    right: {
      default: null,
      '[data-side="inline-start"]': "-0.25rem",
      '[data-side="left"]': "-0.25rem",
    },
    rotate: "45deg",
    top: {
      default: null,
      '[data-side="bottom"]': "0.25rem",
      '[data-side="inline-end"]': "50% !important",
      '[data-side="inline-start"]': "50% !important",
      '[data-side="left"]': "50% !important",
      '[data-side="right"]': "50% !important",
    },
    translate: {
      default: "0 calc(-50% - 2px)",
      '[data-side="inline-end"]': "0 -50%",
      '[data-side="inline-start"]': "0 -50%",
      '[data-side="left"]': "0 -50%",
      '[data-side="right"]': "0 -50%",
    },
    width: "0.625rem",
    zIndex: 50,
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

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

/** The title in full, for an event too small to show it. */
function TooltipContent({ children }: { readonly children: ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align="center"
        alignOffset={0}
        side="top"
        sideOffset={4}
        {...stylex.props(styles.positioner)}
      >
        <TooltipPrimitive.Popup data-slot="tooltip-content" {...stylex.props(styles.tooltip)}>
          {children}
          <TooltipPrimitive.Arrow {...stylex.props(styles.tooltipArrow)} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/**
 * A positioned event: title and time range, or one compact line when short. Render a column's
 * events in layout order, so stacked events draw over the ones they overlap. Resize handles mark
 * the edges that belong to this day, unless the event or the root is read-only; continued edges
 * are squared off instead. A short block keeps one handle, and handles take at most a third of the
 * height, so the rest still grabs to move.
 */
export function TimeGridEvent<TEvent>({
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
  const { fragment, height, left, top, width } = layout;
  const { event, endsAfterDay, startsBeforeDay } = fragment;
  const [start, end] = wallTimes(fragment, timeZone);
  const compact = height * 24 * 60 < COMPACT_MINUTES;
  const resizable = !isReadOnly && !event.isReadOnly;
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
            style={{ height: percent(height), top: percent(top), ...laneBox(left, width, inset) }}
            xstyle={[
              styles.event,
              calendarMarker,
              compact ? styles.eventCompact : styles.eventFull,
              startsBeforeDay && styles.eventStartsBefore,
              endsAfterDay && styles.eventEndsAfter,
            ]}
          />
        }
      >
        {compact ? (
          <span ref={titleRef} {...stylex.props(styles.truncate)}>
            <span data-slot="calendar-event-title">
              {/* Smaller, to fit the compact line without making it taller. */}
              <EventIcon xstyle={styles.iconCompact}>{icon}</EventIcon>
              {event.title}
            </span>
            <span {...stylex.props(styles.time)}>
              , <span data-event-time>{formats.time.format(start.toPlainTime())}</span>
            </span>
          </span>
        ) : (
          <>
            <span
              ref={titleRef}
              data-slot="calendar-event-title"
              {...stylex.props(styles.titleClamped)}
            >
              <EventIcon>{icon}</EventIcon>
              {event.title}
            </span>
            <span data-event-time {...stylex.props(styles.truncate, styles.time, styles.timeRange)}>
              {eventTimeRange(start, end, formats)}
            </span>
          </>
        )}
        {resizable && !startsBeforeDay && (!compact || endsAfterDay) && (
          <span
            aria-hidden
            data-resize="start"
            {...stylex.props(styles.handle, styles.handleStart)}
          />
        )}
        {resizable && !endsAfterDay && (
          <span aria-hidden data-resize="end" {...stylex.props(styles.handle, styles.handleEnd)} />
        )}
      </TooltipPrimitive.Trigger>
      <TooltipContent>{event.title}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}
