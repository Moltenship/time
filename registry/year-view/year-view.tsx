import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  defineCalendarView,
  getYearRange,
  getYearTitle,
  navigateYear,
  plainDateIntervalContains,
  projectYear,
  useAnchorDateRequests,
  yearSpatialNavigation,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type YearDay,
  type YearProjection,
} from "@moltenship/calendar";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { YearDayPopover } from "./year-day-popover";
import {
  YearMonthGrid,
  type YearClosedDays,
  type YearDayPopoverHandle,
  type YearFormats,
} from "./year-month";

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
  return useMemo(() => {
    const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
    const hourMinute = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    return {
      date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      month: new Intl.DateTimeFormat(locale, { month: "long" }),
      monthYear: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      time: (time) => (time.minute === 0 ? hour : hourMinute).format(time),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "narrow" }),
      weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
      weekdayShort: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    };
  }, [locale]);
}

/** Room left above a month scrolled into view, so its name doesn't touch the edge. */
const SCROLL_MARGIN = 12;

function prefersReducedMotion(element: Element): boolean {
  return (
    element.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
    true
  );
}

/**
 * Scrolls the view, and never the page around it, until `date`'s month shows from its top, as
 * where months stack on a phone. A month already in view stays where it is.
 */
function showMonth(view: HTMLElement, date: Temporal.PlainDate, behavior: ScrollBehavior) {
  const month = view.querySelector(`[data-month="${date.toPlainYearMonth().toString()}"]`);
  if (month === null) return;
  const bounds = view.getBoundingClientRect();
  const { bottom, top } = month.getBoundingClientRect();
  if (top >= bounds.top && bottom <= bounds.bottom) return;
  const position = view.scrollTop + top - bounds.top - SCROLL_MARGIN;
  if (typeof view.scrollTo === "function") view.scrollTo({ behavior, top: position });
  else view.scrollTop = position;
}

/**
 * Keeps the month the user is after in view: the date Today, Previous, Next or a picked date asks
 * for, smoothly within the year, and when a year opens, the day keyboard focus would enter on.
 * Keys that move focus into another year leave it to focus, which brings its day into view.
 */
function useMonthInView(view: RefObject<HTMLElement | null>, range: PlainDateInterval) {
  const requested = useRef<Temporal.PlainDate | null>(null);
  const focusInside = (element: HTMLElement) =>
    element.contains(element.ownerDocument.activeElement);

  useAnchorDateRequests((date, shown) => {
    const element = view.current;
    if (element === null) return;
    // Keys move focus within the year without asking for a date, so this is Today or a pick.
    if (shown?.start.equals(range.start) === true) {
      showMonth(element, date, prefersReducedMotion(element) ? "instant" : "smooth");
    } else {
      // Shown once the new year renders.
      requested.current = date;
    }
  });

  const year = range.start.toString();
  useEffect(() => {
    const element = view.current;
    const date = requested.current;
    requested.current = null;
    if (element === null || focusInside(element)) return;
    const entry = element
      .querySelector('[role="gridcell"][tabindex="0"]')
      ?.getAttribute("data-date");
    const target =
      date !== null && plainDateIntervalContains(range, date)
        ? date
        : entry == null
          ? null
          : Temporal.PlainDate.from(entry);
    if (target !== null) showMonth(element, target, "instant");
    // Once per year: the range object can change with the same dates.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [view, year]);
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
  const [handle] = useState<YearDayPopoverHandle>(() =>
    PopoverPrimitive.createHandle<Temporal.PlainDate>(),
  );
  const idPrefix = useId();
  const triggerId = (date: Temporal.PlainDate) => `${idPrefix}${date.toString()}`;
  const days = useMemo(() => {
    const byDate = new Map<string, YearDay<TEvent, EventId, ResourceId>>();
    for (const month of projection.months) {
      for (const week of month.weeks) {
        for (const day of week.days) if (day !== null) byDate.set(day.date.toString(), day);
      }
    }
    return byDate;
  }, [projection]);
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
      className="@container h-full min-h-0 overflow-y-auto"
    >
      {/* Two narrow months side by side on a phone, up to six across on a wide screen. */}
      <div className="grid grid-cols-1 content-start gap-x-4 gap-y-5 p-3 @sm:grid-cols-2 @2xl:gap-x-8 @2xl:p-6 @3xl:grid-cols-3 @5xl:grid-cols-4 @[100rem]:grid-cols-6">
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
