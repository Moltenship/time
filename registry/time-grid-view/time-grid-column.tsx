"use client";

import {
  sameFocus,
  showsInResource,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type CalendarResource,
  type CalendarSlotFocus,
  type ResourceId,
  type TimeGridColumn as Column,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useMemo, type ReactNode } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  bandBox,
  draftBox,
  eventKey,
  inResource,
  percent,
  sameBand,
  slotBand,
} from "@registry/shared/time-grid-view/time-grid-geometry";
import {
  clockChangeTitles,
  outsideWorkingHours,
  slotLabel,
  timeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridColumnClass,
  timeGridDraftClass,
  timeGridEventsClass,
  timeGridFoldClass,
  timeGridGapClass,
  timeGridNowClass,
  timeGridSlotClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

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
import { TimeGridEvent } from "./time-grid-event";
import { describeZoneTimes, type TimeGridZone } from "./time-grid-zones";

export { inResource } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridColumnFormats } from "@registry/shared/time-grid-view/time-grid-labels";

/** The formats a column reads, made once per locale for all of a grid's columns. */
export function useTimeGridColumnFormats(locale: Intl.LocalesArgument): TimeGridColumnFormats {
  return useMemo(() => timeGridColumnFormats(locale), [locale]);
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

/** The annotations drawn across a focused slot, named after its date and time. */
function slotAnnotations(
  column: Column,
  slot: CalendarSlotFocus,
  { formats, marks }: NonNullable<TimeGridColumnProps<unknown>["annotations"]>,
  slotMinutes: number,
): string | undefined {
  return describeAnnotationsAt(marks, column, slotBand(slot, slotMinutes), formats);
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
      className={timeGridSlotClass}
      style={bandBox(slotBand(focus, slotMinutes))}
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
      className={timeGridColumnClass}
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
          className={timeGridGapClass}
          style={bandBox(band)}
          title={clockChangeTitles.gap}
        />
      ))}
      {column.folds.map((band) => (
        <div
          key={`fold:${band.top}`}
          className={timeGridFoldClass}
          style={bandBox(band)}
          title={clockChangeTitles.fold}
        />
      ))}
      {annotations !== undefined && (
        <TimeGridAnnotationProvider handles={annotations.handles} layout={annotations.layout}>
          <Annotations marks={annotations.marks} />
        </TimeGridAnnotationProvider>
      )}
      {/* The inline-end margin keeps a strip free for creating an event beside busy blocks. The
          rail takes its strip only from the events beside its marks. */}
      <div className={timeGridEventsClass}>
        {events.map((layout, index) => (
          <TimeGridEvent
            key={eventKey(layout.fragment.event.id)}
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
            className={timeGridDraftClass(draftCheckClassName)}
            style={{
              ...bandBox(draft),
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
          label={slotLabel([
            resource?.title,
            formats.slot.format(slot.date.toPlainDateTime(slot.time)),
            zones === undefined ? undefined : describeZoneTimes(column, slot.time, zones, formats),
            isUnavailableIn(unavailable, slotBand(slot, slotMinutes))
              ? outsideWorkingHours
              : undefined,
            annotations === undefined
              ? undefined
              : slotAnnotations(column, slot, annotations, slotMinutes),
          ])}
          offscreen={offscreen}
          onOpenDay={onOpenDay}
          slotMinutes={slotMinutes}
        />
      )}
      {nowTop !== null && (
        <div
          aria-hidden
          data-slot="time-grid-now"
          className={timeGridNowClass}
          style={{ top: percent(nowTop) }}
        />
      )}
    </div>
  );
}
