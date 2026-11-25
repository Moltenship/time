import {
  limitDayGridLanes,
  plainDateIntervalContains,
  type CalendarFocus,
  type DayGridOverflow,
  type DayGridRow,
  type DayGridSegment,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type TimeGridDay,
} from "@moltenship/calendar";

import { inResource } from "./time-grid-geometry";

/*
 * The all-day row's arithmetic, one place for every framework's markup: lanes, spans across
 * cells, and the collapse of busy days to three lanes with "+N more".
 */

type Row<TEvent> = DayGridRow<TEvent, EventId, ResourceId>;
type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;
type Overflow<TEvent> = DayGridOverflow<TEvent, EventId, ResourceId>;

/** Lanes shown before the row collapses busy days into "+N more". */
export const COLLAPSED_LANES = 3;
/** Lane height, the gap between lanes, and the row's vertical padding, in rem. */
const LANE = 1.375;
const LANE_GAP = 0.125;
const ROW_PADDING = 0.25;

/**
 * Places an item in a lane of the cell it renders in, its first day's unless it starts `offset`
 * cells earlier. A span reaches across the following cells: `100%` is one cell without its 1px
 * grid line.
 */
export function allDayLaneBox(
  lane: number,
  span = 1,
  offset = 0,
): {
  readonly height: string;
  readonly insetInlineEnd: string;
  readonly insetInlineStart: string | undefined;
  readonly top: string;
} {
  return {
    height: `${LANE}rem`,
    insetInlineEnd: `calc(${1 - span + offset} * (100% + 1px))`,
    insetInlineStart: offset === 0 ? undefined : `calc(${-offset} * (100% + 1px))`,
    top: `${ROW_PADDING + lane * (LANE + LANE_GAP)}rem`,
  };
}

/** The height of an all-day row of `lanes` lanes, as CSS. */
export function allDayRowHeight(lanes: number): string {
  return `${2 * ROW_PADDING + lanes * (LANE + LANE_GAP) - LANE_GAP}rem`;
}

export function covers(segment: Segment<unknown>, column: number): boolean {
  return segment.column <= column && column < segment.column + segment.span;
}

/** A row of all-day cells, with its resource in a view that has a row per resource. */
export interface AllDayRow<TEvent> {
  readonly resourceId?: ResourceId | null;
  readonly row: Row<TEvent>;
}

/** Each row's three-lane version. */
export function collapsedRows<TEvent>(
  rows: readonly AllDayRow<TEvent>[],
): readonly Overflow<TEvent>[] {
  return rows.map(({ row }) => limitDayGridLanes(row, COLLAPSED_LANES));
}

/** Whether any of the rows has a day with more than three lanes. */
export function isCollapsible(limited: readonly Overflow<unknown>[]): boolean {
  return limited.some(({ hiddenCounts }) => hiddenCounts.some((count) => count > 0));
}

/** Whether keyboard focus is on an event the collapsed rows hide, which expands them. */
export function focusHiddenByCollapse<TEvent>(
  focus: CalendarFocus | null,
  days: readonly TimeGridDay<TEvent>[],
  rows: readonly AllDayRow<TEvent>[],
  limited: readonly Overflow<TEvent>[],
): boolean {
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
}

/** The lanes the rows show: three while collapsed, else the busiest row's. */
export function shownLanes(rows: readonly AllDayRow<unknown>[], collapsed: boolean): number {
  return collapsed
    ? COLLAPSED_LANES
    : rows.reduce((most, { row }) => Math.max(most, row.laneCount), 1);
}

/** Which cells of a row are on screen, and the cell each segment renders in. */
export function allDayCellPlacement(
  days: readonly TimeGridDay<unknown>[],
  shown: PlainDateInterval | undefined,
) {
  const isShown = (column: number) =>
    shown === undefined || plainDateIntervalContains(shown, days[column]!.column.date);
  const firstShown = days.findIndex((_, column) => isShown(column));
  return {
    /**
     * The cell a segment renders in: its first day's, or the first visible day's for a bar that
     * starts in days scrolled away, so the bar stays one focus target in the visible cells that
     * assistive technology reads.
     */
    hostOf: (segment: Pick<Segment<unknown>, "column" | "span">) =>
      firstShown > segment.column && segment.column + segment.span > firstShown
        ? firstShown
        : segment.column,
    isShown,
  };
}
