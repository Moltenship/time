import {
  eventIdAttributes,
  limitDayGridLanes,
  type DayGridRow,
  type EventId,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { EventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Button } from "@registry/ui/button";

export interface TimeGridAllDayProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly row: DayGridRow<TEvent, EventId, ResourceId>;
}

/** Lanes shown before the row collapses busy days into "+N more". */
const COLLAPSED_LANES = 3;
/** Lane height, the gap between lanes, and the row's vertical padding, in rem. */
const LANE = 1.375;
const LANE_GAP = 0.125;
const ROW_PADDING = 0.25;

/**
 * Places an item in a lane of its first day's cell. A span reaches across the following cells:
 * `100%` is one cell without its 1px grid line.
 */
function laneStyle(lane: number, span = 1): CSSProperties {
  return {
    height: `${LANE}rem`,
    insetInlineEnd: `calc(${1 - span} * (100% + 1px))`,
    top: `${ROW_PADDING + lane * (LANE + LANE_GAP)}rem`,
  };
}

/**
 * The grid's all-day row: all-day and multi-day events above the timed columns, collapsing to
 * three lanes until expanded. A day's cell holds the segments that start on it; a span stretches
 * over the cells that follow.
 */
export function TimeGridAllDay<TEvent>({
  days,
  getEventColor,
  labelEvent,
  row,
}: TimeGridAllDayProps<TEvent>) {
  const [expanded, setExpanded] = useState(false);
  const overflow = useMemo(() => limitDayGridLanes(row, COLLAPSED_LANES), [row]);
  const collapsible = overflow.hiddenCounts.some((count) => count > 0);
  const collapsed = collapsible && !expanded;
  const segments = collapsed ? overflow.segments : row.segments;
  const lanes = Math.max(1, collapsed ? COLLAPSED_LANES : row.laneCount);

  return (
    <div
      role="row"
      className="flex"
      style={{ height: `${2 * ROW_PADDING + lanes * (LANE + LANE_GAP) - LANE_GAP}rem` }}
    >
      <div
        role="rowheader"
        className="flex w-(--calendar-gutter-width) shrink-0 items-start justify-end pt-0.5 pe-1"
      >
        <span className="sr-only">All day</span>
        {collapsible && (
          <Button
            aria-expanded={expanded}
            aria-label={expanded ? "Show fewer all-day events" : "Show all all-day events"}
            className="rounded-full"
            onClick={() => setExpanded(!expanded)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
          </Button>
        )}
      </div>
      <div
        className="grid flex-1"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map(({ column: { date, key } }, column) => (
          <div key={key} role="gridcell" className="relative min-w-0 border-s border-calendar-grid">
            {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
            <div data-all-day="" data-date={date.toString()} className="absolute inset-0" />
            {segments
              .filter((segment) => segment.column === column)
              .map(({ endsAfter, event, lane, span, startsBefore }) => (
                <EventChip
                  key={`${typeof event.id}:${event.id}`}
                  aria-label={labelEvent(event)}
                  color={getEventColor?.(event.event)}
                  {...eventIdAttributes(event.id)}
                  pending={event.isPending === true}
                  className={cn(
                    "absolute start-0 z-1 mx-1 min-w-0 py-0 leading-[1.375rem]",
                    startsBefore && "ms-0 rounded-s-none",
                    endsAfter && "me-0 rounded-e-none",
                  )}
                  style={laneStyle(lane, span)}
                >
                  <span className="truncate">{event.title}</span>
                </EventChip>
              ))}
            {collapsed && overflow.hiddenCounts[column]! > 0 && (
              <button
                className="absolute start-0 z-1 mx-1 truncate rounded-md px-2 text-start text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                onClick={() => setExpanded(true)}
                style={laneStyle(COLLAPSED_LANES - 1)}
                type="button"
              >
                +{overflow.hiddenCounts[column]} more
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
