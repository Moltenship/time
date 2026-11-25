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
import * as stylex from "@stylexjs/stylex";

import {
  UnavailableTime,
  type UnavailableTimeRender,
} from "@registry/stylex-calendar/unavailable-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { PopoverTrigger, type PopoverHandle } from "@registry/stylex-calendar-ui/popover";
import {
  closedDaysOf,
  dotColors,
  weekdaysOf,
  type YearClosedDays,
  type YearShade,
} from "@registry/shared/year-view/year-layout";
import { dayCellLabel, type YearFormats } from "@registry/shared/year-view/year-labels";

const styles = stylex.create({
  cell: {
    borderRadius: "calc(var(--radius) * 0.8)",
    minWidth: 0,
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": -2 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    position: "relative",
  },
  date: {
    alignItems: "center",
    borderRadius: "9999px",
    display: "flex",
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    height: "1.5rem",
    justifyContent: "center",
    lineHeight: "1rem",
    width: "1.5rem",
  },
  dateToday: {
    backgroundColor: calendarVars["--calendar-today"],
    color: calendarVars["--calendar-today-foreground"],
    fontWeight: 600,
  },
  dot: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    height: "0.25rem",
    width: "0.25rem",
  },
  dots: {
    display: "flex",
    gap: "0.125rem",
    height: "0.25rem",
  },
  grid: {
    display: "flex",
    flexDirection: "column",
  },
  month: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minWidth: 0,
  },
  monthName: {
    alignSelf: "flex-start",
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    paddingBlock: "0.125rem",
    paddingInline: "0.375rem",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  },
  shade: {
    backgroundColor: calendarVars["--calendar-closed"],
    insetBlock: "0.125rem",
    insetInlineEnd: 0,
    insetInlineStart: 0,
  },
  shadeFirst: {
    borderEndStartRadius: "calc(var(--radius) * 0.8)",
    borderStartStartRadius: "calc(var(--radius) * 0.8)",
    insetInlineStart: "0.125rem",
  },
  shadeLast: {
    borderEndEndRadius: "calc(var(--radius) * 0.8)",
    borderStartEndRadius: "calc(var(--radius) * 0.8)",
    insetInlineEnd: "0.125rem",
  },
  trigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": calendarVars["--accent"],
      "[aria-expanded=true]": calendarVars["--accent"],
    },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    fontFamily: "inherit",
    fontSize: "inherit",
    gap: "0.125rem",
    height: "100%",
    justifyContent: "center",
    lineHeight: "inherit",
    outlineStyle: "none",
    padding: 0,
    position: "relative",
    width: "100%",
  },
  weekday: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.6875rem",
    fontWeight: 500,
    paddingBlock: "0.25rem",
    textAlign: "center",
  },
  weeks: {
    display: "grid",
    gridTemplateRows: "repeat(6, 2.25rem)",
  },
});

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
      {...stylex.props(styles.cell)}
    >
      {shade !== undefined && (
        <UnavailableTime
          band={shade.band}
          // A band along the row, rounded where its run starts and ends; rows stay apart.
          xstyle={[styles.shade, shade.first && styles.shadeFirst, shade.last && styles.shadeLast]}
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
        xstyle={styles.trigger}
      >
        <span {...stylex.props(styles.date, day.isToday && styles.dateToday)}>{day.date.day}</span>
        <span aria-hidden {...stylex.props(styles.dots)}>
          {dotColors(day.fragments, getEventColor).map((color, index) => (
            <span
              // Colours are unique per day, but `undefined` can't be a key.
              key={color ?? `default-${index}`}
              data-color={color}
              data-slot="year-event-dot"
              {...stylex.props(styles.dot, color !== undefined && eventColorStyles[color])}
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
      {...stylex.props(styles.month)}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpenMonth(first)}
        // Keys move through the days; the view switcher reaches the month too.
        tabIndex={-1}
        {...stylex.props(styles.monthName)}
      >
        {formats.month.format(first)}
      </button>
      <div role="grid" aria-label={label} {...stylex.props(styles.grid)}>
        <div role="row" {...stylex.props(styles.row)}>
          {weekdaysOf(month).map((date) => (
            <div
              key={date.dayOfWeek}
              role="columnheader"
              aria-label={formats.weekdayName.format(date)}
              {...stylex.props(styles.weekday)}
            >
              {formats.weekday.format(date)}
            </div>
          ))}
        </div>
        <div {...stylex.props(styles.weeks)}>
          {month.weeks.map((week) => {
            const days = closedDaysOf(week, closed, shadeClosedDays);
            return (
              <div key={week.range.start.toString()} role="row" {...stylex.props(styles.row)}>
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
