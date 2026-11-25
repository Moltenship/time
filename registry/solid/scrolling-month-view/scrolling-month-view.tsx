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
} from "@moltenship/calendar-solid";
import { createMemo, createSignal, For, onSettled, untrack, type Accessor } from "solid-js";

import { useEventLabel } from "@registry/calendar/event-label";
import { ScrollSnapPoints, useScrollingAxis } from "@registry/calendar/scrolling-axis";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import {
  useMonthFormats,
  weekHidingFocus,
  type MonthViewOptions,
} from "@registry/month-view/month-view";
import { LaneProbe, MonthWeekRow, weekHeight } from "@registry/month-view/month-week";
import { INITIAL_LANES } from "@registry/shared/month-view/month-layout";
import {
  monthColumnHeaderClass,
  monthHeaderRowClass,
  monthViewClass,
} from "@registry/shared/month-view/month.styles";
import {
  attachWeekLanes,
  scrollingMonthWeeks,
  WEEK,
  weekNumber,
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
 * when the track or the lane height changes: `probe` is a `LaneProbe`. A view's week count is
 * fixed, so the count is read once.
 */
function useLaneCapacity(
  track: () => HTMLElement | undefined,
  probe: () => HTMLElement | undefined,
  count: Accessor<number>,
): Accessor<number> {
  const [lanes, setLanes] = createSignal(INITIAL_LANES, { ownedWrite: true });
  onSettled(() => {
    const element = track();
    if (element === undefined) return;
    return attachWeekLanes(element, { count: untrack(count), onChange: setLanes, probe: probe() });
  });
  return lanes;
}

/**
 * Weeks that swipe up and down without end, a month at a time: each month comes to rest with the
 * week of its first day on top, names the view, and keeps its days bright. Rows share the height
 * between the visible weeks and render for a page of weeks above and below, with their events,
 * and dragging and keys work as in the month view.
 */
function ScrollingMonthView<TEvent>(props: ScrollingMonthViewProps<TEvent>) {
  let track: HTMLDivElement | undefined;
  let laneProbe: HTMLDivElement | undefined;
  const weeks = () => props.range.start.until(props.range.end).days / 7;
  const axisWeeks = createMemo(() => scrollingMonthWeeks(props.range, weeks(), props.environment));
  const axis = useScrollingAxis(() => {
    const numbered = axisWeeks();
    return {
      axis: "block",
      first: numbered.first,
      onScroll: (week) => props.actions.setAnchorDate(numbered.anchorOf(week)),
      page: weeks(),
      rtl: false,
      snapTo: numbered.snapTo,
    };
  });
  // Today and Next can ask for the anchor the view already has while a scroll runs ahead of it.
  useAnchorDateRequests((_, requested) => {
    if (requested !== null) axis.request(weekNumber(requested.start));
  });
  const start = () => weekNumber((props.loadRange ?? props.range).start) - axis.base();

  // Pointer drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointer = useCalendarPointer(() => ({
    announcer,
    check: props.actions.checkEventChange,
    disabled: props.isReadOnly,
    events: props.events,
    onPropose: props.actions.proposeEventChange,
    preview: props.options.dragPreview,
    scrollContainer: {
      get current() {
        return axis.scrollElement() ?? null;
      },
    },
    timeZone: props.environment.timeZone,
  }));
  const keyboard = useViewKeyboard();
  const maxLanes = useLaneCapacity(
    () => track,
    () => laneProbe,
    axis.count,
  );
  const formats = useMonthFormats(() => props.environment.locale);
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const overflows = createMemo(() =>
    props.projection.weeks.map((week) => limitDayGridLanes(week, maxLanes())),
  );
  const expandedWeek = useCalendarFocus((focus) =>
    weekHidingFocus(focus, props.projection.weeks, overflows()),
  );
  const title = createMemo(() =>
    new Intl.DateTimeFormat(props.environment.locale, { month: "long", year: "numeric" }).format(
      scrollingMonthOf(props.range),
    ),
  );
  const openDay = (date: Temporal.PlainDate) => {
    props.actions.setAnchorDate(date);
    props.actions.setView(props.options.dayView ?? "day");
  };

  return (
    <div
      ref={[keyboard, pointer]}
      role="grid"
      aria-label={title()}
      data-slot="scrolling-month"
      class={monthViewClass(props.isReadOnly)}
    >
      <LaneProbe
        ref={(element) => {
          laneProbe = element;
        }}
      />
      <div role="row" class={monthHeaderRowClass}>
        <For each={props.projection.weeks[0]?.days ?? []} keyed={(day) => day.date.dayOfWeek}>
          {(day) => (
            <div
              role="columnheader"
              aria-label={formats().weekdayName.format(day().date)}
              class={monthColumnHeaderClass}
            >
              {formats().weekday.format(day().date)}
            </div>
          )}
        </For>
      </div>
      <div
        ref={axis.scrollRef}
        data-slot="scrolling-month-viewport"
        class={scrollingMonthViewportClass}
        // Always a whole month on screen, so every date is on a page: short viewports show fewer
        // event lanes rather than fewer weeks.
        style={{ "--calendar-week-height": `calc(100cqh / ${weeks()})` }}
      >
        <div
          ref={(element) => {
            track = element;
            axis.trackRef(element);
          }}
          class={scrollingMonthTrackClass}
          style={{ height: `calc(${axis.count()} * ${WEEK})` }}
        >
          <ScrollSnapPoints
            axis="block"
            base={axis.base()}
            points={axisWeeks().snapPoints()}
            size={WEEK}
          />
          <div
            class={scrollingMonthWeeksClass}
            style={{
              "grid-template-rows": `repeat(${props.projection.weeks.length}, ${WEEK})`,
              "margin-block-start": `calc(${start()} * ${WEEK})`,
            }}
          >
            <For each={props.projection.weeks} keyed={(week) => week.range.start.toString()}>
              {(week, index) => {
                const expanded = () => index() === expandedWeek();
                const offscreen = () => !plainDateIntervalContains(props.range, week().range.start);
                return (
                  // Weeks rendered above and below the visible ones are for scrolling into.
                  <div
                    aria-hidden={offscreen() ? "true" : undefined}
                    class={scrollingMonthWeekClass(expanded())}
                    style={
                      expanded() ? { height: `max(100%, ${weekHeight(week().laneCount)})` } : {}
                    }
                  >
                    <MonthWeekRow
                      expanded={expanded()}
                      formats={formats()}
                      getEventColor={props.options.getEventColor}
                      getEventIcon={props.options.getEventIcon}
                      labelEvent={labelEvent()}
                      maxLanes={maxLanes()}
                      offscreen={offscreen()}
                      onOpenDay={openDay}
                      overflow={overflows()[index()]!}
                      renderUnavailable={props.options.renderUnavailable}
                      week={week()}
                    />
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A month of weeks that swipes up and down a month at a time, named `scrolling-month`. `weeks`
 * rows share the height: six by default, which every month fits, up to twelve. Previous and Next
 * move a month. Clicking a date opens `dayView`. Pass default options here; a root can override
 * them through `viewOptions["scrolling-month"]`.
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
