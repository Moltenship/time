"use client";

import {
  defineCalendarView,
  resourceColumnsStrategy,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarDraftReporter,
  useCalendarPointer,
  type CalendarFocus,
  type CalendarResource,
  type CalendarViewRendererProps,
  type ResourceColumnsProjection,
  type ResourceId,
  type ResourceOverlapLayoutOptions,
  type ResourceVisibilityOptions,
} from "@moltenship/calendar";
import { useMemo, type ComponentType, type ReactNode } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import {
  resourceStatusOptions,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  resourceColumnsSnap as snap,
  resourceMinWidth,
} from "@registry/shared/resource-columns-view/resource-columns-layout";
import { resourceColumnsHeadClass } from "@registry/shared/resource-columns-view/resource-columns.styles";
import { timeGridViewClass } from "@registry/shared/time-grid-view/time-grid.styles";
import { TimeGridEventTooltip } from "@registry/time-grid-view/time-grid-event";
import { offsetLabel } from "@registry/time-grid-view/time-grid-header";
import {
  gutterColumn,
  gutterStyle,
  TimeGridGutterLabels,
  useTimeGridZones,
} from "@registry/time-grid-view/time-grid-zones";

import { ResourceColumnsAllDay } from "./resource-columns-all-day";
import { ResourceColumnsBody } from "./resource-columns-body";
import { ResourceColumnsDates } from "./resource-columns-dates";
import { ResourceColumnsHeader } from "./resource-columns-header";
import type { ResourceHeaderProps } from "./resource-header";
import { useAxisSync } from "./use-axis-sync";
import { useColumnVirtualizer } from "./use-column-virtualizer";
import { useFocusedColumnInView } from "./use-focused-column";

/**
 * Overlapping events in a resource's column follow `getResourceOverlapLayout`, such as `"stack"`
 * for rooms, or else `overlapLayout`, as in the week view; `getEventOverlapLayout` refines it per
 * event, such as by calendar.
 */
