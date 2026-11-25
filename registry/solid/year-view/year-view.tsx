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
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createUniqueId, For, untrack, type Accessor } from "solid-js";

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
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The registered view a month's name opens, `"month"` by default. */
  readonly monthView?: string;
  /**
   * Replaces the shading of the closed days `closedDays` picks: a function of its props and of
   * the band, date and resource, such as hatching for holidays.
   */
  readonly renderUnavailable?: UnavailableTimeRender;
}

type YearViewProps<TEvent> = CalendarViewRendererProps<
  YearProjection<TEvent, EventId, ResourceId>,
  YearViewOptions<TEvent>
>;

/** The year's formats, new when the locale changes. */
export function useYearFormats(locale: Accessor<Intl.LocalesArgument>): Accessor<YearFormats> {
  return createMemo(() => yearFormats(locale()));
}

/**
 * Keeps the month the user is after in view, through the shared `createMonthInView`: the date
 * Today, Previous, Next or a picked date asks for, and when a year opens, the day keyboard focus
 * would enter on.
 */
function useMonthInView(
  view: () => HTMLElement | undefined,
  range: Accessor<PlainDateInterval>,
  year: Accessor<string>,
): void {
  const inView = createMonthInView();
  useAnchorDateRequests((date, shown) => inView.request(view(), date, shown, untrack(range)));
  // Once per year, a frame after it renders and before it paints: the roving focus marks the
  // year's tab stop, which `yearShown` scrolls to, in a later flush than this effect's.
  createEffect(year, () => {
    const frame = requestAnimationFrame(() => inView.yearShown(view(), untrack(range)));
    return () => cancelAnimationFrame(frame);
  });
}

function YearView<TEvent>(props: YearViewProps<TEvent>) {
  let view: HTMLDivElement | undefined;
  const formats = useYearFormats(() => props.environment.locale);
  const labelEvent = useEventLabel(
    () => props.environment,
    () => props.options.describeEvent,
  );
  const keyboard = useViewKeyboard();
  const handle: YearDayPopoverHandle = createPopoverHandle<Temporal.PlainDate>();
  const idPrefix = createUniqueId();
  const triggerId = (date: Temporal.PlainDate) => triggerIdOf(idPrefix, date);
  const days = createMemo(() => yearDaysByDate(props.projection));
  // The year shown, which a new projection of the same year keeps: an effect runs whenever its
  // source does, and the range is a new object with every projection.
  const year = createMemo(() => props.range.start.toString());
  // Another year has none of the open day's triggers.
  createEffect(year, (shown, previous) => {
    if (previous !== undefined && shown !== previous) handle.close();
  });
  useMonthInView(
    () => view,
    () => props.range,
    year,
  );

  const openView = (name: string, date: Temporal.PlainDate) => {
    props.actions.setAnchorDate(date);
    props.actions.setView(name);
  };
  const openDay = (date: Temporal.PlainDate) => openView(props.options.dayView ?? "day", date);
  const openMonth = (date: Temporal.PlainDate) =>
    openView(props.options.monthView ?? "month", date);

  return (
    <div
      ref={[
        (element) => {
          view = element;
        },
        keyboard,
      ]}
      role="group"
      aria-label={getYearTitle(props.range, props.environment)}
      data-slot="year-view"
      class={yearViewClass}
    >
      {/* Two narrow months side by side on a phone, up to six across on a wide screen. */}
      <div class={yearMonthsClass}>
        <For each={props.projection.months} keyed={(month) => month.range.start.toString()}>
          {(month) => (
            <YearMonthGrid
              formats={formats()}
              getEventColor={props.options.getEventColor}
              handle={handle}
              month={month()}
              onOpenDay={openDay}
              onOpenMonth={openMonth}
              renderUnavailable={props.options.renderUnavailable}
              shadeClosedDays={props.options.closedDays ?? "exceptions"}
              triggerId={triggerId}
            />
          )}
        </For>
      </div>
      <YearDayPopover
        days={days()}
        formats={formats()}
        getEventColor={props.options.getEventColor}
        getEventIcon={props.options.getEventIcon}
        handle={handle}
        labelEvent={labelEvent()}
        onOpenDay={openDay}
        view={() => view}
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
