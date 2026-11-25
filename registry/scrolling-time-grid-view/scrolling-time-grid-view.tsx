"use client";

import {
  defineCalendarView,
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
  type CalendarViewRendererProps,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar";
import {
  useLayoutEffect,
  useMemo,
  useRef,
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
import {
  barFocusInView,
  dayWidth,
  DAY,
  daysBackground,
  daysLength,
  pageSnap,
  pageSnapPoints,
} from "@registry/shared/scrolling-time-grid-view/scrolling-time-grid";
import {
  scrollingTimeGridBodyClass,
  scrollingTimeGridClass,
  scrollingTimeGridColumnsClass,
  scrollingTimeGridCornerClass,
  scrollingTimeGridDaysClass,
  scrollingTimeGridFollowerClass,
  scrollingTimeGridGhostClass,
  scrollingTimeGridGutterClass,
  scrollingTimeGridHeaderClass,
  scrollingTimeGridRowClass,
  scrollingTimeGridStripClass,
  scrollingTimeGridTrackClass,
  scrollingTimeGridViewportClass,
} from "@registry/shared/scrolling-time-grid-view/scrolling-time-grid.styles";
import { annotationFormats } from "@registry/shared/time-grid-view/annotation-label";
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
import { TimeGridEventTooltip } from "@registry/time-grid-view/time-grid-event";
import { offsetLabel, TimeGridDayHeaders } from "@registry/time-grid-view/time-grid-header";
import type { TimeGridViewOptions } from "@registry/time-grid-view/time-grid-view";
import {
  gutterColumn,
  gutterStyle,
  TimeGridGutterLabels,
  useTimeGridZones,
} from "@registry/time-grid-view/time-grid-zones";

import {
  useDaysFollower,
  useOpeningTime,
  useStickyHeaderPadding,
} from "./scrolling-time-grid-scroll";

/** Pointer and keyboard both step by these slots, so they reach the same times. */
const snap = { increment: 15, smallestUnit: "minute" } as const;
export type ScrollingTimeGridViewProps<TEvent> = CalendarViewRendererProps<
  TimeGridProjection<TEvent>,
  TimeGridViewOptions<TEvent>
>;

/** A row's days across the canvas, with `children` at `start`. */
function Track({
  children,
  count,
  overlay,
  ref,
  start,
  strip,
  style,
}: {
  readonly children: ReactNode;
  /** Days the canvas holds. */
  readonly count: number;
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
    <div
      ref={ref}
      className={scrollingTimeGridTrackClass}
      style={{ ...style, width: daysLength(count) }}
    >
      {overlay}
      <div
        className={scrollingTimeGridStripClass}
        style={{ marginInlineStart: daysLength(start), width: daysLength(strip) }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Day columns that scroll sideways without end, a page at a time, as in Apple's Calendar on
 * iPad: a week swipes to the next week, three days to the next three, and a day to the next day,
 * and the calendar's range follows. The header, all-day row, and hour gutter stay in place while the
 * days scroll under them. A page of days on each side is rendered with its events, and keys,
 * dragging, and creating work as in `TimeGridView`.
 *
 * The hours and the days scroll in two elements, one inside the other, so a swipe moves one of
 * them, whichever way it starts: Safari on iOS locks no direction in an element that scrolls both
 * ways, where a swipe down would also page the days. The header follows the days by a transform
 * that a scroll timeline drives.
 */
export function ScrollingTimeGridView<TEvent>({
  actions,
  environment,
  events,
  isReadOnly,
  loadRange,
  options,
  projection,
  range,
}: ScrollingTimeGridViewProps<TEvent>) {
  const { days } = projection;
  const { direction, locale, timeZone } = environment;
  const visibleDays = range.start.until(range.end).days;
  const columns = useMemo(() => days.map(({ column }) => column), [days]);
  // The gutter reads each secondary zone on a visible day, not on the pages rendered beside them.
  const zones = useTimeGridZones(environment, columns, range);
  const first = epochDay(range.start);
  // Scrolls the hours; the days scroll sideways in `axis.scrollRef`, inside it.
  const viewportRef = useRef<HTMLDivElement>(null);
  const axis = useScrollingAxis({
    axis: "inline",
    first,
    onScroll: (day) => actions.setAnchorDate(fromEpochDay(day)),
    page: visibleDays,
    rtl: direction === "rtl",
    // Whole pages from the range, so a week stays a calendar week and three days move three.
    snapTo: pageSnap(first, visibleDays),
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
    disabled: isReadOnly,
    events,
    // A dragged bar's copy keeps its title at its start, not where the bar's pin had moved it.
    ghostClassName: scrollingTimeGridGhostClass,
    onPropose: actions.proposeEventChange,
    preview: options.dragPreview,
    scrollContainer: viewportRef,
    sidewaysScrollContainer: axis.scrollRef,
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
  const headerRef = useStickyHeaderPadding(viewportRef);
  const followDays = useDaysFollower(axis.scrollRef, direction === "rtl");
  useOpeningTime({
    bodyRef,
    headerRef,
    now,
    nowTop: nowPosition?.top ?? null,
    scrollRef: viewportRef,
  });

  const placed = { count: axis.count, start, strip: days.length };
  const firstShown = days.find(({ column }) => column.date.equals(range.start)) ?? days[0];
  const corner = gutterColumn(columns, zones, firstShown?.column);
  const background = daysBackground(direction === "rtl", start);

  return (
    <TimeGridEventTooltip>
      {/* Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell. */}
      <div
        ref={pointerRef}
        role="grid"
        aria-label={timeGridTitle(range, locale)}
        {...keyboard}
        data-slot="scrolling-time-grid"
        dir={direction}
        className={scrollingTimeGridClass(isReadOnly)}
        style={gutterStyle(zones)}
      >
        <div
          ref={viewportRef}
          data-slot="scrolling-time-grid-viewport"
          className={scrollingTimeGridViewportClass}
          style={{ "--calendar-day-width": dayWidth(visibleDays) } as CSSProperties}
        >
          <div
            ref={headerRef}
            data-slot="scrolling-time-grid-header"
            className={scrollingTimeGridHeaderClass}
          >
            {/* Days scroll beneath it, so the pointer layer doesn't look through it to them. */}
            <div role="row" data-occludes="" className={scrollingTimeGridRowClass}>
              <div role="columnheader" className={scrollingTimeGridCornerClass}>
                <TimeGridGutterLabels
                  offset={corner === undefined ? undefined : offsetLabel(locale, timeZone, corner)}
                  zones={zones}
                />
              </div>
              {/* The days follow the scroll below by transform; nothing can scroll them here. */}
              <div className={scrollingTimeGridFollowerClass}>
                <Track {...placed} ref={followDays}>
                  <TimeGridDayHeaders
                    actions={actions}
                    annotations={annotations}
                    days={days}
                    dayView={dayView}
                    environment={environment}
                    shown={range}
                    single={visibleDays === 1}
                    zones={zones}
                  />
                </Track>
              </div>
            </div>
            <div
              role="row"
              className={scrollingTimeGridRowClass}
              style={{ height: collapse.height }}
            >
              <div data-occludes="" className={scrollingTimeGridGutterClass}>
                <AllDayRowHeader collapse={collapse} />
              </div>
              <div className={scrollingTimeGridFollowerClass}>
                <Track {...placed} ref={followDays}>
                  <TimeGridAllDayCells
                    days={days}
                    formatDate={formatDate}
                    getEventColor={options.getEventColor}
                    getEventIcon={options.getEventIcon}
                    labelEvent={labelEvent}
                    onExpand={collapse.expand}
                    onOpenDay={openDay}
                    overflow={collapse.overflows[0]!}
                    row={projection.allDay}
                    shown={range}
                  />
                </Track>
              </div>
            </div>
          </div>
          <div ref={bodyRef} role="row" className={scrollingTimeGridBodyClass}>
            <div role="rowheader" data-occludes="" className={scrollingTimeGridGutterClass}>
              <span className="sr-only">Timed events</span>
              <TimeGridHours locale={locale} zones={zones} />
            </div>
            {/* The days scroll sideways only, a page at a time; it has no scrollbar to drag. */}
            <div
              ref={axis.scrollRef}
              data-slot="scrolling-time-grid-days"
              className={scrollingTimeGridDaysClass}
            >
              <Track
                {...placed}
                overlay={
                  <ScrollSnapPoints
                    axis="inline"
                    base={axis.base}
                    points={pageSnapPoints(first, visibleDays)}
                    size={DAY}
                  />
                }
                ref={axis.trackRef}
                style={{
                  // Hour lines, and day lines past the rendered days during a long swipe.
                  backgroundImage: background.image,
                  backgroundPosition: background.position,
                  backgroundSize: background.size,
                }}
              >
                <div
                  className={scrollingTimeGridColumnsClass}
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
                      getEventIcon={options.getEventIcon}
                      isReadOnly={isReadOnly}
                      labelEvent={labelEvent}
                      nowTop={nowPosition?.column === index ? nowPosition.top : null}
                      offscreen={!plainDateIntervalContains(range, day.column.date)}
                      onOpenDay={openDay}
                      renderUnavailable={options.renderUnavailable}
                      slotMinutes={snap.increment}
                      timeZone={timeZone}
                      zones={zones}
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
    </TimeGridEventTooltip>
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

/** Three days from the anchor date, swiping three at a time, named `scrolling-3-day`. */
export function createScrollingThreeDayView<TEvent = unknown>(
  defaultOptions: TimeGridViewOptions<TEvent> = {},
) {
  return scrollingTimeGridView("scrolling-3-day", { count: 3, kind: "days" }, defaultOptions);
}
