"use client";

import {
  useClosedDates,
  useRovingFocus,
  type ClosedDate,
  type EventId,
  type ResourceId,
  type YearDay,
  type YearMonth,
} from "@moltenship/calendar";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  closedDaysOf,
  dotColors,
  weekdaysOf,
  type YearClosedDays,
  type YearShade,
} from "@registry/shared/year-view/year-layout";
import { dayCellLabel, type YearFormats } from "@registry/shared/year-view/year-labels";
import {
  yearClosedClass,
  yearDateClass,
  yearDayButtonClass,
  yearDayCellClass,
  yearDotClass,
  yearDotsClass,
  yearGridClass,
  yearMonthClass,
  yearMonthNameClass,
  yearWeekClass,
  yearWeekdayClass,
  yearWeekdayRowClass,
  yearWeeksClass,
} from "@registry/shared/year-view/year.styles";
import { PopoverTrigger, type PopoverHandle } from "@registry/calendar-ui/popover";

export type { YearClosedDays } from "@registry/shared/year-view/year-layout";
export type { YearFormats } from "@registry/shared/year-view/year-labels";

/** Opens the day popover; the popover reads the day's events from the current projection. */
export type YearDayPopoverHandle = PopoverHandle<Temporal.PlainDate>;

interface YearDayCellProps<TEvent> {
  /** Set when the day has no working hours. */
  readonly closed: ClosedDate | undefined;
  readonly day: YearDay<TEvent, EventId, ResourceId>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Set when the view shades this closed day. */
  readonly shade: YearShade | undefined;
  readonly triggerId: string;
}

/**
 * A day of the year and its keyboard focus target: the date, today in a filled circle, and a
 * dot for each event colour on it. Clicking it, Enter or Space opens the day's events in a
 * popover; Shift+Enter opens the day. A closed day's name says why, and a shaded one joins the
 * shaded days beside it in a band.
 */
function YearDayCell<TEvent>({
  closed,
  day,
  formats,
  getEventColor,
  handle,
  onOpenDay,
  renderUnavailable,
  shade,
  triggerId,
}: YearDayCellProps<TEvent>) {
  const roving = useRovingFocus({ date: day.date, kind: "day" });

  return (
    <div
      role="gridcell"
      aria-current={day.isToday ? "date" : undefined}
      aria-haspopup="dialog"
      aria-label={dayCellLabel(formats, day.date, closed, day.fragments.length)}
      data-closed={closed === undefined ? undefined : ""}
      data-date={day.date.toString()}
      {...roving}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        // Handled here, so the view's keyboard doesn't start an event on the day.
        event.preventDefault();
        if (event.key === "Enter" && event.shiftKey) onOpenDay(day.date);
        else handle.open(triggerId);
      }}
      className={yearDayCellClass}
    >
      {shade !== undefined && (
        <UnavailableTime
          band={shade.band}
          className={yearClosedClass(shade)}
          date={day.date}
          end={1}
          render={renderUnavailable}
          resource={null}
          slot="year-closed"
          start={0}
        />
      )}
      <PopoverTrigger
        handle={handle}
        id={triggerId}
        payload={day.date}
        aria-label={formats.date.format(day.date)}
        // A click opens the popover without focusing this button: keys belong to the cell around
        // it, the view's one tab stop, where the popover returns focus.
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        className={yearDayButtonClass}
      >
        <span className={yearDateClass(day.isToday)}>{day.date.day}</span>
        <span aria-hidden className={yearDotsClass}>
          {dotColors(day.fragments, getEventColor).map((color, index) => (
            <span
              // Colours are unique per day, but `undefined` can't be a key.
              key={color ?? `default-${index}`}
              data-color={color}
              data-slot="year-event-dot"
              className={yearDotClass}
            />
          ))}
        </span>
      </PopoverTrigger>
    </div>
  );
}

export interface YearMonthGridProps<TEvent> {
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly month: YearMonth<TEvent, EventId, ResourceId>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly onOpenMonth: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  /** Which closed days to shade. */
  readonly shadeClosedDays: YearClosedDays;
  /** The ID of the popover trigger for a date. */
  readonly triggerId: (date: Temporal.PlainDate) => string;
}

/**
 * One month of the year: its name, which opens the month, weekday initials, and a grid of its
 * weeks. Every month keeps room for six weeks, so months side by side line up.
 */
export function YearMonthGrid<TEvent>({
  formats,
  getEventColor,
  handle,
  month,
  onOpenDay,
  onOpenMonth,
  renderUnavailable,
  shadeClosedDays,
  triggerId,
}: YearMonthGridProps<TEvent>) {
  const first = month.range.start;
  const label = formats.monthYear.format(first);
  const closed = useClosedDates(month.range);

  return (
    <div
      data-month={first.toPlainYearMonth().toString()}
      data-slot="year-month"
      className={yearMonthClass}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpenMonth(first)}
        // Keys move through the days; the view switcher reaches the month too.
        tabIndex={-1}
        className={yearMonthNameClass}
      >
        {formats.month.format(first)}
      </button>
      <div role="grid" aria-label={label} className={yearGridClass}>
        <div role="row" className={yearWeekdayRowClass}>
          {weekdaysOf(month).map((date) => (
            <div
              key={date.dayOfWeek}
              role="columnheader"
              aria-label={formats.weekdayName.format(date)}
              className={yearWeekdayClass}
            >
              {formats.weekday.format(date)}
            </div>
          ))}
        </div>
        <div className={yearWeeksClass}>
          {month.weeks.map((week) => {
            const days = closedDaysOf(week, closed, shadeClosedDays);
            return (
              <div key={week.range.start.toString()} role="row" className={yearWeekClass}>
                {week.days.map((day, column) =>
                  day === null ? (
                    // Keeps the columns in step for screen readers; the date shows in its own month.
                    <div key={column} role="gridcell" />
                  ) : (
                    <YearDayCell
                      key={day.date.toString()}
                      closed={days[column]!.closed}
                      day={day}
                      formats={formats}
                      getEventColor={getEventColor}
                      handle={handle}
                      onOpenDay={onOpenDay}
                      renderUnavailable={renderUnavailable}
                      shade={days[column]!.shade}
                      triggerId={triggerId(day.date)}
                    />
                  ),
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
