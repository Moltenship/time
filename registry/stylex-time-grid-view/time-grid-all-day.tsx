"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  limitDayGridLanes,
  plainDateIntervalContains,
  showsInResource,
  useCalendarFocus,
  useCalendarInteraction,
  useRovingFocus,
  type DayGridOverflow,
  type DayGridRow,
  type DayGridSegment,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import { previewCheckAttributes, useDraftCheck } from "@registry/stylex-calendar/preview-check";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

import { inResource } from "./time-grid-column";

const styles = stylex.create({
  cell: {
    borderInlineStartColor: calendarVars["--calendar-grid"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    minWidth: 0,
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": -2 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    position: "relative",
  },
  cells: {
    display: "grid",
    flex: 1,
  },
  chevron: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    transitionDuration: "150ms",
    transitionProperty: "rotate",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    width: "1rem",
  },
  chevronUp: {
    rotate: "180deg",
  },
  dropTarget: {
    backgroundColor: {
      default: null,
      "[data-draft]": {
        default: calendarVars["--calendar-selection"],
        "[data-invalid]": `color-mix(in oklch, ${calendarVars["--calendar-invalid"]} 15%, transparent)`,
      },
    },
    inset: 0,
    outlineColor: {
      default: null,
      "[data-invalid]": calendarVars["--calendar-invalid"],
      "[data-warning]": calendarVars["--calendar-warning"],
    },
    outlineOffset: { default: null, "[data-invalid]": -2, "[data-warning]": -2 },
    outlineStyle: { default: null, "[data-invalid]": "dashed", "[data-warning]": "dashed" },
    outlineWidth: { default: null, "[data-invalid]": 2, "[data-warning]": 2 },
    position: "absolute",
  },
  event: {
    // A grabbed event keeps its shadow under a rejected or flagged preview's ring.
    boxShadow: {
      default: null,
      "[data-grabbed]": {
        default: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
        "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      },
      "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}`,
      "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}`,
    },
    insetInlineStart: 0,
    lineHeight: "1.375rem",
    marginInlineEnd: "0.25rem",
    marginInlineStart: "0.25rem",
    minWidth: 0,
    paddingBlock: 0,
    position: "absolute",
    zIndex: { default: 1, ":focus-visible": 10, "[data-grabbed]": 20 },
  },
  eventEndsAfter: {
    borderEndEndRadius: 0,
    borderStartEndRadius: 0,
    marginInlineEnd: 0,
  },
  eventStartsBefore: {
    borderEndStartRadius: 0,
    borderStartStartRadius: 0,
    marginInlineStart: 0,
  },
  more: {
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    color: {
      default: calendarVars["--muted-foreground"],
      ":hover": calendarVars["--accent-foreground"],
    },
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 500,
    insetInlineStart: 0,
    lineHeight: "1rem",
    marginInline: "0.25rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: "0.5rem",
    position: "absolute",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    zIndex: { default: 1, ":focus-visible": 10 },
  },
  round: {
    borderRadius: "9999px",
  },
  row: {
    display: "flex",
  },
  rowHeader: {
    alignItems: "flex-start",
    display: "flex",
    flexShrink: 0,
    justifyContent: "flex-end",
    paddingInlineEnd: "0.25rem",
    paddingTop: "0.125rem",
    width: "var(--calendar-gutter-width)",
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export interface TimeGridAllDayProps<TEvent> {
  readonly days: readonly TimeGridDay<TEvent>[];
  /** Full dates, for the cells' accessible names. */
  readonly formatDate: (date: Temporal.PlainDate) => string;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a date in the day view; Shift+Enter on its cell does so. */
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly row: DayGridRow<TEvent, EventId, ResourceId>;
}

type Row<TEvent> = DayGridRow<TEvent, EventId, ResourceId>;
type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;
type Overflow<TEvent> = DayGridOverflow<TEvent, EventId, ResourceId>;

/** Lanes shown before the row collapses busy days into "+N more". */
const COLLAPSED_LANES = 3;
/** Lane height, the gap between lanes, and the row's vertical padding, in rem. */
const LANE = 1.375;
const LANE_GAP = 0.125;
const ROW_PADDING = 0.25;

/**
 * Places an item in a lane of the cell it renders in, its first day's unless it starts `offset`
 * cells earlier. A span reaches across the following cells: `100%` is one cell without its 1px
 * grid line.
 */
function laneStyle(lane: number, span = 1, offset = 0): CSSProperties {
  return {
    height: `${LANE}rem`,
    insetInlineEnd: `calc(${1 - span + offset} * (100% + 1px))`,
    insetInlineStart: offset === 0 ? undefined : `calc(${-offset} * (100% + 1px))`,
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
  colIndex,
  count,
  date,
  formatDate,
  offscreen,
  onOpenDay,
  resourceId,
}: {
  readonly children: ReactNode;
  readonly colIndex?: number;
  readonly count: number;
  readonly date: Temporal.PlainDate;
  readonly formatDate: (date: Temporal.PlainDate) => string;
  /**
   * Rendered beside the visible dates of a scrolling grid: hidden from assistive technology and
   * not a focus target, so the visible dates keep the grid's tab stop.
   */
  readonly offscreen: boolean;
  readonly onOpenDay?: (date: Temporal.PlainDate) => void;
  readonly resourceId?: ResourceId | null;
}) {
  const roving = useRovingFocus({ date, kind: "day", resourceId });
  const inDraft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      (resourceId === undefined || showsInResource(session.proposed.resourceIds, resourceId)) &&
      Temporal.PlainDate.compare(session.proposed.start, date) <= 0 &&
      Temporal.PlainDate.compare(date, session.proposed.end) < 0,
  );
  const draftCheck = useDraftCheck();

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
      aria-hidden={offscreen ? true : undefined}
      aria-label={`${formatDate(date)}, ${eventCount(count)}`}
      // Out of the tab order, yet focusable, so focus on it survives a scroll that moves it away.
      {...(offscreen ? { tabIndex: -1 } : roving)}
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
      {...stylex.props(styles.cell)}
    >
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-all-day=""
        data-date={date.toString()}
        data-draft={inDraft ? "" : undefined}
        {...previewCheckAttributes(inDraft ? draftCheck : undefined)}
        {...stylex.props(styles.dropTarget)}
      />
      {children}
    </div>
  );
}

function AllDayEvent<TEvent>({
  date,
  getEventColor,
  getEventIcon,
  labelEvent,
  offset,
  offscreen,
  resourceId,
  segment: { endsAfter, event, lane, span, startsBefore },
}: {
  /**
   * The first date it is a focus target on: the date of the cell it renders in, so keys move on
   * from what is visible.
   */
  readonly date: Temporal.PlainDate;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Cells between the segment's first day and the cell it renders in. */
  readonly offset: number;
  /** All of it is beside the visible dates of a scrolling grid: not a focus target. */
  readonly offscreen: boolean;
  readonly resourceId?: ResourceId | null;
  readonly segment: Segment<TEvent>;
}) {
  const chip = useEventChip(event, {
    date,
    days: span - offset,
    labelEvent,
    offscreen,
    resourceId,
  });

  return (
    <EventChip
      color={getEventColor?.(event.event)}
      {...chip}
      style={laneStyle(lane, span, offset)}
      xstyle={[
        styles.event,
        startsBefore && styles.eventStartsBefore,
        endsAfter && styles.eventEndsAfter,
      ]}
    >
      <span data-slot="calendar-event-title" {...stylex.props(styles.title)}>
        <EventIcon>{getEventIcon?.(event.event)}</EventIcon>
        {event.title}
      </span>
    </EventChip>
  );
}

/** A row of all-day cells, with its resource in a view that has a row per resource. */
export interface AllDayRow<TEvent> {
  readonly resourceId?: ResourceId | null;
  readonly row: Row<TEvent>;
}

export interface AllDayCollapse<TEvent> {
  /** Whether busy days show three lanes and "+N more". */
  readonly collapsed: boolean;
  /** Whether any day has more than three lanes. */
  readonly collapsible: boolean;
  readonly expand: () => void;
  /** The rows' height, as CSS. */
  readonly height: string;
  /** Each row's three-lane version while collapsed, else `null`, in the order of the rows. */
  readonly overflows: readonly (Overflow<TEvent> | null)[];
  readonly toggle: () => void;
}

/**
 * All-day rows collapse together to three lanes until expanded, and take the height of the
 * busiest one. Keyboard focus on an event a collapsed row hides expands them.
 */
export function useAllDayCollapse<TEvent>(
  days: readonly TimeGridDay<TEvent>[],
  rows: readonly AllDayRow<TEvent>[],
): AllDayCollapse<TEvent> {
  const [expanded, setExpanded] = useState(false);
  const limited = useMemo(
    () => rows.map(({ row }) => limitDayGridLanes(row, COLLAPSED_LANES)),
    [rows],
  );
  const collapsible = limited.some(({ hiddenCounts }) => hiddenCounts.some((count) => count > 0));
  const focusHidden = useCalendarFocus((focus) => {
    if (focus?.kind !== "event") return false;
    const column = days.findIndex(({ column: { date } }) => date.equals(focus.date));
    const shows = (segment: Segment<TEvent>) =>
      segment.event.id === focus.eventId && covers(segment, column);
    return (
      column !== -1 &&
      rows.some(
        ({ resourceId, row }, index) =>
          inResource(focus, resourceId) &&
          row.segments.some(shows) &&
          !limited[index]!.segments.some(shows),
      )
    );
  });
  const collapsed = collapsible && !expanded && !focusHidden;
  const lanes = collapsed
    ? COLLAPSED_LANES
    : rows.reduce((most, { row }) => Math.max(most, row.laneCount), 1);

  return {
    collapsed,
    collapsible,
    expand: () => setExpanded(true),
    height: `${2 * ROW_PADDING + lanes * (LANE + LANE_GAP) - LANE_GAP}rem`,
    overflows: collapsed ? limited : rows.map(() => null),
    toggle: () => setExpanded(collapsed),
  };
}

/** The all-day row's header, with the chevron that shows or hides busy days' extra lanes. */
export function AllDayRowHeader({ collapse }: { readonly collapse: AllDayCollapse<unknown> }) {
  const { collapsed, collapsible, toggle } = collapse;

  return (
    <div role="rowheader" {...stylex.props(styles.rowHeader)}>
      <VisuallyHidden>All day</VisuallyHidden>
      {collapsible && (
        <IconButton
          aria-expanded={!collapsed}
          icon={
            <ChevronDownIcon {...stylex.props(styles.chevron, !collapsed && styles.chevronUp)} />
          }
          label={collapsed ? "Show all all-day events" : "Show fewer all-day events"}
          onClick={toggle}
          size="sm"
          // The grid keeps one tab stop; arrow keys reach hidden events and expand the row.
          tabIndex={-1}
          variant="ghost"
          xstyle={styles.round}
        />
      )}
    </div>
  );
}

export interface TimeGridAllDayCellsProps<TEvent> extends TimeGridAllDayProps<TEvent> {
  /** The first cell's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  /** Shows the rest of a collapsed row. */
  readonly onExpand: () => void;
  /** The row's three-lane version while collapsed, from `useAllDayCollapse`. */
  readonly overflow: Overflow<TEvent> | null;
  /** The row's resource, in a view with a row per resource. */
  readonly resourceId?: ResourceId | null;
  /**
   * The dates on screen, when the grid renders days around them while it scrolls; the others are
   * hidden from assistive technology. All of `days` by default.
   */
  readonly shown?: PlainDateInterval;
}

/**
 * One all-day row's cells: a day's cell holds the segments that start on it, and a span stretches
 * over the cells that follow.
 */
export function TimeGridAllDayCells<TEvent>({
  colIndex,
  days,
  formatDate,
  getEventColor,
  getEventIcon,
  labelEvent,
  onExpand,
  onOpenDay,
  overflow,
  resourceId,
  row,
  shown,
}: TimeGridAllDayCellsProps<TEvent>) {
  const segments = overflow?.segments ?? row.segments;
  const isShown = (column: number) =>
    shown === undefined || plainDateIntervalContains(shown, days[column]!.column.date);
  const firstShown = days.findIndex((_, column) => isShown(column));
  /**
   * The cell a segment renders in: its first day's, or the first visible day's for a bar that
   * starts in days scrolled away, so the bar stays one focus target in the visible cells that
   * assistive technology reads.
   */
  const hostOf = (segment: Segment<TEvent>) =>
    firstShown > segment.column && segment.column + segment.span > firstShown
      ? firstShown
      : segment.column;

  return (
    <div
      {...stylex.props(styles.cells)}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map(({ column: { date, key } }, column) => (
        <AllDayCell
          key={key}
          colIndex={colIndex === undefined ? undefined : colIndex + column}
          count={row.segments.filter((segment) => covers(segment, column)).length}
          date={date}
          formatDate={formatDate}
          offscreen={!isShown(column)}
          onOpenDay={onOpenDay}
          resourceId={resourceId}
        >
          {segments
            .filter((segment) => hostOf(segment) === column)
            .map((segment) => (
              <AllDayEvent
                key={`${typeof segment.event.id}:${segment.event.id}`}
                date={date}
                getEventColor={getEventColor}
                getEventIcon={getEventIcon}
                labelEvent={labelEvent}
                offset={column - segment.column}
                offscreen={!isShown(column)}
                resourceId={resourceId}
                segment={segment}
              />
            ))}
          {overflow !== null && overflow.hiddenCounts[column]! > 0 && (
            <button
              {...stylex.props(styles.more)}
              onClick={onExpand}
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
  );
}

/**
 * The grid's all-day row: all-day and multi-day events above the timed columns, collapsing to
 * three lanes until expanded.
 */
export function TimeGridAllDay<TEvent>(props: TimeGridAllDayProps<TEvent>) {
  const { days, row } = props;
  const rows = useMemo(() => [{ row }], [row]);
  const collapse = useAllDayCollapse(days, rows);

  return (
    <div role="row" {...stylex.props(styles.row)} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <TimeGridAllDayCells
        {...props}
        onExpand={collapse.expand}
        overflow={collapse.overflows[0]!}
      />
    </div>
  );
}
