import {
  eventIdAttributes,
  limitDayGridLanes,
  type DayGridRow,
  type EventId,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { EventChip } from "@registry/calendar/event-chip";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Button } from "@registry/ui/button";

export interface TimeGridAllDayProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly row: DayGridRow<TEvent, EventId, ResourceId>;
}

/** Lanes shown before the row collapses busy days into "+N more". */
const COLLAPSED_LANES = 3;

/** All-day and multi-day events above the grid, collapsing to three lanes until expanded. */
export function TimeGridAllDay<TEvent>({ days, getEventColor, row }: TimeGridAllDayProps<TEvent>) {
  const [expanded, setExpanded] = useState(false);
  const overflow = useMemo(() => limitDayGridLanes(row, COLLAPSED_LANES), [row]);
  const collapsible = overflow.hiddenCounts.some((count) => count > 0);
  const collapsed = collapsible && !expanded;
  const segments = collapsed ? overflow.segments : row.segments;
  const lanes = Math.max(1, collapsed ? COLLAPSED_LANES : row.laneCount);
  const columns = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div className="flex">
      <div className="flex w-(--calendar-gutter-width) shrink-0 items-start justify-end pt-0.5 pr-1">
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
      <div className="relative flex-1">
        <div className="absolute inset-0 grid" style={columns}>
          {days.map(({ column: { date } }) => (
            <div
              key={date.toString()}
              data-all-day=""
              data-date={date.toString()}
              className="border-l border-calendar-grid"
            />
          ))}
        </div>
        <div
          className="pointer-events-none relative grid gap-y-0.5 py-1"
          style={{ ...columns, gridTemplateRows: `repeat(${lanes}, 1.375rem)` }}
        >
          {segments.map(({ column, endsAfter, event, lane, span, startsBefore }) => (
            <EventChip
              key={`${String(event.id)}:${column}`}
              color={getEventColor?.(event.event)}
              {...eventIdAttributes(event.id)}
              data-pending={event.isPending === true ? "" : undefined}
              className={cn(
                "pointer-events-auto mx-1 min-w-0 py-0 leading-[1.375rem] data-pending:opacity-60",
                startsBefore && "ml-0 rounded-l-none",
                endsAfter && "mr-0 rounded-r-none",
              )}
              style={{ gridColumn: `${column + 1} / span ${span}`, gridRow: lane + 1 }}
            >
              <span className="truncate">{event.title}</span>
            </EventChip>
          ))}
          {collapsed &&
            overflow.hiddenCounts.map((count, column) =>
              count === 0 ? null : (
                <button
                  key={days[column]!.column.key}
                  className="pointer-events-auto mx-1 truncate rounded-md px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setExpanded(true)}
                  style={{ gridColumn: column + 1, gridRow: COLLAPSED_LANES }}
                  type="button"
                >
                  +{count} more
                </button>
              ),
            )}
        </div>
      </div>
    </div>
  );
}
