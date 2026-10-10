import {
  defineCalendarView,
  getMonthTitle,
  navigateMonth,
  navigateTimeGrid,
  plainDateInterval,
  timeGridPosition,
  timeGridRange,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarPointer,
  useNow,
  type CalendarEnvironmentBase,
  type CalendarViewRendererProps,
  type CalendarViewStrategy,
  type PlainDateInterval,
  type ResourceVisibilityOptions,
} from "@moltenship/calendar";
import { useMemo } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { ResourceTimelineGrid } from "./resource-timeline-grid";
import { projectResourceTimeline, type ResourceTimelineProjection } from "./timeline-rows";

export interface ResourceTimelineViewOptions<TEvent> extends ResourceVisibilityOptions {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
}

export type ResourceTimelineViewProps<TEvent> = CalendarViewRendererProps<
  ResourceTimelineProjection<TEvent>,
  ResourceTimelineViewOptions<TEvent>
>;

/**
 * Resources as rows and days as columns, with each resource's events as bars packed into lanes.
 * The header and the resource column stay in view, groups collapse, and only the rows and days
 * in view render. Drag a bar along its row or onto another resource to move it, drag its ends to
 * resize it by days, or drag across empty days to create an all-day event; changes go to the
 * root's `onEventChange`.
 */
export function ResourceTimelineView<TEvent>({
  actions,
  environment,
  events,
  options,
  projection: { columns, rows },
  range,
}: ResourceTimelineViewProps<TEvent>) {
  // Days are `data-date` cells inside each resource's row, so drags step whole days and can
  // change rows; the announcer speaks them and labels the drag preview in the calendar's locale.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    events,
    onPropose: actions.proposeEventChange,
    timeZone: environment.timeZone,
  });
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const now = useNow();
  const today = now?.toZonedDateTimeISO(environment.timeZone).toPlainDate() ?? null;
  const nowAt = useMemo(() => {
    const position = now === null ? null : timeGridPosition(columns, now);
    return position === null ? null : (position.column + position.top) / columns.length;
  }, [columns, now]);

  return (
    <ResourceTimelineGrid
      environment={environment}
      getEventColor={options.getEventColor}
      label={timelineTitle(range, environment)}
      labelEvent={labelEvent}
      now={nowAt}
      range={range}
      ref={pointerRef}
      rows={rows}
      today={today}
    />
  );
}

type TimelineSpan = "month" | "week";

/** "October 2026" for a calendar month, "Oct 5 – 11, 2026" for a week. */
function timelineTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase): string {
  return range.start.day === 1 && range.end.equals(range.start.add({ months: 1 }))
    ? getMonthTitle(range, environment)
    : timeGridTitle(range, environment.locale);
}

// Until #39 adds `resourceTimelineStrategy`, the ranges, titles and navigation come from the
// week and month views'.
function timelineStrategy<TEvent>(span: TimelineSpan) {
  const strategy: CalendarViewStrategy<
    ResourceTimelineProjection<TEvent>,
    ResourceTimelineViewOptions<TEvent>,
    TEvent
  > = {
    getRange: (anchor, environment) => {
      if (span === "week") return timeGridRange(anchor, { kind: "week" }, environment.weekRules);
      const first = anchor.with({ day: 1 });
      return plainDateInterval(first, first.add({ months: 1 }));
    },
    getTitle: timelineTitle,
    navigate: (anchor, delta) =>
      span === "week"
        ? navigateTimeGrid(anchor, delta, { kind: "week" })
        : navigateMonth(anchor, delta),
    project: projectResourceTimeline,
  };
  return Object.freeze(strategy);
}

function timelineView<const TName extends string, TEvent>(
  name: TName,
  span: TimelineSpan,
  defaultOptions: ResourceTimelineViewOptions<TEvent>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: timelineStrategy<TEvent>(span),
    Renderer: ResourceTimelineView<TEvent>,
  });
}

/** A week of days, starting on the calendar's `weekRules.firstDay`, named `timeline-week`. */
export function createTimelineWeekView<TEvent = unknown>(
  defaultOptions: ResourceTimelineViewOptions<TEvent> = {},
) {
  return timelineView("timeline-week", "week", defaultOptions);
}

/** The anchor's calendar month, day by day, named `timeline-month`. */
export function createTimelineMonthView<TEvent = unknown>(
  defaultOptions: ResourceTimelineViewOptions<TEvent> = {},
) {
  return timelineView("timeline-month", "month", defaultOptions);
}
