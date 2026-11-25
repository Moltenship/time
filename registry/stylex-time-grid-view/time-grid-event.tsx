"use client";

import {
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type TimeGridEventLayout,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  calendarConsts,
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipHandle,
} from "@registry/stylex-calendar-ui/tooltip";

import {
  eventTimeRange,
  isClipped,
  isCompact,
  laneBox,
  percent,
  resizeHandles,
  wallTimes,
  type TimeGridEventFormats,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import { compactTimeSeparator } from "@registry/shared/time-grid-view/time-grid-labels";

import type { AnnotationEventInset } from "./time-grid-annotations";

export { eventTimeRange, percent } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridEventFormats } from "@registry/shared/time-grid-view/time-grid-geometry";

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
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

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
            {compactTimeSeparator}
            <span data-event-time>{formats.time.format(start.toPlainTime())}</span>
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
      {handles.start && (
        <span
          aria-hidden
          data-resize="start"
          {...stylex.props(styles.handle, styles.handleStart)}
        />
      )}
      {handles.end && (
        <span aria-hidden data-resize="end" {...stylex.props(styles.handle, styles.handleEnd)} />
      )}
    </TooltipTrigger>
  );
}
