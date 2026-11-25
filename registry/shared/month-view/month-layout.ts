import {
  plainDateIntervalContains,
  type CalendarFocus,
  type CalendarKeyboardSession,
  type ClosedDate,
  type ClosedTime,
  type DayGridOverflow,
  type DayGridSegment,
  type EventDayFragment,
  type EventId,
  type MonthProjection,
  type MonthWeek,
  type ResourceId,
} from "@moltenship/calendar";

/**
 * The month grid's layout, one place for every framework's markup: lane arithmetic, row sizes,
 * which events a day shows, and the closed days of a week.
 */

/**
 * Pixel height of a cell's date row and of one event lane; lanes are derived from these. A view
 * sets the lane's height as `--calendar-month-lane` on its root: 22 px, and 26 px where the pointer
 * is coarse, so on a touch screen events and "+N more" are 24 px tall, as WCAG 2.5.8 asks.
 */
export const DATE_ROW_HEIGHT = 28;
export const LANE_HEIGHT = 22;
/** Rows never shrink below this; shorter viewports scroll instead. */
export const MIN_ROW_HEIGHT = 80;
/** Lane count before the first measurement, e.g. while rendering on the server. */
export const INITIAL_LANES = 3;

type Segment<TEvent> = DayGridSegment<TEvent, EventId, ResourceId>;
type Week<TEvent> = MonthWeek<TEvent, EventId, ResourceId>;

/**
 * How many lanes fit in a week row `rowHeight` px tall, with lanes `laneHeight` px apart. Lanes
 * start 1 px below the date row and each event ends 1 px before its lane does, so the last lane's
 * spare pixel holds the row's bottom border.
 */
export function lanesIn(rowHeight: number, laneHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - DATE_ROW_HEIGHT) / laneHeight));
}

/** The lane height a probe measures; 0 where nothing lays out, as on the server. */
export function laneHeightOf(probe: HTMLElement | null | undefined): number {
  return probe?.offsetHeight || LANE_HEIGHT;
}

/** The height a week needs to show `laneCount` lanes, as a CSS length. */
export function weekHeight(laneCount: number): string {
  // One pixel for the row's bottom border.
  return `calc(${DATE_ROW_HEIGHT + 1}px + ${laneCount} * var(--calendar-month-lane, ${LANE_HEIGHT}px))`;
}

/** Where an item sits in its first day's cell, as CSS lengths; each framework spells the style. */
export interface LaneBox {
  readonly height: string;
  readonly insetInlineEnd: string;
  readonly top: string;
}

/**
 * Places an item in a lane of its first day's cell. A span reaches across the following cells:
 * `100%` is one cell without its 1px grid line.
 */
export function laneBox(lane: number, span = 1): LaneBox {
  const height = `var(--calendar-month-lane, ${LANE_HEIGHT}px)`;
  return {
    height: `calc(${height} - 2px)`,
    insetInlineEnd: `calc(${1 - span} * (100% + 1px))`,
    top: `calc(${DATE_ROW_HEIGHT + 1}px + ${lane} * ${height})`,
  };
}

/**
 * Rows share the height. An expanded week grows to fit every lane while the others keep their
 * share, so the grid scrolls rather than squeezing events out of their rows.
 */
export function rowSizes(
  weeks: readonly { readonly laneCount: number }[],
  expandedWeek: number,
): string {
  if (expandedWeek === -1) return `repeat(${weeks.length}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`;
  const share = `max(${MIN_ROW_HEIGHT}px, ${100 / weeks.length}%)`;
  return weeks
    .map(({ laneCount }, index) =>
      index === expandedWeek ? `max(${share}, ${weekHeight(laneCount)})` : share,
    )
    .join(" ");
}

/**
 * The week whose lane limit hides the event keyboard focus is on, or -1. That week shows all of
 * its lanes, so arrow keys reach every event without opening "+N more".
 */
export function weekHidingFocus<TEvent>(
  focus: CalendarFocus | null,
  weeks: MonthProjection<TEvent, EventId, ResourceId>["weeks"],
  overflows: readonly DayGridOverflow<TEvent, EventId, ResourceId>[],
): number {
  if (focus?.kind !== "event") return -1;
  const index = weeks.findIndex(({ range }) => plainDateIntervalContains(range, focus.date));
  if (index === -1) return -1;
  const column = weeks[index]!.range.start.until(focus.date).days;
  const shown = overflows[index]!.segments.some(
    (segment) =>
      segment.event.id === focus.eventId &&
      segment.column <= column &&
      column < segment.column + segment.span,
  );
  return shown ? -1 : index;
}

/** How many lanes fit in each of `weekCount` rows sharing a body `bodyHeight` px tall. */
export function lanesFor(bodyHeight: number, weekCount: number, laneHeight: number): number {
  return lanesIn(Math.max(MIN_ROW_HEIGHT, bodyHeight / weekCount), laneHeight);
}

