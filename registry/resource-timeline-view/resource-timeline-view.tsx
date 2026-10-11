import {
  defineCalendarView,
  resourceTimelineSpatialNavigation,
  resourceTimelineStrategy,
  resourceTimelineTitle,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
  type CalendarDayFocus,
  type CalendarViewRendererProps,
  type PlainDateInterval,
  type ResourceTimelineOptions,
  type ResourceTimelineProjection,
  type ResourceTimelineSpan,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { ResourceTimelineGrid } from "./resource-timeline-grid";

export interface ResourceTimelineViewOptions<TEvent> extends ResourceTimelineOptions {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /**
   * Replaces the shading of closed time and closed days: an element, or a function of its props
   * and of the band, date and resource, such as a gradient into working hours or a tint for rooms.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

export type ResourceTimelineViewProps<TEvent> = CalendarViewRendererProps<
  ResourceTimelineProjection<TEvent>,
  ResourceTimelineViewOptions<TEvent>
>;

/** The grid's name: the title the toolbar shows for the range, "October 2026" for a month. */
function gridLabel(range: PlainDateInterval, locale: Intl.Locale | string): string {
  const days = range.start.until(range.end).days;
  const month = range.start.day === 1 && range.end.equals(range.start.add({ months: 1 }));
  return resourceTimelineTitle(
    range,
    month ? { kind: "month" } : { count: days, kind: "days" },
    locale,
  );
}

/** Pointer and keyboard both step by these slots in an hour timeline, so they reach the same times. */
const snap = { increment: 30, smallestUnit: "minute" } as const;
/** The calendar's default slots, in which it finds where focus enters a view. */
const entrySnap = { increment: 15, smallestUnit: "minute" } as const;

/**
 * Resources as rows and time as columns, with each resource's events as bars packed into lanes.
 * The header and the resource column stay in view, groups collapse, and only the rows and slots
 * in view render. Drag a bar along its row or onto another resource to move it, its ends to
 * resize it, or across empty time to create an event; changes go to the root's `onEventChange`.
 * From the keyboard the grid is one tab stop: arrow keys move along a row and between rows, and
 * Space picks up an event (Shift+Space to resize) or starts one on the focused cell.
 */
export function ResourceTimelineView<TEvent>({
  actions,
  environment,
  events,
  options,
  projection,
  range,
}: ResourceTimelineViewProps<TEvent>) {
  // Hour rows map a pointer along their date strips through the columns; day rows have plain day
  // cells, which steps drags by whole days. Drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    check: actions.checkEventChange,
    columns: projection.unit === "hour" ? projection.columns : undefined,
    events,
    onPropose: actions.proposeEventChange,
    snap,
    timeZone: environment.timeZone,
  });
  const keyboard = useViewKeyboard({ axis: "inline", snap });
  const labelEvent = useEventLabel(environment, options.describeEvent);

  // Where the calendar enters the view: today or the range's first day in the first row, at the
  // day's first wall time in an hour timeline. The calendar finds it in its default slots, so ask
  // with those, whatever this view steps by, or the cell rendered for it isn't the tab stop.
  const entry = useMemo(() => {
    const found = resourceTimelineSpatialNavigation({
      command: "home",
      environment,
      focus: null,
      options,
      projection,
      range,
      snap: entrySnap,
    });
    return found === null || !("focus" in found) || found.focus.kind === "event"
      ? null
      : found.focus;
  }, [environment, options, projection, range]);

  // A time grid's slot is its whole day in a timeline of days, so keys act on the day, as a drag
  // does. One day per slot, so a replayed effect asks for the same focus and changes nothing.
  const slot = useCalendarFocus((focus) => (focus?.kind === "slot" ? focus : null));
  const slotDay = useMemo<CalendarDayFocus | null>(
    () =>
      projection.unit === "day" && slot !== null
        ? { date: slot.date, kind: "day", resourceId: slot.resourceId }
        : null,
    [projection.unit, slot],
  );
  useLayoutEffect(() => {
    if (slotDay !== null) actions.setFocus(slotDay);
  }, [actions, slotDay]);

  return (
    <ResourceTimelineGrid
      entry={entry}
      environment={environment}
      getEventColor={options.getEventColor}
      keyboard={keyboard}
      label={gridLabel(range, environment.locale)}
      labelEvent={labelEvent}
      projection={projection}
      range={range}
      ref={pointerRef}
      renderUnavailable={options.renderUnavailable}
      snapMinutes={snap.increment}
    />
  );
}

function timelineView<const TName extends string, TEvent>(
  name: TName,
  span: ResourceTimelineSpan,
  defaultOptions: ResourceTimelineViewOptions<TEvent>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: resourceTimelineStrategy<ResourceTimelineViewOptions<TEvent>, TEvent>(span),
    Renderer: ResourceTimelineView<TEvent>,
  });
}

/** The anchor date in hours, named `timeline-day`. */
export function createTimelineDayView<TEvent = unknown>(
  defaultOptions: ResourceTimelineViewOptions<TEvent> = {},
) {
  return timelineView("timeline-day", { count: 1, kind: "days" }, defaultOptions);
}

/** A week of days, starting on the calendar's `weekRules.firstDay`, named `timeline-week`. */
export function createTimelineWeekView<TEvent = unknown>(
  defaultOptions: ResourceTimelineViewOptions<TEvent> = {},
) {
  return timelineView("timeline-week", { kind: "week" }, defaultOptions);
}

/** The anchor's calendar month, day by day, named `timeline-month`. */
export function createTimelineMonthView<TEvent = unknown>(
  defaultOptions: ResourceTimelineViewOptions<TEvent> = {},
) {
  return timelineView("timeline-month", { kind: "month" }, defaultOptions);
}
