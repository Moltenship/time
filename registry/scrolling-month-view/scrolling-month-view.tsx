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
import { useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";

import { useEventLabel } from "@registry/calendar/event-label";
import { epochDay, ScrollSnapPoints, useScrollingAxis } from "@registry/calendar/scrolling-axis";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import {
  useMonthFormats,
  weekHidingFocus,
  type MonthViewOptions,
} from "@registry/month-view/month-view";
import { DATE_ROW_HEIGHT, LANE_HEIGHT, MonthWeekRow } from "@registry/month-view/month-week";
import { cn } from "cn";

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
 * only when the rows resize.
 */
function useLaneCapacity(track: RefObject<HTMLElement | null>, count: number): number {
  const [lanes, setLanes] = useState(INITIAL_LANES);

  useLayoutEffect(() => {
    const element = track.current;
    if (element === null) return;
    const measure = () => {
      const height = element.getBoundingClientRect().height / count;
      // One pixel for the row's bottom border.
      if (height > 0)
        setLanes(Math.max(1, Math.floor((height - 1 - DATE_ROW_HEIGHT) / LANE_HEIGHT)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, track]);

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
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: axis.scrollRef,
    timeZone,
  });
  const keyboard = useViewKeyboard();
  const maxLanes = useLaneCapacity(axis.trackRef, axis.count);
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
      className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing"
    >
      <div role="row" className="grid shrink-0 grid-cols-7 border-b border-calendar-grid">
        {projection.weeks[0]?.days.map(({ date }) => (
          <div
            key={date.dayOfWeek}
            role="columnheader"
            aria-label={formats.weekdayName.format(date)}
            className="py-2 text-center text-[0.6875rem] font-medium text-muted-foreground uppercase"
          >
            {formats.weekday.format(date)}
          </div>
        ))}
      </div>
      <div
        ref={axis.scrollRef}
        data-slot="scrolling-month-viewport"
        className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain [container-type:size] in-data-interaction:snap-none"
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
          className="relative flex flex-col"
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
            className="grid shrink-0"
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
                  className={cn(
                    "grid",
                    // A week showing every lane grows over the next ones instead of moving them.
                    expanded && "relative z-10 bg-calendar-surface shadow-md",
                  )}
                  style={
                    expanded
                      ? {
                          height: `max(100%, ${DATE_ROW_HEIGHT + week.laneCount * LANE_HEIGHT + 1}px)`,
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
