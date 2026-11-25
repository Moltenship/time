"use client";

import {
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
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import {
  draftCheckClassName,
  previewCheckAttributes,
  useDraftCheck,
} from "@registry/calendar/preview-check";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  allDayCellPlacement,
  allDayLaneBox,
  allDayRowHeight,
  COLLAPSED_LANES,
  collapsedRows,
  covers,
  focusHiddenByCollapse,
  isCollapsible,
  shownLanes,
  type AllDayRow,
} from "@registry/shared/time-grid-view/all-day-layout";
import { dayColumns, eventKey } from "@registry/shared/time-grid-view/time-grid-geometry";
import {
  allDayCellLabel,
  allDayLabel,
  allDayToggleLabel,
  moreAllDayText,
} from "@registry/shared/time-grid-view/time-grid-labels";
import {
  allDayCellClass,
  allDayDropClass,
  allDayEventClass,
  allDayEventTitleClass,
  allDayMoreClass,
  allDayRowClass,
  allDayRowHeaderClass,
  allDayToggleClass,
  allDayToggleIconClass,
  srOnlyClass,
  timeGridDaysClass,
} from "@registry/shared/time-grid-view/time-grid.styles";
import { Button } from "@registry/calendar-ui/button";

export type { AllDayRow } from "@registry/shared/time-grid-view/all-day-layout";

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

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;
type Overflow<TEvent> = DayGridOverflow<TEvent, EventId, ResourceId>;

/** A lane's box as React's style object. */
function laneStyle(lane: number, span = 1, offset = 0): CSSProperties {
  return allDayLaneBox(lane, span, offset);
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
      aria-label={allDayCellLabel(formatDate(date), count)}
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
      className={allDayCellClass}
    >
      {/* Events sit outside this element, so a drop target is never the cell a bar starts in. */}
      <div
        data-all-day=""
        data-date={date.toString()}
        data-draft={inDraft ? "" : undefined}
        {...previewCheckAttributes(inDraft ? draftCheck : undefined)}
        className={allDayDropClass(draftCheckClassName)}
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
      className={allDayEventClass(startsBefore, endsAfter)}
      style={laneStyle(lane, span, offset)}
    >
      <span data-slot="calendar-event-title" className={allDayEventTitleClass}>
        <EventIcon>{getEventIcon?.(event.event)}</EventIcon>
        {event.title}
      </span>
    </EventChip>
  );
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
  const limited = useMemo(() => collapsedRows(rows), [rows]);
  const collapsible = isCollapsible(limited);
  const focusHidden = useCalendarFocus((focus) =>
    focusHiddenByCollapse(focus, days, rows, limited),
  );
  const collapsed = collapsible && !expanded && !focusHidden;

  return {
    collapsed,
    collapsible,
    expand: () => setExpanded(true),
    height: allDayRowHeight(shownLanes(rows, collapsed)),
    overflows: collapsed ? limited : rows.map(() => null),
    toggle: () => setExpanded(collapsed),
  };
}

/** The all-day row's header, with the chevron that shows or hides busy days' extra lanes. */
export function AllDayRowHeader({ collapse }: { readonly collapse: AllDayCollapse<unknown> }) {
  const { collapsed, collapsible, toggle } = collapse;

  return (
    <div role="rowheader" className={allDayRowHeaderClass}>
      <span className={srOnlyClass}>{allDayLabel}</span>
      {collapsible && (
        <Button
          aria-expanded={!collapsed}
          aria-label={allDayToggleLabel(collapsed)}
          className={allDayToggleClass}
          onClick={toggle}
          size="icon-sm"
          // The grid keeps one tab stop; arrow keys reach hidden events and expand the row.
          tabIndex={-1}
          variant="ghost"
        >
          <ChevronDownIcon className={allDayToggleIconClass(collapsed)} />
        </Button>
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
  const { hostOf, isShown } = allDayCellPlacement(days, shown);

  return (
    <div className={timeGridDaysClass} style={{ gridTemplateColumns: dayColumns(days.length) }}>
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
                key={eventKey(segment.event.id)}
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
              className={allDayMoreClass}
              onClick={onExpand}
              style={laneStyle(COLLAPSED_LANES - 1)}
              tabIndex={-1}
              type="button"
            >
              {moreAllDayText(overflow.hiddenCounts[column]!)}
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
    <div role="row" className={allDayRowClass} style={{ height: collapse.height }}>
      <AllDayRowHeader collapse={collapse} />
      <TimeGridAllDayCells
        {...props}
        onExpand={collapse.expand}
        overflow={collapse.overflows[0]!}
      />
    </div>
  );
}
