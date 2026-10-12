import {
  defineCalendarView,
  eventDateRanges,
  plainDateIntervalContains,
  sameFocus,
  useAnchorDateRequests,
  scrollingTimeGridStrategy,
  timeGridPosition,
  timeGridTitle,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
  useNow,
  type CalendarFocus,
  type CalendarViewRendererProps,
  type PlainDateInterval,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar";
import {
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { useEventLabel } from "@registry/calendar/event-label";
import {
  epochDay,
  fromEpochDay,
  ScrollSnapPoints,
  useScrollingAxis,
} from "@registry/calendar/scrolling-axis";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import { annotationFormats } from "@registry/time-grid-view/annotation-label";
import {
  AllDayRowHeader,
  TimeGridAllDayCells,
  useAllDayCollapse,
} from "@registry/time-grid-view/time-grid-all-day";
import {
  DEFAULT_COLUMN_HEIGHT,
  TimeGridAnnotationOverlays,
  useAnnotationHandles,
  useTimeGridAnnotationLayout,
} from "@registry/time-grid-view/time-grid-annotations";
import { TimeGridHours, useHeightObserver } from "@registry/time-grid-view/time-grid-body";
import {
  TimeGridColumn,
  useTimeGridColumnFormats,
} from "@registry/time-grid-view/time-grid-column";
import { offsetLabel, TimeGridDayHeaders } from "@registry/time-grid-view/time-grid-header";
import type { TimeGridViewOptions } from "@registry/time-grid-view/time-grid-view";

import { useOpeningTime, useStickyHeaderPadding } from "./scrolling-time-grid-scroll";

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;
/** One day's width: the viewport past the hour gutter, shared by the visible days. */
const DAY = "var(--calendar-day-width)";
/** Pages with snap points either way of the range, past any a swipe reaches before it renders. */
const SNAP_PAGES = 6;

export type ScrollingTimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/**
 * Focus on an all-day bar from a day outside the visible ones, moved to the visible day nearest
 * it that the bar covers; `null` when there's nothing to move. The bar renders from the visible
 * days once its focused day scrolls away, either way, so focus on it has to follow.
 */
function barFocusInView(
  focus: CalendarFocus | null,
  row: TimeGridProjection<unknown>["allDay"],
  visible: PlainDateInterval,
  timeZone: string,
): CalendarFocus | null {
  if (focus?.kind !== "event" || plainDateIntervalContains(visible, focus.date)) return null;
  const before = Temporal.PlainDate.compare(focus.date, visible.start) < 0;
  const lastVisible = visible.end.subtract({ days: 1 });
  for (const { column, event, span } of row.segments) {
    if (event.id !== focus.eventId) continue;
    const first = row.range.start.add({ days: column });
    const last = first.add({ days: span - 1 });
    const target = before
      ? Temporal.PlainDate.compare(first, visible.start) > 0
        ? first
        : visible.start
      : Temporal.PlainDate.compare(last, lastVisible) < 0
        ? last
        : lastVisible;
    if (!plainDateIntervalContains(visible, target)) continue;
    // Segments are clipped to the loaded days, so the event's own dates decide what it covered:
    // one run of local dates through both days, which a fold at midnight can start a day early.
    const [from, to] = before ? [focus.date, target] : [target, focus.date];
    const continuous = eventDateRanges(event, timeZone).some(
      ({ first: runFirst, last: runLast }) =>
        Temporal.PlainDate.compare(runFirst, from) <= 0 &&
        Temporal.PlainDate.compare(to, runLast) <= 0,
    );
    if (continuous) return { ...focus, date: target };
  }
  return null;
}

/** A row's days across the canvas: the hour gutter, held at the start, then `children` at `start`. */
function Track({
  children,
  count,
  gutter,
  overlay,
  ref,
  start,
  strip,
  style,
}: {
  readonly children: ReactNode;
  /** Days the canvas holds. */
  readonly count: number;
  readonly gutter: ReactNode;
  /** Positioned over the whole track, such as its snap points. */
  readonly overlay?: ReactNode;
  /** The element `count` days wide. */
  readonly ref?: Ref<HTMLDivElement>;
  /** Days from the canvas's start to the first rendered one; negative before it is extended. */
  readonly start: number;
  /** Days rendered. */
  readonly strip: number;
  readonly style?: CSSProperties;
}) {
  return (
    <>
      {gutter}
      <div
        ref={ref}
        className="relative flex-none"
        style={{ ...style, width: `calc(${count} * ${DAY})` }}
      >
        {overlay}
        <div
          className="flex h-full"
          style={{ marginInlineStart: `calc(${start} * ${DAY})`, width: `calc(${strip} * ${DAY})` }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Day columns that scroll sideways without end, a page at a time, as in Apple's Calendar on
 * iPad: a week swipes to the next week, three days to the next three, and a day to the next day,
 * and the calendar's range follows. The header, all-day row, and hour gutter stay in place while the
 * days scroll under them. A page of days on each side is rendered with its events, and keys,
 * dragging, and creating work as in `TimeGridView`.
 */
export function ScrollingTimeGridView<TEvent>({
  actions,
  environment,
  events,
  loadRange,
  options,
  projection,
  range,
}: ScrollingTimeGridViewProps<TEvent>) {
  const { days } = projection;
  const { direction, locale, timeZone } = environment;
  const visibleDays = range.start.until(range.end).days;
  const columns = useMemo(() => days.map(({ column }) => column), [days]);
  const first = epochDay(range.start);
  const axis = useScrollingAxis({
    axis: "inline",
    first,
    onScroll: (day) => actions.setAnchorDate(fromEpochDay(day)),
    page: visibleDays,
    rtl: direction === "rtl",
    // Whole pages from the range, so a week stays a calendar week and three days move three.
    snapTo: (day) => first + Math.round((day - first) / visibleDays) * visibleDays,
  });
  // Today and Next can ask for the range the view already has while a scroll runs ahead of it.
  useAnchorDateRequests((_, requested) => {
    if (requested !== null) axis.request(epochDay(requested.start));
  });
  const start = epochDay((loadRange ?? range).start) - axis.base;

  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    check: actions.checkEventChange,
    columns,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: axis.scrollRef,
    snap,
    timeZone,
  });
  const keyboard = useViewKeyboard({ snap });

  // Merging and lane packing use drawn sizes, so they follow the body's measured height.
  const [columnHeight, setColumnHeight] = useState(DEFAULT_COLUMN_HEIGHT);
  const bodyRef = useHeightObserver(setColumnHeight);
  const annotationLayout = useTimeGridAnnotationLayout(columns, options.annotations, {
    columnHeight,
    dense: visibleDays > 1,
  });
  const annotationHandles = useAnnotationHandles();
  const formats = useMemo(() => annotationFormats(locale, timeZone), [locale, timeZone]);
  const annotations = useMemo(
    () =>
      annotationLayout.enabled
        ? { formats, handles: annotationHandles, layout: annotationLayout }
        : undefined,
    [annotationHandles, annotationLayout, formats],
  );

  const labelEvent = useEventLabel(environment, options.describeEvent);
  const columnFormats = useTimeGridColumnFormats(locale);
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
    return (date: Temporal.PlainDate) => format.format(date);
  }, [locale]);
  const { dayView } = options;
  const openDay =
    dayView === undefined || visibleDays === 1
      ? undefined
      : (date: Temporal.PlainDate) => {
          actions.setAnchorDate(date);
          actions.setView(dayView);
        };

  const allDayRows = useMemo(() => [{ row: projection.allDay }], [projection.allDay]);
  const collapse = useAllDayCollapse(days, allDayRows);
  // A bar keeps focus as its focused day scrolls away, on the visible day nearest it.
  const focusOnBar = useCalendarFocus(
    (focus) => barFocusInView(focus, projection.allDay, range, timeZone),
    { isEqual: sameFocus },
  );
  useLayoutEffect(() => {
    if (focusOnBar !== null) actions.setFocus(focusOnBar);
  }, [actions, focusOnBar]);
  const now = useNow();
  const nowPosition = useMemo(
    () => (now === null ? null : timeGridPosition(columns, now)),
    [columns, now],
  );
  const headerRef = useStickyHeaderPadding(axis.scrollRef);
  useOpeningTime({
    bodyRef,
    headerRef,
    now,
    nowTop: nowPosition?.top ?? null,
    scrollRef: axis.scrollRef,
  });

  const placed = { count: axis.count, start, strip: days.length };
  const firstShown = days.find(({ column }) => column.date.equals(range.start)) ?? days[0];
  const gutter = "sticky start-0 shrink-0 w-(--calendar-gutter-width) bg-calendar-surface";

  return (
    <>
      {/* Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell. */}
      <div
        ref={pointerRef}
        role="grid"
        aria-label={timeGridTitle(range, locale)}
        {...keyboard}
        data-slot="scrolling-time-grid"
        dir={direction}
        className="flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] [--calendar-gutter-width:3rem] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize sm:[--calendar-gutter-width:4rem]"
      >
        <div
          ref={axis.scrollRef}
          data-slot="scrolling-time-grid-viewport"
          className="relative min-h-0 flex-1 snap-x snap-mandatory scroll-ps-(--calendar-gutter-width) scroll-pt-(--calendar-header-height) overflow-auto overscroll-x-contain [container-type:inline-size] [scrollbar-gutter:stable] in-data-interaction:snap-none"
          style={
            {
              "--calendar-day-width": `calc((100cqw - var(--calendar-gutter-width)) / ${visibleDays})`,
            } as CSSProperties
          }
        >
          <div
            className="relative min-h-full"
            style={{ width: `calc(var(--calendar-gutter-width) + ${axis.count} * ${DAY})` }}
          >
            <div
              ref={headerRef}
              data-slot="scrolling-time-grid-header"
              className="sticky top-0 z-30 border-b border-calendar-grid bg-calendar-surface"
            >
              {/* Days scroll beneath it, so the pointer layer doesn't look through it to them. */}
              <div role="row" data-occludes="" className="flex">
                <Track
                  {...placed}
                  gutter={
                    <div
                      role="columnheader"
                      className={`${gutter} z-10 flex items-end justify-end pe-2 pb-1 text-[0.625rem] text-calendar-axis`}
                    >
                      {firstShown === undefined
                        ? null
                        : offsetLabel(locale, timeZone, firstShown.column)}
                    </div>
                  }
                >
                  <TimeGridDayHeaders
                    actions={actions}
                    annotations={annotations}
                    days={days}
                    dayView={dayView}
                    environment={environment}
                    shown={range}
                    single={visibleDays === 1}
                  />
                </Track>
              </div>
              <div role="row" className="flex" style={{ height: collapse.height }}>
                <Track
                  {...placed}
                  gutter={
                    <div data-occludes="" className={`${gutter} z-10`}>
                      <AllDayRowHeader collapse={collapse} />
                    </div>
                  }
                >
                  <TimeGridAllDayCells
                    days={days}
                    formatDate={formatDate}
                    getEventColor={options.getEventColor}
                    labelEvent={labelEvent}
                    onExpand={collapse.expand}
                    onOpenDay={openDay}
                    overflow={collapse.overflows[0]!}
                    row={projection.allDay}
                    shown={range}
                    stickyLabels
                  />
                </Track>
              </div>
            </div>
            <div ref={bodyRef} role="row" className="flex h-[calc(var(--calendar-hour-height)*24)]">
              <Track
                {...placed}
                gutter={
                  <div role="rowheader" data-occludes="" className={`${gutter} z-20`}>
                    <span className="sr-only">Timed events</span>
                    <TimeGridHours locale={locale} />
                  </div>
                }
                overlay={
                  <ScrollSnapPoints
                    axis="inline"
                    base={axis.base}
                    points={Array.from(
                      { length: 2 * SNAP_PAGES + 1 },
                      (_, index) => first + (index - SNAP_PAGES) * visibleDays,
                    )}
                    size={DAY}
                  />
                }
                ref={axis.trackRef}
                style={{
                  // Hour lines, and day lines past the rendered days during a long swipe.
                  backgroundImage: `linear-gradient(to bottom, var(--calendar-grid) 1px, transparent 1px), linear-gradient(to ${direction === "rtl" ? "left" : "right"}, var(--calendar-grid) 1px, transparent 1px)`,
                  backgroundSize: `100% var(--calendar-hour-height), ${DAY} 100%`,
                  // Day lines start at the first rendered day: each tile's length is rounded to
                  // layout units, an error that tiling from the canvas's start would grow into
                  // lines pixels off the days.
                  backgroundPosition: `0 0, ${direction === "rtl" ? "right" : "left"} calc(${start} * ${DAY}) top 0`,
                }}
              >
                <div
                  className="grid flex-1"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.map((day, index) => (
                    <TimeGridColumn
                      key={day.column.key}
                      annotations={
                        annotations === undefined
                          ? undefined
                          : { ...annotations, marks: annotations.layout.columns[index] ?? [] }
                      }
                      day={day}
                      formats={columnFormats}
                      getEventColor={options.getEventColor}
                      labelEvent={labelEvent}
                      nowTop={nowPosition?.column === index ? nowPosition.top : null}
                      offscreen={!plainDateIntervalContains(range, day.column.date)}
                      onOpenDay={openDay}
                      renderUnavailable={options.renderUnavailable}
                      slotMinutes={snap.increment}
                      timeZone={timeZone}
                    />
                  ))}
                </div>
              </Track>
            </div>
          </div>
        </div>
      </div>
      {/* Outside the grid: an open popover's Base UI internals must not become grid children. */}
      {annotations !== undefined && (
        <TimeGridAnnotationOverlays formatTime={formats.time} handles={annotationHandles} />
      )}
    </>
  );
}

function scrollingTimeGridView<const TName extends string, TEvent>(
  name: TName,
  span: TimeGridSpan,
  defaultOptions: TimeGridViewOptions<TEvent>,
) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: scrollingTimeGridStrategy<TimeGridViewOptions<TEvent>, TEvent>(span),
    Renderer: ScrollingTimeGridView<TEvent>,
  });
}

/**
 * The anchor's week, starting on `weekRules.firstDay`, swiping to the week before or after,
 * named `scrolling-week`. Previous and Next move a week, and Today shows today's week.
 */
export function createScrollingWeekView<TEvent = unknown>(
  defaultOptions: TimeGridViewOptions<TEvent> = {},
) {
  return scrollingTimeGridView("scrolling-week", { kind: "week" }, defaultOptions);
}

/** The anchor date, swiping to the day before or after, named `scrolling-day`. */
export function createScrollingDayView<TEvent = unknown>(
  defaultOptions: TimeGridViewOptions<TEvent> = {},
) {
  return scrollingTimeGridView("scrolling-day", { count: 1, kind: "days" }, defaultOptions);
}
