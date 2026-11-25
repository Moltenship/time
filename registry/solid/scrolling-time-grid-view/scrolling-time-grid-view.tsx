import {
  defineCalendarView,
  plainDateIntervalContains,
  sameFocus,
  scrollingTimeGridStrategy,
  timeGridPosition,
  timeGridTitle,
  useAnchorDateRequests,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarPointer,
  useNow,
  type CalendarViewRendererProps,
  type TimeGridProjection,
  type TimeGridSpan,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

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
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { fullDateFormat, timedEventsLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import {
  AllDayRowHeader,
  TimeGridAllDayCells,
  useAllDayCollapse,
} from "@registry/time-grid-view/time-grid-all-day";
import {
  createAnnotationHandles,
  DEFAULT_COLUMN_HEIGHT,
  TimeGridAnnotationOverlays,
  useTimeGridAnnotationLayout,
  type TimeGridAnnotationWiring,
} from "@registry/time-grid-view/time-grid-annotations";
import { observeHeight, TimeGridHours } from "@registry/time-grid-view/time-grid-body";
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
function Track(props: {
  readonly children: JSX.Element;
  /** Days the canvas holds. */
  readonly count: number;
  /** Positioned over the whole track, such as its snap points. */
  readonly overlay?: JSX.Element;
  /** The element `count` days wide. */
  readonly ref?: (element: HTMLDivElement) => void;
  /** Days from the canvas's start to the first rendered one; negative before it is extended. */
  readonly start: number;
  /** Days rendered. */
  readonly strip: number;
  readonly style?: JSX.CSSProperties;
}) {
  return (
    <div
      ref={props.ref}
      class={scrollingTimeGridTrackClass}
      style={{ ...props.style, width: daysLength(props.count) }}
    >
      {props.overlay}
      <div
        class={scrollingTimeGridStripClass}
        style={{
          "margin-inline-start": daysLength(props.start),
          width: daysLength(props.strip),
        }}
      >
        {props.children}
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
export function ScrollingTimeGridView<TEvent>(props: ScrollingTimeGridViewProps<TEvent>) {
  // Scrolls the hours; the days scroll sideways in `axis.scrollRef`, inside it.
  let viewport: HTMLDivElement | undefined;
  let header: HTMLDivElement | undefined;
  let body: HTMLDivElement | undefined;
  const days = () => props.projection.days;
  const rtl = () => props.environment.direction === "rtl";
  const visibleDays = () => props.range.start.until(props.range.end).days;
  const columns = createMemo(() => days().map(({ column }) => column));
  // The gutter reads each secondary zone on a visible day, not on the pages rendered beside them.
  const zones = useTimeGridZones(
    () => props.environment,
    columns,
    () => props.range,
  );
  const first = () => epochDay(props.range.start);
  const axis = useScrollingAxis(() => ({
    axis: "inline",
    first: first(),
    onScroll: (day) => props.actions.setAnchorDate(fromEpochDay(day)),
    page: visibleDays(),
    rtl: rtl(),
    // Whole pages from the range, so a week stays a calendar week and three days move three.
    snapTo: pageSnap(first(), visibleDays()),
  }));
  // Today and Next can ask for the range the view already has while a scroll runs ahead of it.
  useAnchorDateRequests((_, requested) => {
    if (requested !== null) axis.request(epochDay(requested.start));
  });
  const start = () => epochDay((props.loadRange ?? props.range).start) - axis.base();

  // Pointer drags speak through the same messages as the keyboard, and the drag preview labels
  // the proposed range in the calendar's locale.
  const announcer = useCalendarAnnouncer();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    columns: columns(),
    disabled: props.isReadOnly,
    events: props.events,
    // A dragged bar's copy keeps its title at its start, not where the bar's pin had moved it.
    ghostClassName: scrollingTimeGridGhostClass,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    scrollContainer: {
      get current() {
        return viewport ?? null;
      },
    },
    sidewaysScrollContainer: {
      get current() {
        return axis.scrollElement() ?? null;
      },
    },
    snap,
    timeZone: props.environment.timeZone,
  }));
  const keyboard = useViewKeyboard({ snap });

  // Merging and lane packing use drawn sizes, so they follow the body's measured height.
  const [columnHeight, setColumnHeight] = createSignal(DEFAULT_COLUMN_HEIGHT);
  const bodyHeight = observeHeight(() => setColumnHeight);
  const annotationLayout = useTimeGridAnnotationLayout(
    columns,
    () => props.options.annotations,
    () => ({ columnHeight: columnHeight(), dense: visibleDays() > 1 }),
  );
  const annotationHandles = createAnnotationHandles();
  const formats = createMemo(() =>
    annotationFormats(props.environment.locale, props.environment.timeZone),
  );
  const annotations = createMemo((): TimeGridAnnotationWiring | undefined => {
    const layout = annotationLayout();
    return layout.enabled ? { formats: formats(), handles: annotationHandles, layout } : undefined;
  });

  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const columnFormats = useTimeGridColumnFormats(() => props.environment.locale);
  const formatDate = createMemo(() => fullDateFormat(props.environment.locale));
  const openDay = createMemo(() => {
    const { dayView } = props.options;
    return dayView === undefined || visibleDays() === 1
      ? undefined
      : (date: Temporal.PlainDate) => {
          props.actions.setAnchorDate(date);
          props.actions.setView(dayView);
        };
  });

  const allDayRows = createMemo(() => [{ row: props.projection.allDay }]);
  const collapse = useAllDayCollapse(days, allDayRows);
  // A bar keeps focus as its focused day scrolls away, on the visible day nearest it.
  const focusOnBar = useCalendarFocus(
    (focus) =>
      barFocusInView(focus, props.projection.allDay, props.range, props.environment.timeZone),
    { isEqual: sameFocus },
  );
  createEffect(focusOnBar, (focus) => {
    if (focus !== null) props.actions.setFocus(focus);
  });
  const now = useNow();
  const nowPosition = createMemo(() => {
    const instant = now();
    return instant === null ? null : timeGridPosition(columns(), instant);
  });
  useStickyHeaderPadding(
    () => viewport,
    () => header,
  );
  // Each change of the days, the canvas, or the bars moves what follows the days.
  const followDays = useDaysFollower(axis.scrollElement, rtl, () => [
    props.projection,
    start(),
    axis.count(),
    collapse.height,
  ]);
  useOpeningTime({
    body: () => body,
    header: () => header,
    now,
    nowTop: () => nowPosition()?.top ?? null,
    scroller: () => viewport,
  });

  const corner = createMemo(() => {
    const firstShown =
      days().find(({ column }) => column.date.equals(props.range.start)) ?? days()[0];
    const column = gutterColumn(columns(), zones(), firstShown?.column);
    const { locale, timeZone } = props.environment;
    return column === undefined ? undefined : offsetLabel(locale, timeZone, column);
  });
  const background = () => daysBackground(rtl(), start());

  return (
    <TimeGridEventTooltip>
      {/* Rows: day headers, all-day events, and the timed day columns; each starts with a gutter cell. */}
      <div
        ref={[keyboard, pointer]}
        role="grid"
        aria-label={timeGridTitle(props.range, props.environment.locale)}
        data-slot="scrolling-time-grid"
        dir={props.environment.direction}
        class={scrollingTimeGridClass(props.isReadOnly)}
        style={gutterStyle(zones())}
      >
        <div
          ref={(element) => {
            viewport = element;
          }}
          data-slot="scrolling-time-grid-viewport"
          class={scrollingTimeGridViewportClass}
          style={{ "--calendar-day-width": dayWidth(visibleDays()) }}
        >
          <div
            ref={(element) => {
              header = element;
            }}
            data-slot="scrolling-time-grid-header"
            class={scrollingTimeGridHeaderClass}
          >
            {/* Days scroll beneath it, so the pointer layer doesn't look through it to them. */}
            <div role="row" data-occludes="" class={scrollingTimeGridRowClass}>
              <div role="columnheader" class={scrollingTimeGridCornerClass}>
                <TimeGridGutterLabels offset={corner()} zones={zones()} />
              </div>
              {/* The days follow the scroll below by transform; nothing can scroll them here. */}
              <div class={scrollingTimeGridFollowerClass}>
                <Track count={axis.count()} ref={followDays} start={start()} strip={days().length}>
                  <TimeGridDayHeaders
                    actions={props.actions}
                    annotations={annotations()}
                    days={days()}
                    dayView={props.options.dayView}
                    environment={props.environment}
                    shown={props.range}
                    single={visibleDays() === 1}
                    zones={zones()}
                  />
                </Track>
              </div>
            </div>
            <div role="row" class={scrollingTimeGridRowClass} style={{ height: collapse.height }}>
              <div data-occludes="" class={scrollingTimeGridGutterClass}>
                <AllDayRowHeader collapse={collapse} />
              </div>
              <div class={scrollingTimeGridFollowerClass}>
                <Track count={axis.count()} ref={followDays} start={start()} strip={days().length}>
                  <TimeGridAllDayCells
                    days={days()}
                    formatDate={formatDate()}
                    getEventColor={props.options.getEventColor}
                    getEventIcon={props.options.getEventIcon}
                    labelEvent={labelEvent()}
                    onExpand={collapse.expand}
                    onOpenDay={openDay()}
                    overflow={collapse.overflows[0]!}
                    row={props.projection.allDay}
                    shown={props.range}
                  />
                </Track>
              </div>
            </div>
          </div>
          <div
            ref={[
              (element: HTMLDivElement) => {
                body = element;
              },
              bodyHeight,
            ]}
            role="row"
            class={scrollingTimeGridBodyClass}
          >
            <div role="rowheader" data-occludes="" class={scrollingTimeGridGutterClass}>
              <span class={srOnlyClass}>{timedEventsLabel}</span>
              <TimeGridHours locale={props.environment.locale} zones={zones()} />
            </div>
            {/* The days scroll sideways only, a page at a time; it has no scrollbar to drag. */}
            <div
              ref={axis.scrollRef}
              data-slot="scrolling-time-grid-days"
              class={scrollingTimeGridDaysClass}
            >
              <Track
                count={axis.count()}
                overlay={
                  <ScrollSnapPoints
                    axis="inline"
                    base={axis.base()}
                    points={pageSnapPoints(first(), visibleDays())}
                    size={DAY}
                  />
                }
                ref={axis.trackRef}
                start={start()}
                strip={days().length}
                style={{
                  // Hour lines, and day lines past the rendered days during a long swipe.
                  "background-image": background().image,
                  "background-position": background().position,
                  "background-size": background().size,
                }}
              >
                <div
                  class={scrollingTimeGridColumnsClass}
                  style={{ "grid-template-columns": dayColumns(days().length) }}
                >
                  <For each={days()} keyed={(day) => day.column.key}>
                    {(day, index) => (
                      <TimeGridColumn
                        annotations={
                          annotations() === undefined
                            ? undefined
                            : {
                                ...annotations()!,
                                marks: annotations()!.layout.columns[index()] ?? [],
                              }
                        }
                        day={day()}
                        formats={columnFormats()}
                        getEventColor={props.options.getEventColor}
                        getEventIcon={props.options.getEventIcon}
                        isReadOnly={props.isReadOnly}
                        labelEvent={labelEvent()}
                        nowTop={nowPosition()?.column === index() ? nowPosition()!.top : null}
                        offscreen={!plainDateIntervalContains(props.range, day().column.date)}
                        onOpenDay={openDay()}
                        renderUnavailable={props.options.renderUnavailable}
                        slotMinutes={snap.increment}
                        timeZone={props.environment.timeZone}
                        zones={zones()}
                      />
                    )}
                  </For>
                </div>
              </Track>
            </div>
          </div>
        </div>
      </div>
      {/* Outside the grid: an open popover's parts must not become grid children. */}
      <Show when={annotations() !== undefined}>
        <TimeGridAnnotationOverlays formatTime={formats().time} handles={annotationHandles} />
      </Show>
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
