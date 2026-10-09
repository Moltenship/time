import {
  defineCalendarView,
  getMonthRange,
  getMonthTitle,
  limitDayGridLanes,
  monthSpatialNavigation,
  navigateMonth,
  plainDateIntervalContains,
  projectMonth,
  type CalendarFocus,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type DayGridOverflow,
  type EventId,
  type MonthProjection,
  type ResourceId,
  useCalendarAnnouncer,
  useCalendarFocus,
  useCalendarKeyboard,
  useCalendarPointer,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { DATE_ROW_HEIGHT, LANE_HEIGHT, MonthWeekRow, type MonthFormats } from "./month-week";

export interface MonthViewOptions<TEvent> {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Picks each event's `data-color`; events without one use the theme's default colour. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
}

type MonthViewProps<TEvent> = CalendarViewRendererProps<
  MonthProjection<TEvent, EventId, ResourceId>,
  MonthViewOptions<TEvent>
>;

/** Rows never shrink below this; shorter viewports scroll instead. */
const MIN_ROW_HEIGHT = 80;
/** Lane count before the first measurement, e.g. while rendering on the server. */
const INITIAL_LANES = 3;

/** Measures how many event lanes fit in a week row, again only when the grid resizes. */
function useLaneCapacity(body: RefObject<HTMLElement | null>, weekCount: number): number {
  const [lanes, setLanes] = useState(INITIAL_LANES);

  useLayoutEffect(() => {
    const element = body.current;
    if (element === null) return;
    const measure = () => {
      const rowHeight = Math.max(MIN_ROW_HEIGHT, element.clientHeight / weekCount);
      // One pixel for the row's bottom border.
      setLanes(Math.max(1, Math.floor((rowHeight - 1 - DATE_ROW_HEIGHT) / LANE_HEIGHT)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [body, weekCount]);

  return lanes;
}

/**
 * The week whose lane limit hides the event keyboard focus is on, or -1. That week shows all of
 * its lanes, so arrow keys reach every event without opening "+N more".
 */
function weekHidingFocus<TEvent>(
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

/**
 * Rows share the height. An expanded week grows to fit every lane while the others keep their
 * share, so the grid scrolls rather than squeezing events out of their rows.
 */
function rowSizes(weeks: readonly { readonly laneCount: number }[], expandedWeek: number): string {
  if (expandedWeek === -1) return `repeat(${weeks.length}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`;
  const share = `max(${MIN_ROW_HEIGHT}px, ${100 / weeks.length}%)`;
  return weeks
    .map(({ laneCount }, index) =>
      index === expandedWeek
        ? // One pixel for the row's bottom border.
          `max(${share}, ${DATE_ROW_HEIGHT + laneCount * LANE_HEIGHT + 1}px)`
        : share,
    )
    .join(" ");
}

function useMonthFormats(locale: Intl.LocalesArgument): MonthFormats {
  return useMemo(() => {
    const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
    const hourMinute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    return {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      monthDay: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      time: (time) => (time.minute === 0 ? hour : hourMinute).format(time),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
      weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
    };
  }, [locale]);
}

function MonthView<TEvent>({
  actions,
  environment,
  events,
  options,
  projection,
  range,
}: MonthViewProps<TEvent>) {
  const body = useRef<HTMLDivElement>(null);
  // Pointer drags speak through the same messages as the keyboard.
  const announcer = useCalendarAnnouncer();
  const pointerRef = useCalendarPointer({
    announcer,
    events,
    onPropose: actions.proposeEventChange,
    scrollContainer: body,
    timeZone: environment.timeZone,
  });
  const maxLanes = useLaneCapacity(body, projection.weeks.length);
  const formats = useMonthFormats(environment.locale);
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const keyboard = useCalendarKeyboard();
  const overflows = useMemo(
    () => projection.weeks.map((week) => limitDayGridLanes(week, maxLanes)),
    [maxLanes, projection.weeks],
  );
  const expandedWeek = useCalendarFocus((focus) =>
    weekHidingFocus(focus, projection.weeks, overflows),
  );
  const openDay = (date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView("day");
  };

  return (
    <div
      ref={pointerRef}
      role="grid"
      aria-label={getMonthTitle(range, environment)}
      onBlur={keyboard.onBlur}
      onKeyDown={(event) => {
        // React bubbles keys from the "+N more" list's portal through here; its event copies are
        // not focus targets, so their keys stay native (Enter and Space open the event).
        if (event.currentTarget.contains(event.target as Node)) keyboard.onKeyDown(event);
      }}
      data-slot="month-view"
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
        ref={body}
        className="grid min-h-0 flex-1 overflow-y-auto"
        style={{ gridTemplateRows: rowSizes(projection.weeks, expandedWeek) }}
      >
        {projection.weeks.map((week, index) => (
          <MonthWeekRow
            key={week.range.start.toString()}
            expanded={index === expandedWeek}
            formats={formats}
            getEventColor={options.getEventColor}
            labelEvent={labelEvent}
            maxLanes={maxLanes}
            onOpenDay={openDay}
            overflow={overflows[index]!}
            week={week}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A Google Calendar-style month grid named `month`. Clicking a date opens the `day` view on it;
 * dragging an event moves it to another day, and dragging across days creates an all-day event.
 * The grid has one tab stop: arrow keys move between days, Enter enters a day's events, Space
 * grabs an event to move it (Shift+Space to resize) or a day to create an event, and Shift+Enter
 * opens a day. Pass default options here; a root can override them through `viewOptions.month`.
 */
export function createMonthView<TEvent>(defaultOptions: MonthViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "month",
    defaultOptions,
    strategy: {
      getRange: getMonthRange,
      getSpatialNavigation: monthSpatialNavigation,
      getTitle: getMonthTitle,
      navigate: navigateMonth,
      project: (input: CalendarViewProjectionInput<MonthViewOptions<TEvent>, TEvent>) =>
        projectMonth(input),
    },
    Renderer: MonthView<TEvent>,
  });
}
