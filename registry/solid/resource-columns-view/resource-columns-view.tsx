import {
  defineCalendarView,
  resourceColumnsStrategy,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarDraftReporter,
  useCalendarFocus,
  useCalendarPointer,
  type CalendarFocus,
  type CalendarResource,
  type CalendarViewRendererProps,
  type ResourceColumnsProjection,
  type ResourceId,
  type ResourceOverlapLayoutOptions,
  type ResourceVisibilityOptions,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, Show, type Component } from "solid-js";

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
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /**
   * Your composition of the `resource-header.tsx` parts, in place of `DefaultResourceHeader`, such
   * as an avatar before each person's name and an icon before each room's.
   */
  readonly ResourceHeader?: Component<ResourceHeaderProps<TResource>>;
  /**
   * Shows each resource's status and makes room for it in the header, in the default one or where
   * your own `ResourceHeader` puts `ResourceHeaderStatus`: now, such as "Busy until 3:00 PM", and
   * while an event is being placed, whether it's busy or outside its hours then, so you see who's
   * free. Pass options for your own words or your own draft status in place of the badge.
   */
  readonly resourceStatus?: boolean | ResourceStatusOptions;
  /**
   * Replaces the shading of closed time: a function of its props and of the band, date and
   * resource, such as a gradient into working hours or a tint for rooms; `resource` is the
   * column's.
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
>(props: ResourceColumnsViewProps<TEvent, TResource>) {
  let body: HTMLDivElement | undefined;
  const columns = () => props.projection.columns;
  const resources = () => props.projection.resources;
  const rtl = () => props.environment.direction === "rtl";
  const keys = createMemo(() => resources().map(({ resource }) => resource.key));
  const focusedResource = useCalendarFocus(selectResource);
  const placed = useColumnVirtualizer(
    () => ({
      keys: keys(),
      minWidth: resourceMinWidth(columns().length),
      pinned: resources().findIndex(({ resource }) => resource.id === focusedResource()),
      rtl: rtl(),
    }),
    () => body,
  );
  const { followX, followY, sync } = useAxisSync(() => body);
  useFocusedColumnInView({
    body: () => body,
    resources,
    rtl,
    virtualizer: placed.virtualizer,
  });

  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale. The resource comes from `data-resource-id`.
  const announcer = useCalendarAnnouncer();
  // Drags report their draft, so headers show who's busy then.
  const reportDraft = useCalendarDraftReporter();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    columns: columns(),
    disabled: props.isReadOnly,
    events: props.events,
    onPreview: reportDraft,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    scrollContainer: {
      get current() {
        return body ?? null;
      },
    },
    snap,
    timeZone: props.environment.timeZone,
  }));
  const keyboard = useViewKeyboard({ snap });
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const zones = useTimeGridZones(() => props.environment, columns);
  const offset = createMemo(() => {
    const corner = gutterColumn(columns(), zones());
    return corner === undefined
      ? undefined
      : offsetLabel(props.environment.locale, props.environment.timeZone, corner);
  });
  const status = createMemo(() => resourceStatusOptions(props.options.resourceStatus));

  return (
    <TimeGridEventTooltip>
      {/* Rows: resource headers, dates over several days, all-day events, and the timed columns;
          each starts with a gutter cell. */}
      <div
        ref={[keyboard, pointer]}
        role="grid"
        aria-label={timeGridTitle(props.range, props.environment.locale)}
        aria-colcount={1 + resources().length * columns().length}
        data-slot="resource-columns"
        class={timeGridViewClass(props.isReadOnly)}
        style={gutterStyle(zones())}
      >
        <div class={resourceColumnsHeadClass}>
          <ResourceColumnsHeader
            corner={<TimeGridGutterLabels offset={offset()} zones={zones()} />}
            days={columns().length}
            environment={props.environment}
            followX={followX}
            items={placed.items()}
            // The projection's resources are untyped; `TResource` is the type the app gave the root.
            ResourceHeader={
              props.options.ResourceHeader as Component<ResourceHeaderProps> | undefined
            }
            resources={resources()}
            scrollbarWidth={placed.scrollbarWidth()}
            status={status()}
            totalSize={placed.totalSize()}
          />
          <Show when={columns().length > 1 ? resources()[0] : undefined}>
            {(first) => (
              <ResourceColumnsDates
                days={first().days}
                followX={followX}
                items={placed.items()}
                locale={props.environment.locale}
                scrollbarWidth={placed.scrollbarWidth()}
                totalSize={placed.totalSize()}
                zones={zones()}
              />
            )}
          </Show>
          <ResourceColumnsAllDay
            followX={followX}
            getEventColor={props.options.getEventColor}
            getEventIcon={props.options.getEventIcon}
            items={placed.items()}
            labelEvent={labelEvent()}
            locale={props.environment.locale}
            resources={resources()}
            scrollbarWidth={placed.scrollbarWidth()}
            totalSize={placed.totalSize()}
          />
        </div>
        <ResourceColumnsBody
          environment={props.environment}
          followY={followY}
          getEventColor={props.options.getEventColor}
          getEventIcon={props.options.getEventIcon}
          isReadOnly={props.isReadOnly}
          items={placed.items()}
          labelEvent={labelEvent()}
          onScroll={sync}
          ref={(element) => {
            body = element;
          }}
          renderUnavailable={props.options.renderUnavailable}
          resources={resources()}
          slotMinutes={snap.increment}
          totalSize={placed.totalSize()}
          zones={zones()}
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
