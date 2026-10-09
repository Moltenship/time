import {
  limitDayGridLanes,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type DayGridRow,
  type DayGridSegment,
  type EventId,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { EventChip, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { Button } from "@registry/ui/button";

export interface TimeGridAllDayProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  /** Full dates, for the cells' accessible names. */
  readonly formatDate: (date: Temporal.PlainDate) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a date in the day view; Shift+Enter on its cell does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly row: DayGridRow<TEvent, EventId, ResourceId>;
}

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;

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

function covers(segment: Segment<unknown>, column: number): boolean {
  return segment.column <= column && column < segment.column + segment.span;
}

function eventCount(count: number): string {
  return count === 0
    ? "no all-day events"
    : count === 1
      ? "1 all-day event"
      : `${count} all-day events`;
}

/** A date's all-day cell and keyboard focus target; it shows a keyboard all-day create's range. */
function AllDayCell({
  children,
  count,
  date,
  formatDate,
  onOpenDay,
}: {
  readonly children: ReactNode;
  readonly count: number;
  readonly date: Temporal.PlainDate;
  readonly formatDate: (date: Temporal.PlainDate) => string;
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
}) {
  const roving = useRovingFocus({ date, kind: "day" });
  const inDraft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      Temporal.PlainDate.compare(session.proposed.start, date) <= 0 &&
      Temporal.PlainDate.compare(date, session.proposed.end) < 0,
  );

  return (
    <div
      role="gridcell"
      aria-label={`${formatDate(date)}, ${eventCount(count)}`}
      {...roving}
      onKeyDown={(event) => {
        // Shift+Enter opens the day, as clicking its header date does.
        if (
          onOpenDay !== undefined &&
          event.key === "Enter" &&
          event.shiftKey &&
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          onOpenDay(date);
        }
      }}
      className="relative min-w-0 border-s border-calendar-grid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-all-day=""
        data-date={date.toString()}
        data-draft={inDraft ? "" : undefined}
        className="absolute inset-0 data-draft:bg-calendar-selection"
      />
      {children}
    </div>
  );
}

function AllDayEvent<TEvent>({
  date,
  getEventColor,
  labelEvent,
  segment: { endsAfter, event, lane, span, startsBefore },
}: {
  /** The segment's first date. */
  readonly date: Temporal.PlainDate;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly segment: Segment<TEvent>;
}) {
  const chip = useEventChip(event, { date, days: span, labelEvent });

  return (
    <EventChip
      color={getEventColor?.(event.event)}
      {...chip}
      className={cn(
        "absolute start-0 z-1 mx-1 min-w-0 py-0 leading-[1.375rem]",
        startsBefore && "ms-0 rounded-s-none",
        endsAfter && "me-0 rounded-e-none",
      )}
      style={laneStyle(lane, span)}
    >
      <span className="truncate">{event.title}</span>
    </EventChip>
  );
}

/**
 * The grid's all-day row: all-day and multi-day events above the timed columns, collapsing to
 * three lanes until expanded. A day's cell holds the segments that start on it; a span stretches
 * over the cells that follow. Keyboard focus on an event the collapsed row hides expands it.
 */
export function TimeGridAllDay<TEvent>({
  days,
  formatDate,
  getEventColor,
  labelEvent,
  onOpenDay,
  row,
}: TimeGridAllDayProps<TEvent>) {
  const [expanded, setExpanded] = useState(false);
  const overflow = useMemo(() => limitDayGridLanes(row, COLLAPSED_LANES), [row]);
  const collapsible = overflow.hiddenCounts.some((count) => count > 0);
  const focusHidden = useCalendarFocus((focus) => {
    if (focus?.kind !== "event") return false;
    const column = days.findIndex(({ column: { date } }) => date.equals(focus.date));
    const shows = (segment: Segment<TEvent>) =>
      segment.event.id === focus.eventId && covers(segment, column);
    return column !== -1 && row.segments.some(shows) && !overflow.segments.some(shows);
  });
  const collapsed = collapsible && !expanded && !focusHidden;
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
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show all all-day events" : "Show fewer all-day events"}
            className="rounded-full"
            onClick={() => setExpanded(collapsed)}
            size="icon-sm"
            // The grid keeps one tab stop; arrow keys reach hidden events and expand the row.
            tabIndex={-1}
            variant="ghost"
          >
            <ChevronDownIcon className={cn("transition-transform", !collapsed && "rotate-180")} />
          </Button>
        )}
      </div>
      <div
        className="grid flex-1"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map(({ column: { date, key } }, column) => (
          <AllDayCell
            key={key}
            count={row.segments.filter((segment) => covers(segment, column)).length}
            date={date}
            formatDate={formatDate}
            onOpenDay={onOpenDay}
          >
            {segments
              .filter((segment) => segment.column === column)
              .map((segment) => (
                <AllDayEvent
                  key={`${typeof segment.event.id}:${segment.event.id}`}
                  date={date}
                  getEventColor={getEventColor}
                  labelEvent={labelEvent}
                  segment={segment}
                />
              ))}
            {collapsed && overflow.hiddenCounts[column]! > 0 && (
              <button
                className="absolute start-0 z-1 mx-1 truncate rounded-md px-2 text-start text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                onClick={() => setExpanded(true)}
                style={laneStyle(COLLAPSED_LANES - 1)}
                tabIndex={-1}
                type="button"
              >
                +{overflow.hiddenCounts[column]} more
              </button>
            )}
          </AllDayCell>
        ))}
      </div>
    </div>
  );
}