export interface ResourceColumnsViewOptions<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>
  extends ResourceOverlapLayoutOptions<TEvent, TResource>, ResourceVisibilityOptions {
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
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /**
   * Your composition of the `resource-header.tsx` parts, in place of `DefaultResourceHeader`, such
   * as an avatar before each person's name and an icon before each room's.
   */
  readonly ResourceHeader?: ComponentType<ResourceHeaderProps<TResource>>;
  /**
   * Shows each resource's status and makes room for it in the header, in the default one or where
   * your own `ResourceHeader` puts `ResourceHeaderStatus`: now, such as "Busy until 3:00 PM", and
   * while an event is being placed, whether it's busy or outside its hours then, so you see who's
   * free. Pass options for your own words or your own draft status in place of the badge.
   */
  readonly resourceStatus?: boolean | ResourceStatusOptions;
  /**
   * Replaces the shading of closed time: an element, or a function of its props and of the band,
   * date and resource, such as a gradient into working hours or a tint for rooms; `resource` is the column's.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

const selectResource = (focus: CalendarFocus | null) => focus?.resourceId;

export type ResourceColumnsViewProps<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
> = CalendarViewRendererProps<
  ResourceColumnsProjection<TEvent>,
  ResourceColumnsViewOptions<TEvent, TResource>
>;

/**
 * A time grid with a column per resource, or a group of day columns per resource over several
 * days, under a header grouped by the resource hierarchy. Only the columns in view render, so
 * hundreds of resources scroll smoothly. Drag an event to another resource's column to move it
 * there, or within a column as in the day view; changes go to the root's `onEventChange`.
 */
export function ResourceColumnsView<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>({
  actions,
  environment,
  events,
  isReadOnly,
  options,
  projection: { columns, resources },
  range,
}: ResourceColumnsViewProps<TEvent, TResource>) {
  const keys = useMemo(() => resources.map(({ resource }) => resource.key), [resources]);
  const rtl = environment.direction === "rtl";
  const focusedResource = useCalendarFocus(selectResource);
  const { scrollRef, scrollbarWidth, virtualizer } = useColumnVirtualizer({
    keys,
    minWidth: resourceMinWidth(columns.length),
    pinned: resources.findIndex(({ resource }) => resource.id === focusedResource),
    rtl,
  });
  const { followX, followY, sync } = useAxisSync(scrollRef);
  useFocusedColumnInView({ resources, rtl, scrollRef, virtualizer });
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale. The resource comes from `data-resource-id`.
  const announcer = useCalendarAnnouncer();
  // Drags report their draft, so headers show who's busy then.
  const reportDraft = useCalendarDraftReporter();
  const pointerRef = useCalendarPointer({
    announcer,
    check: actions.checkEventChange,
    columns,
    disabled: isReadOnly,
    events,
    onPreview: reportDraft,
    onPropose: actions.proposeEventChange,
    preview: options.dragPreview,
    scrollContainer: scrollRef,
    snap,
    timeZone: environment.timeZone,
  });
  const keyboard = useViewKeyboard({ snap });
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const placed = { items, resources, scrollbarWidth, totalSize };
  const zones = useTimeGridZones(environment, columns);
  const corner = gutterColumn(columns, zones);

  return (
    <TimeGridEventTooltip>
      {/* Rows: resource headers, dates over several days, all-day events, and the timed columns;
          each starts with a gutter cell. */}
      <div
        ref={pointerRef}
        role="grid"
        aria-label={timeGridTitle(range, environment.locale)}
        aria-colcount={1 + resources.length * columns.length}
        {...keyboard}
        data-slot="resource-columns"
        className={timeGridViewClass(isReadOnly)}
        style={gutterStyle(zones)}
      >
        <div className={resourceColumnsHeadClass}>
          <ResourceColumnsHeader
            {...placed}
            corner={
              <TimeGridGutterLabels
                offset={
                  corner === undefined
                    ? undefined
                    : offsetLabel(environment.locale, environment.timeZone, corner)
                }
                zones={zones}
              />
            }
            days={columns.length}
            environment={environment}
            followX={followX}
            // The projection's resources are untyped; `TResource` is the type the app gave the root.
            ResourceHeader={
              options.ResourceHeader as ComponentType<ResourceHeaderProps> | undefined
            }
            status={resourceStatusOptions(options.resourceStatus)}
          />
          {columns.length > 1 && resources[0] !== undefined && (
            <ResourceColumnsDates
              {...placed}
              days={resources[0].days}
              followX={followX}
              locale={environment.locale}
              zones={zones}
            />
          )}
          <ResourceColumnsAllDay
            {...placed}
            followX={followX}
            getEventColor={options.getEventColor}
            getEventIcon={options.getEventIcon}
            labelEvent={labelEvent}
            locale={environment.locale}
          />
        </div>
        <ResourceColumnsBody
          {...placed}
          environment={environment}
          followY={followY}
          getEventColor={options.getEventColor}
          getEventIcon={options.getEventIcon}
          isReadOnly={isReadOnly}
          labelEvent={labelEvent}
          onScroll={sync}
          renderUnavailable={options.renderUnavailable}
          scrollRef={scrollRef}
          slotMinutes={snap.increment}
          zones={zones}
        />
      </div>
    </TimeGridEventTooltip>
  );
}

/**
 * Resource columns over one day, or `days` days side by side for each resource. Set
 * `unassigned: "bucket"` to show events without resources in an "Unassigned" column. Pass the
 * root's resource type as `TResource` to read your own fields in `ResourceHeader`.
 */
export function createResourceColumnsView<
  TEvent = unknown,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>(defaultOptions: ResourceColumnsViewOptions<TEvent, TResource> = {}, days = 1) {
  return defineCalendarView({
    defaultOptions,
    name: "resources",
    strategy: resourceColumnsStrategy<ResourceColumnsViewOptions<TEvent, TResource>, TEvent>({
      count: days,
      kind: "days",
    }),
    Renderer: ResourceColumnsView<TEvent, TResource>,
  });
}
