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
  type OverlapLayoutOptions,
  type ResourceColumnsProjection,
  type ResourceId,
  type ResourceVisibilityOptions,
} from "@moltenship/calendar";
import { useMemo, type ComponentType } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import {
  resourceStatusOptions,
  type ResourceStatusOptions,
} from "@registry/calendar/resource-status";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { offsetLabel } from "@registry/time-grid-view/time-grid-header";

import { useAxisSync } from "./axis-sync";
import { useColumnVirtualizer } from "./column-virtualizer";
import { ResourceColumnsAllDay } from "./resource-columns-all-day";
import { ResourceColumnsBody } from "./resource-columns-body";
import { ResourceColumnsDates } from "./resource-columns-dates";
import { ResourceColumnsHeader } from "./resource-columns-header";
import type { ResourceHeaderProps } from "./resource-header";
import { useFocusedColumnInView } from "./focused-column";

/** Overlapping events in a resource's column follow `overlapLayout`, as in the week view. */
export interface ResourceColumnsViewOptions<
  TEvent,
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
>
  extends OverlapLayoutOptions, ResourceVisibilityOptions {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
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

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;
/** The narrowest a resource's day gets before the columns scroll sideways, in pixels. */
const MIN_DAY_WIDTH = 128;

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
  options,
  projection: { columns, resources },
  range,
}: ResourceColumnsViewProps<TEvent, TResource>) {
  const keys = useMemo(() => resources.map(({ resource }) => resource.key), [resources]);
  const rtl = environment.direction === "rtl";
  const focusedResource = useCalendarFocus(selectResource);
  const { scrollRef, scrollbarWidth, virtualizer } = useColumnVirtualizer({
    keys,
    minWidth: MIN_DAY_WIDTH * Math.max(1, columns.length),
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
    events,
    onPreview: reportDraft,
    onPropose: actions.proposeEventChange,
    scrollContainer: scrollRef,
    snap,
    timeZone: environment.timeZone,
  });
  const keyboard = useViewKeyboard({ snap });
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const placed = { items, resources, scrollbarWidth, totalSize };

  return (
    // Rows: resource headers, dates over several days, all-day events, and the timed columns; each
    // starts with a gutter cell.
    <div
      ref={pointerRef}
      role="grid"
      aria-label={timeGridTitle(range, environment.locale)}
      aria-colcount={1 + resources.length * columns.length}
      {...keyboard}
      data-slot="resource-columns"
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] [--calendar-gutter-width:3rem] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize sm:[--calendar-gutter-width:4rem]"
    >
      <div className="shrink-0 border-b border-calendar-grid">
        <ResourceColumnsHeader
          {...placed}
          corner={
            columns[0] === undefined
              ? null
              : offsetLabel(environment.locale, environment.timeZone, columns[0])
          }
          days={columns.length}
          environment={environment}
          followX={followX}
          // The projection's resources are untyped; `TResource` is the type the app gave the root.
          ResourceHeader={options.ResourceHeader as ComponentType<ResourceHeaderProps> | undefined}
          status={resourceStatusOptions(options.resourceStatus)}
        />
        {columns.length > 1 && resources[0] !== undefined && (
          <ResourceColumnsDates
            {...placed}
            days={resources[0].days}
            followX={followX}
            locale={environment.locale}
          />
        )}
        <ResourceColumnsAllDay
          {...placed}
          followX={followX}
          getEventColor={options.getEventColor}
          labelEvent={labelEvent}
          locale={environment.locale}
        />
      </div>
      <ResourceColumnsBody
        {...placed}
        environment={environment}
        followY={followY}
        getEventColor={options.getEventColor}
        labelEvent={labelEvent}
        onScroll={sync}
        renderUnavailable={options.renderUnavailable}
        scrollRef={scrollRef}
        slotMinutes={snap.increment}
      />
    </div>
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
