import {
  resourceIdAttributes,
  useResourceExpansion,
  type DayGridSegment,
  type EventId,
  type IsoDayOfWeek,
  type ResourceId,
} from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronRightIcon } from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Button } from "@registry/ui/button";

import { ResourceTimelineEvent } from "./resource-timeline-event";
import type { TimelineLabels } from "./timeline-labels";
import type { ResourceTimelineRow as Row } from "./timeline-rows";
import type { TimelineSlot } from "./timeline-scale";

export interface ResourceTimelineRowProps<TEvent> {
  /** A timed event's start time, shown on bars of a single day. */
  readonly formatTime: (instant: Temporal.Instant) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly labels: TimelineLabels;
  readonly row: Row<TEvent>;
  /** Width of each slot, in pixels. */
  readonly slotWidth: number;
  readonly slots: readonly TimelineSlot[];
  /** Where the row sits among all rows, and how tall it is. */
  readonly virtualRow: VirtualItem;
  /** The slots in view. */
  readonly visibleSlots: readonly VirtualItem[];
  readonly weekend: readonly IsoDayOfWeek[];
}

/** Space between a bar and the grid lines at the ends it doesn't continue past, in pixels. */
const BAR_INSET = 2;

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** A group's toggle; it re-renders only when that group expands or collapses. */
function ResourceToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);
  return (
    <Button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      onClick={toggle}
      size="icon-xs"
      variant="ghost"
    >
      <ChevronRightIcon
        className={cn("transition-transform", expanded ? "rotate-90" : "rtl:rotate-180")}
      />
    </Button>
  );
}

interface PlacedSegment<TEvent> {
  /** Where the bar starts relative to its cell, and its width, in pixels. */
  readonly offset: number;
  readonly segment: DayGridSegment<TEvent, EventId, ResourceId>;
  readonly width: number;
}

/**
 * The segments in view, each under the first visible day it covers: a bar that starts off-screen
 * still renders inside a cell of the grid, and reaches across the cells after it.
 */
function placeSegments<TEvent>(
  segments: readonly DayGridSegment<TEvent, EventId, ResourceId>[],
  visibleSlots: readonly VirtualItem[],
  slotWidth: number,
): ReadonlyMap<number, readonly PlacedSegment<TEvent>[]> {
  const placed = new Map<number, PlacedSegment<TEvent>[]>();
  const first = visibleSlots[0]?.index;
  const last = visibleSlots.at(-1)?.index;
  if (first === undefined || last === undefined) return placed;
  for (const segment of segments) {
    const { column, endsAfter, span, startsBefore } = segment;
    if (column + span <= first || column > last) continue;
    const anchor = Math.max(column, first);
    const start = startsBefore ? 0 : BAR_INSET;
    const end = endsAfter ? 0 : BAR_INSET;
    const cell = placed.get(anchor) ?? [];
    cell.push({
      offset: (column - anchor) * slotWidth + start,
      segment,
      width: span * slotWidth - start - end,
    });
    placed.set(anchor, cell);
  }
  return placed;
}

function ResourceTimelineRowBase<TEvent>({
  formatTime,
  getEventColor,
  labelEvent,
  labels,
  row: { resource, segments },
  slotWidth,
  slots,
  virtualRow,
  visibleSlots,
  weekend,
}: ResourceTimelineRowProps<TEvent>) {
  const title = resource.resource?.title ?? "Unassigned";
  const placed = useMemo(
    () => placeSegments(segments, visibleSlots, slotWidth),
    [segments, slotWidth, visibleSlots],
  );
  // An event with several resources shows in each row; its name says which one this is.
  const labelInRow = useCallback<EventLabeler<TEvent>>(
    (event) => labelEvent(event, title),
    [labelEvent, title],
  );

  return (
    <div
      role="row"
      aria-label={title}
      aria-rowindex={virtualRow.index + 2}
      {...resourceIdAttributes(resource.id)}
      className={cn(
        "absolute inset-x-0 flex border-b border-calendar-grid",
        resource.hasChildren && "bg-muted/50",
      )}
      style={{ height: virtualRow.size, top: virtualRow.start }}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        aria-label={title}
        className={cn(
          "sticky start-0 z-30 flex w-(--calendar-resource-column) shrink-0 items-center gap-1 border-e border-calendar-grid bg-background pe-2 text-sm",
          resource.hasChildren && "bg-muted font-medium",
        )}
        style={{ paddingInlineStart: `${0.25 + resource.depth}rem` }}
      >
        {resource.hasChildren && resource.id !== null ? (
          <ResourceToggle id={resource.id} title={title} />
        ) : (
          <span aria-hidden className="size-6 shrink-0" />
        )}
        <span className="truncate">{title}</span>
      </div>
      {visibleSlots.map((item) => {
        const slot = slots[item.index]!;
        const count = segments.filter(
          ({ column, span }) => column <= item.index && item.index < column + span,
        ).length;
        return (
          <div
            key={item.key}
            role="gridcell"
            aria-colindex={item.index + 2}
            aria-label={`${title}, ${labels.slotName(slot)}, ${eventCount(count)}`}
            data-weekend={weekend.includes(slot.date.dayOfWeek as IsoDayOfWeek) ? "" : undefined}
            className="absolute inset-y-0 border-s border-calendar-grid data-weekend:bg-calendar-weekend"
            style={{ insetInlineStart: item.start, width: item.size }}
          >
            {/* The day the pointer is over. Bars sit outside it, so grabbing a bar by a later
                day finds that day, not the one whose cell holds the bar. */}
            <div data-date={slot.date.toString()} className="absolute inset-0" />
            {placed.get(item.index)?.map(({ offset, segment, width }) => (
              <ResourceTimelineEvent
                key={`${typeof segment.event.id}:${segment.event.id}`}
                color={getEventColor?.(segment.event.event)}
                date={slots[segment.column]!.date}
                labelEvent={labelInRow}
                offset={offset}
                segment={segment}
                time={
                  segment.event.kind === "timed" && segment.span === 1 && !segment.startsBefore
                    ? formatTime(segment.event.start)
                    : undefined
                }
                width={width}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One resource: its name in the sticky resource column, indented by depth, with a toggle when it
 * has children, then a cell for each day in view holding the bars that start there. Group rows
 * are tinted.
 */
export const ResourceTimelineRow = memo(ResourceTimelineRowBase) as typeof ResourceTimelineRowBase;
