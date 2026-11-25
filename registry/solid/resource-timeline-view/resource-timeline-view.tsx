import {
  defineCalendarView,
  resourceTimelineStrategy,
  useCalendarAnnouncer,
  useCalendarDraftReporter,
  useCalendarFocus,
  useCalendarPointer,
  type CalendarResource,
  type CalendarViewRendererProps,
  type ResourceId,
  type ResourceTimelineLayoutOptions,
  type ResourceTimelineOptions,
  type ResourceTimelineProjection,
  type ResourceTimelineSpan,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo } from "solid-js";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import {
  resourceStatusOptions,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  slotDayFocus,
  timelineEntry,
  timelineSnap,
} from "@registry/shared/resource-timeline-view/timeline-focus";
import { timelineGridLabel } from "@registry/shared/resource-timeline-view/timeline-labels";

import { ResourceTimelineGrid } from "./resource-timeline-grid";

/**
 * In an hour timeline, overlapping events in a row sit in lanes, or cascade in a stack where the
 * resource's `getResourceOverlapLayout`, or else `overlapLayout`, is `"stack"`; see
 * `ResourceTimelineLayoutOptions`.
 */
export interface ResourceTimelineViewOptions<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>
  extends ResourceTimelineOptions, ResourceTimelineLayoutOptions<TEvent, TResource> {
  /**
   * How a pointer drag's preview moves: from slot to slot (`"snapped"`, the default), or with the
   * pointer over a marker of where it would land (`"free"`), snapping there on release. Both
   * propose the same snapped placement.
   */
  readonly dragPreview?: "free" | "snapped";
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /**
   * A small icon before an event's title, such as a repeat mark on recurring events, or nothing.
   * It's decorative and hidden from assistive technology: say the same in `describeEvent`, which
   * adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /**
   * Replaces the shading of closed time and closed days: a function of its props and of the band,
   * date and resource, such as a gradient into working hours or a tint for rooms.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
  /**
   * Shows each resource's status in its row header: now, such as "Busy until 3:00 PM", and while
   * an event is being placed, whether it's busy or outside its hours then, so you see who's free.
   * Pass options for your own words or your own draft status in place of the badge.
   */
  readonly resourceStatus?: boolean | ResourceStatusOptions;
}

export type ResourceTimelineViewProps<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
> = CalendarViewRendererProps<
  ResourceTimelineProjection<TEvent>,
  ResourceTimelineViewOptions<TEvent, TResource>
>;

/**
 * Resources as rows and time as columns, with each resource's events as bars packed into lanes.
 * The header and the resource column stay in view, groups collapse, and only the rows and slots
 * in view render. Drag a bar along its row or onto another resource to move it, its ends to
 * resize it, or across empty time to create an event; changes go to the root's `onEventChange`.
 * From the keyboard the grid is one tab stop: arrow keys move along a row and between rows, and
 * Space picks up an event (Shift+Space to resize) or starts one on the focused cell.
 */
export function ResourceTimelineView<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>(props: ResourceTimelineViewProps<TEvent, TResource>) {
  // Hour rows map a pointer along their date strips through the columns; day rows have plain day
  // cells, which steps drags by whole days. Drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  // Drags report their draft, so headers show who's busy then.
  const reportDraft = useCalendarDraftReporter();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    columns: props.projection.unit === "hour" ? props.projection.columns : undefined,
    disabled: props.isReadOnly,
    events: props.events,
    onPreview: reportDraft,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    snap: timelineSnap,
    timeZone: props.environment.timeZone,
  }));
  const keyboard = useViewKeyboard({ axis: "inline", snap: timelineSnap });
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );

  const entry = createMemo(() =>
    timelineEntry({
      environment: props.environment,
      options: props.options,
      projection: props.projection,
      range: props.range,
    }),
  );

  // A time grid's slot is its whole day in a timeline of days, so keys act on the day, as a drag
  // does. One day per slot, so asking again asks for the same focus and changes nothing.
  const slot = useCalendarFocus((focus) => (focus?.kind === "slot" ? focus : null));
  const slotDay = createMemo(() => slotDayFocus(props.projection.unit, slot()));
  createEffect(slotDay, (focus) => {
    if (focus !== null) props.actions.setFocus(focus);
  });

  return (
    <ResourceTimelineGrid
      entry={entry()}
      environment={props.environment}
      getEventColor={props.options.getEventColor}
      getEventIcon={props.options.getEventIcon}
      isReadOnly={props.isReadOnly}
      label={timelineGridLabel(props.range, props.environment.locale)}
      labelEvent={labelEvent()}
      projection={props.projection}
      range={props.range}
      ref={(element) => {
        keyboard(element);
        pointer(element);
      }}
      renderUnavailable={props.options.renderUnavailable}
      resourceStatus={resourceStatusOptions(props.options.resourceStatus)}
      snapMinutes={timelineSnap.increment}
    />
  );
}

function timelineView<
  const TName extends string,
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId>,
>(
  name: TName,
  span: ResourceTimelineSpan,
  defaultOptions: ResourceTimelineViewOptions<TEvent, TResource>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: resourceTimelineStrategy<ResourceTimelineViewOptions<TEvent, TResource>, TEvent>(
      span,
    ),
    Renderer: ResourceTimelineView<TEvent, TResource>,
  });
}

/**
 * The anchor date in hours, named `timeline-day`. Pass the root's resource type as `TResource` to
 * read your own fields in `getResourceOverlapLayout`. The overlap layout options apply to hour
 * rows: here, or in the other timelines with `slotUnit: "hour"`.
 */
export function createTimelineDayView<
  TEvent = unknown,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>(defaultOptions: ResourceTimelineViewOptions<TEvent, TResource> = {}) {
  return timelineView("timeline-day", { count: 1, kind: "days" }, defaultOptions);
}

/**
 * A week of days, starting on the calendar's `weekRules.firstDay`, named `timeline-week`. Its day
 * rows lay events out like a month row; the overlap layout options apply with `slotUnit: "hour"`.
 * Pass the root's resource type as `TResource`, as for `createTimelineDayView`.
 */
export function createTimelineWeekView<
  TEvent = unknown,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>(defaultOptions: ResourceTimelineViewOptions<TEvent, TResource> = {}) {
  return timelineView("timeline-week", { kind: "week" }, defaultOptions);
}

/**
 * The anchor's calendar month, day by day, named `timeline-month`. As with the week, the overlap
 * layout options apply with `slotUnit: "hour"`, and `TResource` is the root's resource type.
 */
export function createTimelineMonthView<
  TEvent = unknown,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>(defaultOptions: ResourceTimelineViewOptions<TEvent, TResource> = {}) {
  return timelineView("timeline-month", { kind: "month" }, defaultOptions);
}
