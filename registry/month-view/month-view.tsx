import {
  defineCalendarView,
  getMonthRange,
  getMonthTitle,
  navigateMonth,
  projectMonth,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar";
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { DATE_ROW_HEIGHT, LANE_HEIGHT, MonthWeekRow, type MonthFormats } from "./month-week";

export interface MonthViewOptions<TEvent> {
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

function useMonthFormats(locale: Intl.LocalesArgument): MonthFormats {
  return useMemo(() => {
    const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
    const hourMinute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    return {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      monthDay: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      time: (time) => (time.minute === 0 ? hour : hourMinute).format(time),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    };
  }, [locale]);
}

function MonthView<TEvent>({ actions, environment, options, projection }: MonthViewProps<TEvent>) {
  const body = useRef<HTMLDivElement>(null);
  const maxLanes = useLaneCapacity(body, projection.weeks.length);
  const formats = useMonthFormats(environment.locale);
  const openDay = (date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView("day");
  };

  return (
    <div data-slot="month-view" className="flex h-full min-h-0 flex-col">
      <div aria-hidden className="grid shrink-0 grid-cols-7 border-b border-calendar-grid">
        {projection.weeks[0]?.days.map(({ date }) => (
          <div
            key={date.dayOfWeek}
            className="py-2 text-center text-[0.6875rem] font-medium text-muted-foreground uppercase"
          >
            {formats.weekday.format(date)}
          </div>
        ))}
      </div>
      <div
        ref={body}
        className="grid min-h-0 flex-1 overflow-y-auto"
        style={{
          gridTemplateRows: `repeat(${projection.weeks.length}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`,
        }}
      >
        {projection.weeks.map((week) => (
          <MonthWeekRow
            key={week.range.start.toString()}
            formats={formats}
            getEventColor={options.getEventColor}
            maxLanes={maxLanes}
            onOpenDay={openDay}
            week={week}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A Google Calendar-style month grid named `month`. Clicking a date opens the `day` view on it.
 * Pass default options here; a root can override them through `viewOptions.month`.
 */
export function createMonthView<TEvent>(defaultOptions: MonthViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "month",
    defaultOptions,
    strategy: {
      getRange: getMonthRange,
      getTitle: getMonthTitle,
      navigate: navigateMonth,
      project: (input: CalendarViewProjectionInput<MonthViewOptions<TEvent>, TEvent>) =>
        projectMonth(input),
    },
    Renderer: MonthView<TEvent>,
  });
}
