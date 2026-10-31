"use client";

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
  type CalendarResource,
  type CalendarSlotFocus,
  type ResourceId,
  type TimeGridBand,
  type TimeGridColumn as Column,
  type TimeGridDay,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useMemo, type ReactNode } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import { previewCheckAttributes, useDraftCheck } from "@registry/stylex-calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/stylex-calendar/unavailable-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

import { describeAnnotationsAt } from "./annotation-label";
import {
  annotationEventInset,
  bandBesideMarks,
  eventsBesideMarks,
  TimeGridAnnotationProvider,
  TimeGridAnnotations,
  type TimeGridAnnotationMarkData,
  type TimeGridAnnotationWiring,
} from "./time-grid-annotations";
import {
  isUnavailableIn,
  TimeGridAvailability,
  useColumnAvailability,
} from "./time-grid-availability";
import { percent, TimeGridEvent, type TimeGridEventFormats } from "./time-grid-event";
import { describeZoneTimes, type TimeGridZone } from "./time-grid-zones";

const styles = stylex.create({
  column: {
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    minWidth: 0,
    position: "relative",
  },
  draft: {
    backgroundColor: {
      default: calendarVars["--calendar-selection"],
      "[data-invalid]": `color-mix(in oklch, ${calendarVars["--calendar-invalid"]} 15%, transparent)`,
    },
    borderRadius: "calc(var(--radius) * 0.8)",
    insetInline: 0,
    outlineColor: {
      default: null,
      "[data-invalid]": calendarVars["--calendar-invalid"],
      "[data-warning]": calendarVars["--calendar-warning"],
    },
    outlineOffset: { default: null, "[data-invalid]": -2, "[data-warning]": -2 },
    outlineStyle: { default: null, "[data-invalid]": "dashed", "[data-warning]": "dashed" },
    outlineWidth: { default: null, "[data-invalid]": 2, "[data-warning]": 2 },
    pointerEvents: "none",
    position: "absolute",
  },
  events: {
    insetBlock: 0,
    insetInlineEnd: "0.5rem",
    insetInlineStart: 0,
    position: "absolute",
  },
  fold: {
    backgroundColor: calendarVars["--calendar-selection"],
    insetInline: 0,
    position: "absolute",
  },
  gap: {
    backgroundImage: `repeating-linear-gradient(-45deg, transparent 0 5px, ${calendarVars["--calendar-grid"]} 5px 6px)`,
    insetInline: 0,
    position: "absolute",
  },
  now: {
    "::before": {
      backgroundColor: calendarVars["--calendar-now"],
      borderRadius: "9999px",
      content: '""',
      height: "0.625rem",
      insetInlineStart: "-0.375rem",
      position: "absolute",
      top: "-0.25rem",
      width: "0.625rem",
    },
    backgroundColor: calendarVars["--calendar-now"],
    height: "0.125rem",
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    transform: "translateY(-50%)",
    zIndex: 10,
  },
  slot: {
    backgroundColor: { default: null, ":focus-visible": calendarVars["--calendar-selection"] },
    borderRadius: "calc(var(--radius) * 0.6)",
    insetInline: 0,
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": -1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    pointerEvents: "none",
    position: "absolute",
    zIndex: 10,
  },
});

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
  /** `null` for the unassigned bucket. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  /** Added to the accessible names of the column's slots and events. */
  readonly title: string;
}

export interface TimeGridColumnProps<TEvent> {
  /** The root's annotations on this column's day, beside its events. */
  readonly annotations?: TimeGridAnnotationWiring & {
    readonly marks: readonly TimeGridAnnotationMarkData[];
  };
  /** The column's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  readonly day: TimeGridDay<TEvent>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Position of the now-line when the current time falls in this column. */
  readonly nowTop: number | null;
  readonly formats: TimeGridColumnFormats;
  /** Rendered beside the visible dates of a scrolling grid, so hidden from assistive technology. */
  readonly offscreen?: boolean;
  /** Opens a date in the day view; Shift+Enter on a slot does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  /** The column's resource; without one, the column shows every resource's focus and drafts. */
  readonly resource?: TimeGridColumnResource;
  /** Replaces the shading of closed time; see `UnavailableTimeRender`. */
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly timeZone: string;
  /** The root's secondary time zones; a focused slot names its time in each. */
  readonly zones?: readonly TimeGridZone[];
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

/** Where a slot sits on its column's 24-hour axis. */
function slotBand(slot: CalendarSlotFocus, slotMinutes: number): TimeGridBand {
  const minutes = slot.time.hour * 60 + slot.time.minute;
  return { height: slotMinutes / DAY_MINUTES, top: minutes / DAY_MINUTES };
}

/** The annotations drawn across a focused slot, named after its date and time. */
function slotAnnotations(
  column: Column,
  slot: CalendarSlotFocus,
  { formats, marks }: NonNullable<TimeGridColumnProps<unknown>["annotations"]>,
  slotMinutes: number,
): string | undefined {
  return describeAnnotationsAt(marks, column, slotBand(slot, slotMinutes), formats);
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
  offscreen,
  onOpenDay,
  slotMinutes,
}: {
  readonly focus: CalendarSlotFocus;
  readonly label: string;
  /** In a column scrolled away: out of the tab order, yet still holding focus it has. */
  readonly offscreen: boolean;
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly slotMinutes: number;
}) {
  const roving = useRovingFocus(focus);
  const minutes = focus.time.hour * 60 + focus.time.minute;

  return (
    <div
      role="button"
      aria-label={label}
      {...(offscreen ? { tabIndex: -1 } : roving)}
      onKeyDown={(event) => {
        // Shift+Enter opens the day, as clicking its header date does.
        if (onOpenDay !== undefined && event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenDay(focus.date);
        }
      }}
      {...stylex.props(styles.slot)}
      style={{ height: percent(slotMinutes / DAY_MINUTES), top: percent(minutes / DAY_MINUTES) }}
    />
  );
}

