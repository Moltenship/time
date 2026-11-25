"use client";

import {
  defineCalendarView,
  getYearRange,
  getYearTitle,
  navigateYear,
  projectYear,
  useAnchorDateRequests,
  yearSpatialNavigation,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type YearProjection,
} from "@moltenship/calendar";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createMonthInView,
  triggerIdOf,
  yearDaysByDate,
  type YearClosedDays,
} from "@registry/shared/year-view/year-layout";
import { yearFormats, type YearFormats } from "@registry/shared/year-view/year-labels";
import { yearMonthsClass, yearViewClass } from "@registry/shared/year-view/year.styles";
import { createPopoverHandle } from "@registry/calendar-ui/popover";

import { YearDayPopover } from "./year-day-popover";
import { YearMonthGrid, type YearDayPopoverHandle } from "./year-month";

export interface YearViewOptions<TEvent> {
  /**
   * Which closed days are shaded: `"exceptions"` (the default) the dates an exception closes,
   * such as holidays; `"all"` the weekly closed days too, such as weekends, which the weekday
   * columns already show; `"none"` neither. A closed day's name says "closed" either way.
   */
  readonly closedDays?: YearClosedDays;
  /** The registered view a date opens, `"day"` by default. */
  readonly dayView?: string;
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
  /** Picks each event's `data-color`, for its dot and in the day's list. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /**
   * A small icon before an event's title in a day's list, such as a repeat mark on recurring
   * events, or nothing; the dots don't show it. It's decorative and hidden from assistive
   * technology: say the same in `describeEvent`, which adds to each event's accessible name.
   */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  /** The registered view a month's name opens, `"month"` by default. */
  readonly monthView?: string;
  /**
   * Replaces the shading of the closed days `closedDays` picks: an element, or a function of its
   * props and of the band, date and resource, such as hatching for holidays.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

type YearViewProps<TEvent> = CalendarViewRendererProps<
  YearProjection<TEvent, EventId, ResourceId>,
  YearViewOptions<TEvent>
>;

export function useYearFormats(locale: Intl.LocalesArgument): YearFormats {
  return useMemo(() => yearFormats(locale), [locale]);
}

/**
 * Keeps the month the user is after in view, through the shared `createMonthInView`: the date
 * Today, Previous, Next or a picked date asks for, and when a year opens, the day keyboard focus
 * would enter on.
 */
function useMonthInView(view: RefObject<HTMLElement | null>, range: PlainDateInterval) {
  const [inView] = useState(createMonthInView);
  useAnchorDateRequests((date, shown) => inView.request(view.current, date, shown, range));

  const year = range.start.toString();
  useEffect(() => {
    inView.yearShown(view.current, range);
    // Once per year: the range object can change with the same dates.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, view, year]);
}

function YearView<TEvent>({
  actions,
  environment,
  options,
  projection,
  range,
}: YearViewProps<TEvent>) {
  const view = useRef<HTMLDivElement>(null);
  const formats = useYearFormats(environment.locale);
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const keyboard = useViewKeyboard();
  const [handle] = useState<YearDayPopoverHandle>(createPopoverHandle<Temporal.PlainDate>);
  const idPrefix = useId();
  const triggerId = (date: Temporal.PlainDate) => triggerIdOf(idPrefix, date);
  const days = useMemo(() => yearDaysByDate(projection), [projection]);
  const year = range.start.toString();
  // Another year has none of the open day's triggers.
  useEffect(() => handle.close(), [handle, year]);
  useMonthInView(view, range);

  const openView = (name: string, date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView(name);
  };
  const openDay = (date: Temporal.PlainDate) => openView(options.dayView ?? "day", date);
  const openMonth = (date: Temporal.PlainDate) => openView(options.monthView ?? "month", date);

  return (
    <div
      ref={view}
      role="group"
      aria-label={getYearTitle(range, environment)}
      {...keyboard}
      data-slot="year-view"
      className={yearViewClass}
    >
      {/* Two narrow months side by side on a phone, up to six across on a wide screen. */}
      <div className={yearMonthsClass}>
        {projection.months.map((month) => (
          <YearMonthGrid
            key={month.range.start.toString()}
            formats={formats}
            getEventColor={options.getEventColor}
            handle={handle}
            month={month}
            onOpenDay={openDay}
            onOpenMonth={openMonth}
            renderUnavailable={options.renderUnavailable}
            shadeClosedDays={options.closedDays ?? "exceptions"}
            triggerId={triggerId}
          />
        ))}
      </div>
      <YearDayPopover
        days={days}
        formats={formats}
        getEventColor={options.getEventColor}
        getEventIcon={options.getEventIcon}
        handle={handle}
        labelEvent={labelEvent}
        onOpenDay={openDay}
        view={view}
      />
    </div>
  );
}

/**
 * A year at a glance named `year`: twelve months of days, with today in a filled circle and a dot
 * for each event colour on a day. Clicking a day lists its events in a popover, whose date opens
 * the `day` view; a month's name opens the `month` view. The year has one tab stop: arrow keys
 * move between days, Page Up and Page Down by a month, Enter or Space opens a day's events, and
 * Shift+Enter opens the day. It shows events without editing them. Pass default options here; a
 * root can override them through `viewOptions.year`.
 */
export function createYearView<TEvent>(defaultOptions: YearViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "year",
    defaultOptions,
    strategy: {
      getRange: getYearRange,
      getSpatialNavigation: yearSpatialNavigation,
      getTitle: getYearTitle,
      navigate: navigateYear,
      project: (input: CalendarViewProjectionInput<YearViewOptions<TEvent>, TEvent>) =>
        projectYear(input),
    },
    Renderer: YearView<TEvent>,
  });
}
