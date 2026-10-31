"use client";

import {
  defineCalendarView,
  limitDayGridLanes,
  plainDateIntervalContains,
  scrollingMonthAnchor,
  scrollingMonthOf,
  scrollingMonthStrategy,
  useAnchorDateRequests,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
  type CalendarViewRendererProps,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { useEventLabel } from "@registry/stylex-calendar/event-label";
import {
  epochDay,
  ScrollSnapPoints,
  useScrollingAxis,
} from "@registry/stylex-calendar/scrolling-axis";
import { useViewKeyboard } from "@registry/stylex-calendar/view-keyboard";
import {
  calendarConsts,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import {
  useMonthFormats,
  weekHidingFocus,
  type MonthViewOptions,
} from "@registry/stylex-month-view/month-view";
import {
  LaneProbe,
  laneHeightOf,
  lanesIn,
  MonthWeekRow,
  weekHeight,
} from "@registry/stylex-month-view/month-week";

const styles = stylex.create({
  editable: {
    WebkitTouchCallout: { default: null, "@media (pointer: coarse)": "none" },
    WebkitUserSelect: {
      default: null,
      "[data-interaction]": "none",
      "@media (pointer: coarse)": "none",
    },
    userSelect: {
      default: null,
      "[data-interaction]": "none",
      "@media (pointer: coarse)": "none",
    },
  },
  expanded: {
    backgroundColor: calendarConsts.surface,
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    position: "relative",
    zIndex: 10,
  },
  header: {
    borderBottomColor: calendarVars["--calendar-grid"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  },
  root: {
    "--calendar-ghost-background": calendarVars["--calendar-selection"],
    "--calendar-month-lane": { default: "22px", "@media (pointer: coarse)": "26px" },
    WebkitUserSelect: { default: null, "[data-interaction]": "none" },
    cursor: { default: null, '[data-interaction="move"]': "grabbing" },
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    userSelect: { default: null, "[data-interaction]": "none" },
  },
  track: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  viewport: {
    containerType: "size",
    flex: "1 1 0%",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehaviorY: "contain",
    position: "relative",
    scrollSnapType: { default: "y mandatory", ":is([data-interaction] *)": "none" },
  },
  week: {
    display: "grid",
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    paddingBlock: "0.5rem",
    textAlign: "center",
    textTransform: "uppercase",
  },
  weeks: {
    display: "grid",
    flexShrink: 0,
  },
});

export interface ScrollingMonthViewOptions<TEvent> extends MonthViewOptions<TEvent> {
  /** The registered view a date opens, `"day"` by default. */
  readonly dayView?: string;
}

type ScrollingMonthViewProps<TEvent> = CalendarViewRendererProps<
  MonthProjection<TEvent, EventId, ResourceId>,
  ScrollingMonthViewOptions<TEvent>
>;

/** Lane count before the first measurement, e.g. while rendering on the server. */
const INITIAL_LANES = 3;
/** One week's height: the viewport shared by the visible weeks. */
const WEEK = "var(--calendar-week-height)";
/** Months with snap points either way of the range, past any a swipe reaches before it renders. */
const SNAP_MONTHS = 6;

/** A week's number from the week of 1970-01-01; weeks that start on the same weekday count by one. */
function weekNumber(date: Temporal.PlainDate): number {
  return Math.floor(epochDay(date) / 7);
}

/**
 * Measures how many event lanes fit in a week row of `track`, which holds `count` of them, again
 * only when the rows or the lane height change: `probe` is a `LaneProbe`.
 */
function useLaneCapacity(
  track: RefObject<HTMLElement | null>,
  probe: RefObject<HTMLElement | null>,
  count: number,
): number {
  const [lanes, setLanes] = useState(INITIAL_LANES);

  useLayoutEffect(() => {
    const element = track.current;
    if (element === null) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height / count;
      if (height > 0) setLanes(lanesIn(height, laneHeightOf(probe.current)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (probe.current !== null) observer.observe(probe.current);
    return () => observer.disconnect();
  }, [count, probe, track]);

  return lanes;
}

/**
 * Weeks that swipe up and down without end, a month at a time: each month comes to rest with the
 * week of its first day on top, names the view, and keeps its days bright. Rows share the height
 * between the visible weeks and render for a page of weeks above and below, with their events,
 * and dragging and keys work as in the month view.
 */
function ScrollingMonthView<TEvent>({
  actions,
  environment,
  events,
  isReadOnly,
  loadRange,
  options,
  projection,
  range,
}: ScrollingMonthViewProps<TEvent>) {
  const { locale, timeZone } = environment;
  const weeks = range.start.until(range.end).days / 7;
  const first = weekNumber(range.start);
  const month = scrollingMonthOf(range);
  const strategy = useMemo(() => scrollingMonthStrategy(weeks), [weeks]);
  /** The week a month's page starts at: the one that holds its first day. */
  const monthStart = (date: Temporal.PlainDate) =>
    weekNumber(strategy.getRange(date, environment, undefined).start);
  const weekStart = (week: number) => range.start.add({ weeks: week - first });
  const axis = useScrollingAxis({
    axis: "block",
    first,
    onScroll: (week) => actions.setAnchorDate(scrollingMonthAnchor(weekStart(week))),
    page: weeks,
    rtl: false,
    // The nearest of the months around the week there: their first weeks are four or five apart.
    snapTo: (week) => {
      const near = scrollingMonthAnchor(weekStart(Math.round(week)));
      return [-1, 0, 1]
        .map((months) => monthStart(near.add({ months })))
        .reduce((best, start) => (Math.abs(start - week) < Math.abs(best - week) ? start : best));
    },
  });
  // Today and Next can ask for the anchor the view already has while a scroll runs ahead of it.
  useAnchorDateRequests((_, requested) => {
    if (requested !== null) axis.request(weekNumber(requested.start));
  });
  const start = weekNumber((loadRange ?? range).start) - axis.base;

  // Pointer drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    check: actions.checkEventChange,
    disabled: isReadOnly,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: axis.scrollRef,
    timeZone,
  });
  const keyboard = useViewKeyboard();
  const laneProbe = useRef<HTMLDivElement>(null);
  const maxLanes = useLaneCapacity(axis.trackRef, laneProbe, axis.count);
  const formats = useMonthFormats(locale);
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const overflows = useMemo(
    () => projection.weeks.map((week) => limitDayGridLanes(week, maxLanes)),
    [maxLanes, projection.weeks],
  );
  const expandedWeek = useCalendarFocus((focus) =>
    weekHidingFocus(focus, projection.weeks, overflows),
  );
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const dayView = options.dayView ?? "day";
  const openDay = (date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView(dayView);
  };

  return (
    <div
      ref={pointerRef}
      role="grid"
      aria-label={title}
      {...keyboard}
      data-slot="scrolling-month"
      {...stylex.props(
        styles.root,
        // A long-press on a touch screen picks events up: it selects no text and opens no callout.
        !isReadOnly && styles.editable,
      )}
    >
      <LaneProbe ref={laneProbe} />
      <div role="row" {...stylex.props(styles.header)}>
        {projection.weeks[0]?.days.map(({ date }) => (
          <div
            key={date.dayOfWeek}
            role="columnheader"
            aria-label={formats.weekdayName.format(date)}
            {...stylex.props(styles.weekday)}
          >
            {formats.weekday.format(date)}
          </div>
        ))}
      </div>
      <div
        ref={axis.scrollRef}
        data-slot="scrolling-month-viewport"
        {...stylex.props(styles.viewport)}
        style={
          {
            // Always a whole month on screen, so every date is on a page: short viewports show
            // fewer event lanes rather than fewer weeks.
            "--calendar-week-height": `calc(100cqh / ${weeks})`,
          } as CSSProperties
        }
      >
        {/* A flex column, so the rows' offset never collapses through it. */}
        <div
          ref={axis.trackRef}
          {...stylex.props(styles.track)}
          style={{ height: `calc(${axis.count} * ${WEEK})` }}
        >
          <ScrollSnapPoints
            axis="block"
            base={axis.base}
            points={Array.from({ length: 2 * SNAP_MONTHS + 1 }, (_, index) =>
              monthStart(month.add({ months: index - SNAP_MONTHS })),
            )}
            size={WEEK}
          />
          <div
            {...stylex.props(styles.weeks)}
            style={{
              gridTemplateRows: `repeat(${projection.weeks.length}, ${WEEK})`,
              marginBlockStart: `calc(${start} * ${WEEK})`,
            }}
          >
            {projection.weeks.map((week, index) => {
              const expanded = index === expandedWeek;
              const offscreen = !plainDateIntervalContains(range, week.range.start);
              return (
                <div
                  key={week.range.start.toString()}
                  // Weeks rendered above and below the visible ones are for scrolling into.
                  aria-hidden={offscreen ? true : undefined}
                  {...stylex.props(
                    styles.week,
                    // A week showing every lane grows over the next ones instead of moving them.
                    expanded && styles.expanded,
                  )}
                  style={
                    expanded
                      ? {
                          height: `max(100%, ${weekHeight(week.laneCount)})`,
                        }
                      : undefined
                  }
                >
                  <MonthWeekRow
                    expanded={expanded}
                    formats={formats}
                    getEventColor={options.getEventColor}
                    getEventIcon={options.getEventIcon}
                    labelEvent={labelEvent}
                    maxLanes={maxLanes}
                    offscreen={offscreen}
                    onOpenDay={openDay}
                    overflow={overflows[index]!}
                    renderUnavailable={options.renderUnavailable}
                    week={week}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A month of weeks that swipes up and down a month at a time, named `scrolling-month`. `weeks`
 * rows share the height: six by default, which every month fits, up to twelve. Previous and Next
 * move a month. Clicking a date opens `dayView`. Pass default options here; a root can override them through
 * `viewOptions["scrolling-month"]`.
 */
export function createScrollingMonthView<TEvent = unknown>(
  defaultOptions: ScrollingMonthViewOptions<TEvent> = {},
  weeks = 6,
) {
  return defineCalendarView({
    defaultOptions,
    name: "scrolling-month",
    strategy: scrollingMonthStrategy<ScrollingMonthViewOptions<TEvent>, TEvent>(weeks),
    Renderer: ScrollingMonthView<TEvent>,
  });
}