/** What the lane count is measured from: the body's height and a probe's lane height. */
export interface LaneSizes {
  readonly bodyHeight: number;
  readonly laneHeight: number;
}

/** Measures `body` and the lane height a `probe` measures, now. */
export function measureLaneSizes(
  body: HTMLElement,
  probe: HTMLElement | null | undefined,
): LaneSizes {
  return { bodyHeight: body.clientHeight, laneHeight: laneHeightOf(probe) };
}

/**
 * Calls `onChange` with the sizes whenever the body or the lane height a `probe` measures changes,
 * from a ResizeObserver, which also reports them once as it starts. Returns the cleanup; where
 * there's no ResizeObserver, it observes nothing and returns `undefined`.
 */
export function observeLaneSizes(
  body: HTMLElement,
  probe: HTMLElement | null | undefined,
  onChange: (sizes: LaneSizes) => void,
): (() => void) | undefined {
  if (typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(() => onChange(measureLaneSizes(body, probe)));
  observer.observe(body);
  if (probe != null) observer.observe(probe);
  return () => observer.disconnect();
}

/**
 * Measures how many event lanes fit in a week row of `body` and calls `onChange` with the count,
 * now and whenever the body or the lane height a `probe` measures changes. Attach it again when
 * the number of weeks changes. Returns the cleanup.
 */
export function attachLaneCapacity(
  body: HTMLElement,
  options: {
    readonly onChange: (lanes: number) => void;
    readonly probe: HTMLElement | null | undefined;
    readonly weekCount: number;
  },
): () => void {
  const { onChange, probe, weekCount } = options;
  const measure = ({ bodyHeight, laneHeight }: LaneSizes) =>
    onChange(lanesFor(bodyHeight, weekCount, laneHeight));
  measure(measureLaneSizes(body, probe));
  return observeLaneSizes(body, probe, measure) ?? (() => {});
}

/** The segments that show something on a week's `column`, top to bottom. */
export function segmentsOn<TEvent>(
  segments: readonly Segment<TEvent>[],
  column: number,
): Segment<TEvent>[] {
  // Lanes are assigned in display order, so the day's events read top to bottom by lane.
  return segments
    .filter((segment) => segment.column <= column && column < segment.column + segment.span)
    .toSorted((left, right) => left.lane - right.lane);
}

/** The segments that start on a week's `column`, which its cell holds. */
export function segmentsStartingOn<TEvent>(
  segments: readonly Segment<TEvent>[],
  column: number,
): Segment<TEvent>[] {
  return segments.filter((segment) => segment.column === column);
}

/** A key for an event's element: `typeof` keeps numeric 1 and string "1" apart. */
export function eventKey(segment: { readonly event: { readonly id: EventId } }): string {
  return `${typeof segment.event.id}:${segment.event.id}`;
}

/** Whether a segment in the grid is a filled bar (all-day and multi-day events). */
export function isBarSegment(segment: Segment<unknown>): boolean {
  return (
    segment.event.kind === "all-day" ||
    segment.span > 1 ||
    segment.startsBefore ||
    segment.endsAfter
  );
}

/** Whether a day's piece of an event, as "+N more" lists it, is a filled bar. */
export function isBarFragment(fragment: EventDayFragment<unknown, EventId, ResourceId>): boolean {
  return fragment.event.kind === "all-day" || fragment.startsBeforeDay || fragment.endsAfterDay;
}

/** The piece of `segment` on a week's `column`. */
export function fragmentOn<TEvent>(
  segment: Segment<TEvent>,
  column: number,
): EventDayFragment<TEvent, EventId, ResourceId> {
  return segment.fragments[column - segment.column]!;
}

/** A closed day, with whether the days beside it in the week are open. */
export type ClosedDay = ClosedDate & ClosedTime;

/**
 * The closed days of a week by column, each opening on a side where the week has an open day
 * beside it; `undefined` for open days.
 */
export function closedDaysOf(
  week: Week<unknown>,
  closed: ReadonlyMap<string, ClosedDate>,
): (ClosedDay | undefined)[] {
  const isClosed = (column: number) => closed.has(week.days[column]?.date.toString() ?? "");
  return week.days.map((day, column) => {
    const date = closed.get(day.date.toString());
    return (
      date && {
        ...date,
        opensAfter: column < week.days.length - 1 && !isClosed(column + 1),
        opensBefore: column > 0 && !isClosed(column - 1),
      }
    );
  });
}

/** Whether a keyboard create's all-day range covers `date`. */
export function inAllDayDraft(
  session: CalendarKeyboardSession | null,
  date: Temporal.PlainDate,
): boolean {
  return (
    session?.eventId === null &&
    session.proposed.kind === "all-day" &&
    Temporal.PlainDate.compare(session.proposed.start, date) <= 0 &&
    Temporal.PlainDate.compare(date, session.proposed.end) < 0
  );
}