/**
 * One day's 24 hours, a cell of the grid's timed row. `data-date` marks the full-height column for pointer hit-testing; spring
 * forward hours are hatched and repeated fall-back hours tinted.
 */
export function TimeGridColumn<TEvent>({
  annotations,
  colIndex,
  day: { column, events, isToday },
  getEventColor,
  getEventIcon,
  isReadOnly,
  labelEvent,
  nowTop,
  formats,
  offscreen = false,
  onOpenDay,
  renderUnavailable,
  resource,
  slotMinutes,
  timeZone,
  zones,
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
  const draftCheck = useDraftCheck();
  const unavailable = useColumnAvailability(column, resourceId);
  const Annotations = annotations?.layout.options.Annotations ?? TimeGridAnnotations;
  // A new object each render; its layout and marks keep their identity.
  const annotationLayout = annotations?.layout;
  const marks = annotations?.marks;
  const inset = useMemo(
    () => (annotationLayout === undefined ? undefined : annotationEventInset(annotationLayout)),
    [annotationLayout],
  );
  const besideMarks = useMemo(
    () =>
      annotationLayout === undefined || marks === undefined || inset === undefined
        ? undefined
        : eventsBesideMarks(annotationLayout, marks, events),
    [annotationLayout, events, inset, marks],
  );
  const labelHere = useMemo<EventLabeler<TEvent>>(
    () => (resource === undefined ? labelEvent : (event) => labelEvent(event, resource.title)),
    [labelEvent, resource],
  );

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
      aria-hidden={offscreen ? true : undefined}
      data-date={column.date.toString()}
      data-today={isToday ? "" : undefined}
      {...stylex.props(styles.column)}
    >
      <TimeGridAvailability
        bands={unavailable}
        date={column.date}
        render={renderUnavailable}
        resource={resource?.resource ?? null}
      />
      {column.gaps.map((band) => (
        <div
          key={`gap:${band.top}`}
          {...stylex.props(styles.gap)}
          style={bandStyle(band)}
          title="Skipped: clocks moved forward"
        />
      ))}
      {column.folds.map((band) => (
        <div
          key={`fold:${band.top}`}
          {...stylex.props(styles.fold)}
          style={bandStyle(band)}
          title="Repeated: clocks moved back"
        />
      ))}
      {annotations !== undefined && (
        <TimeGridAnnotationProvider handles={annotations.handles} layout={annotations.layout}>
          <Annotations marks={annotations.marks} />
        </TimeGridAnnotationProvider>
      )}
      {/* The inline-end margin keeps a strip free for creating an event beside busy blocks. The
          rail takes its strip only from the events beside its marks. */}
      <div {...stylex.props(styles.events)}>
        {events.map((layout, index) => (
          <TimeGridEvent
            key={`${typeof layout.fragment.event.id}:${layout.fragment.event.id}`}
            color={getEventColor?.(layout.fragment.event.event)}
            icon={getEventIcon?.(layout.fragment.event.event)}
            inset={besideMarks?.[index] === true ? inset : undefined}
            isReadOnly={isReadOnly}
            labelEvent={labelHere}
            layout={layout}
            formats={formats}
            offscreen={offscreen}
            resourceId={resourceId}
            timeZone={timeZone}
          />
        ))}
        {draft !== null && (
          <div
            aria-hidden
            data-slot="time-grid-draft"
            {...previewCheckAttributes(draftCheck)}
            {...stylex.props(styles.draft)}
            style={{
              ...bandStyle(draft),
              ...(inset !== undefined &&
                annotationLayout !== undefined &&
                marks !== undefined &&
                bandBesideMarks(annotationLayout, marks, draft) && {
                  insetInlineEnd: inset.end,
                  insetInlineStart: inset.start,
                }),
            }}
          />
        )}
      </div>
      {slot !== null && (
        <TimeGridSlot
          // The column's own resource, so a gesture started here stays in it.
          focus={resourceId === undefined ? slot : { ...slot, resourceId }}
          label={[
            resource?.title,
            formats.slot.format(slot.date.toPlainDateTime(slot.time)),
            zones === undefined ? undefined : describeZoneTimes(column, slot.time, zones, formats),
            isUnavailableIn(unavailable, slotBand(slot, slotMinutes))
              ? "outside working hours"
              : undefined,
            annotations === undefined
              ? undefined
              : slotAnnotations(column, slot, annotations, slotMinutes),
          ]
            .filter((part) => part !== undefined)
            .join(", ")}
          offscreen={offscreen}
          onOpenDay={onOpenDay}
          slotMinutes={slotMinutes}
        />
      )}
      {nowTop !== null && (
        <div
          aria-hidden
          data-slot="time-grid-now"
          {...stylex.props(styles.now)}
          style={{ top: percent(nowTop) }}
        />
      )}
    </div>
  );
}
