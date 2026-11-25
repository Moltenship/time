"use client";

import {
  defineCalendarView,
  limitDayGridLanes,
  plainDateIntervalContains,
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
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { useEventLabel } from "@registry/calendar/event-label";
import { ScrollSnapPoints, useScrollingAxis } from "@registry/calendar/scrolling-axis";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import {
  useMonthFormats,
  weekHidingFocus,
  type MonthViewOptions,
} from "@registry/month-view/month-view";
import { LaneProbe, MonthWeekRow, weekHeight } from "@registry/month-view/month-week";
import {
  monthColumnHeaderClass,
  monthHeaderRowClass,
  monthViewClass,
} from "@registry/shared/month-view/month.styles";
import { INITIAL_LANES } from "@registry/shared/month-view/month-layout";
import {
  attachWeekLanes,
  scrollingMonthWeeks,
  weekNumber,
  WEEK,
} from "@registry/shared/scrolling-month-view/scrolling-month";
import {
  scrollingMonthTrackClass,
  scrollingMonthViewportClass,
  scrollingMonthWeekClass,
  scrollingMonthWeeksClass,
} from "@registry/shared/scrolling-month-view/scrolling-month.styles";

export interface ScrollingMonthViewOptions<TEvent> extends MonthViewOptions<TEvent> {
  /** The registered view a date opens, `"day"` by default. */
  readonly dayView?: string;
}

type ScrollingMonthViewProps<TEvent> = CalendarViewRendererProps<
  MonthProjection<TEvent, EventId, ResourceId>,
  ScrollingMonthViewOptions<TEvent>
>;

/**
 * How many event lanes fit in a week row of `track`, which holds `count` of them, measured again
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
    return attachWeekLanes(element, { count, onChange: setLanes, probe: probe.current });
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
  const month = scrollingMonthOf(range);
  const axisWeeks = scrollingMonthWeeks(range, weeks, environment);
  const axis = useScrollingAxis({
    axis: "block",
    first: axisWeeks.first,
    onScroll: (week) => actions.setAnchorDate(axisWeeks.anchorOf(week)),
    page: weeks,
    rtl: false,
    snapTo: axisWeeks.snapTo,
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
    preview: options.dragPreview,
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
      className={monthViewClass(isReadOnly)}
    >
      <LaneProbe ref={laneProbe} />
      <div role="row" className={monthHeaderRowClass}>
        {projection.weeks[0]?.days.map(({ date }) => (
          <div
            key={date.dayOfWeek}
            role="columnheader"
            aria-label={formats.weekdayName.format(date)}
            className={monthColumnHeaderClass}
          >
            {formats.weekday.format(date)}
          </div>
        ))}
      </div>
      <div
        ref={axis.scrollRef}
        data-slot="scrolling-month-viewport"
        className={scrollingMonthViewportClass}
        style={
          {
            // Always a whole month on screen, so every date is on a page: short viewports show
            // fewer event lanes rather than fewer weeks.
            "--calendar-week-height": `calc(100cqh / ${weeks})`,
          } as CSSProperties
        }
      >
        <div
          ref={axis.trackRef}
          className={scrollingMonthTrackClass}
          style={{ height: `calc(${axis.count} * ${WEEK})` }}
        >
          <ScrollSnapPoints
            axis="block"
            base={axis.base}
            points={axisWeeks.snapPoints()}
            size={WEEK}
          />
          <div
            className={scrollingMonthWeeksClass}
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
                  className={scrollingMonthWeekClass(expanded)}
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
