import {
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarPointer,
  type CalendarViewRendererProps,
  type ResourceId,
} from "@moltenship/calendar";
import { useMemo } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { offsetLabel } from "@registry/time-grid-view/time-grid-header";

import { useAxisSync } from "./axis-sync";
import { useColumnVirtualizer } from "./column-virtualizer";
import { ResourceColumnsBody, type ResourceDays } from "./resource-columns-body";
import { ResourceColumnsHeader } from "./resource-columns-header";

export interface ResourceColumnsViewOptions<TEvent> {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Colour for an event; sets `data-color` on every element that renders it. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
}

export interface ResourceColumnsProjection<TEvent> {
  readonly resources: readonly ResourceDays<TEvent>[];
}

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;
/** The narrowest a resource's day gets before the columns scroll sideways, in pixels. */
const MIN_DAY_WIDTH = 128;

export type ResourceColumnsViewProps<TEvent> = CalendarViewRendererProps<
  ResourceColumnsProjection<TEvent>,
  ResourceColumnsViewOptions<TEvent>
>;

/**
 * A time grid with a column per resource, or a group of day columns per resource over several
 * days, under a sticky header grouped by the resource hierarchy. Only the columns in view render,
 * so hundreds of resources scroll smoothly.
 */
export function ResourceColumnsView<TEvent>({
  actions,
  environment,
  events,
  options,
  projection: { resources },
  range,
}: ResourceColumnsViewProps<TEvent>) {
  const days = resources[0]?.days ?? [];
  const keys = useMemo(
    () => resources.map(({ heading: { id } }) => `${typeof id}:${id}`),
    [resources],
  );
  const { scrollRef, scrollbarWidth, virtualizer } = useColumnVirtualizer({
    keys,
    minWidth: MIN_DAY_WIDTH * Math.max(1, days.length),
    rtl: environment.direction === "rtl",
  });
  const { followX, followY, sync } = useAxisSync(scrollRef);
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const headings = useMemo(() => resources.map(({ heading }) => heading), [resources]);

  const columns = useMemo(() => days.map(({ column }) => column), [days]);
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    columns,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: scrollRef,
    snap,
    timeZone: environment.timeZone,
  });
  const keyboard = useViewKeyboard({ snap });
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const toggle = (_id: ResourceId) => {};

  return (
    // Rows: resource headers and the timed columns; each starts with a gutter cell.
    <div
      ref={pointerRef}
      role="grid"
      aria-label={timeGridTitle(range, environment.locale)}
      aria-colcount={1 + resources.length * days.length}
      {...keyboard}
      data-slot="resource-columns"
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] [--calendar-gutter-width:3rem] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize sm:[--calendar-gutter-width:4rem]"
    >
      <div className="shrink-0 border-b border-calendar-grid">
        <ResourceColumnsHeader
          corner={
            days[0] === undefined
              ? null
              : offsetLabel(environment.locale, environment.timeZone, days[0])
          }
          days={days.length}
          followX={followX}
          headings={headings}
          items={items}
          onToggle={toggle}
          scrollbarWidth={scrollbarWidth}
          totalSize={totalSize}
        />
      </div>
      <ResourceColumnsBody
        environment={environment}
        followY={followY}
        getEventColor={options.getEventColor}
        items={items}
        labelEvent={labelEvent}
        onScroll={sync}
        resources={resources}
        scrollRef={scrollRef}
        slotMinutes={snap.increment}
        totalSize={totalSize}
      />
    </div>
  );
}
