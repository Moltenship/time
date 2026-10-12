import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  useClosedDates,
  useRovingFocus,
  type ClosedDate,
  type ClosedTime,
  type EventDayFragment,
  type EventId,
  type ResourceId,
  type YearDay,
  type YearMonth,
  type YearWeek,
} from "@moltenship/calendar";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

export interface YearFormats {
  readonly date: Intl.DateTimeFormat;
  readonly month: Intl.DateTimeFormat;
  readonly monthYear: Intl.DateTimeFormat;
  readonly time: (time: Temporal.PlainTime) => string;
  readonly weekday: Intl.DateTimeFormat;
  readonly weekdayName: Intl.DateTimeFormat;
  readonly weekdayShort: Intl.DateTimeFormat;
}

/** Opens the day popover; the popover reads the day's events from the current projection. */
export type YearDayPopoverHandle = PopoverPrimitive.Handle<Temporal.PlainDate>;

/** The most event colours a day shows as dots. */
const MAX_DOTS = 3;

function eventCount(count: number): string {
  return count === 0 ? "no events" : count === 1 ? "1 event" : `${count} events`;
}

/** The day's event colours in display order, each once; `undefined` is the theme's default. */
function dotColors<TEvent>(
  fragments: readonly EventDayFragment<TEvent, EventId, ResourceId>[],
  getEventColor: ((event: TEvent) => CalendarEventColor) | undefined,
): readonly (CalendarEventColor | undefined)[] {
  const colors: (CalendarEventColor | undefined)[] = [];
  for (const { event } of fragments) {
    const color = getEventColor?.(event.event);
    if (!colors.includes(color)) colors.push(color);
    if (colors.length === MAX_DOTS) break;
  }
  return colors;
}

interface YearDayCellProps<TEvent> {
  /** Set when the day has no working hours, with whether the days beside it in its row do. */
  readonly closed: (ClosedDate & ClosedTime) | undefined;
  readonly day: YearDay<TEvent, EventId, ResourceId>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly triggerId: string;
}

/**
 * A day of the year and its keyboard focus target: the date, today in a filled circle, and a
 * dot for each event colour on it. Clicking it, Enter or Space opens the day's events in a
 * popover; Shift+Enter opens the day. A day outside the calendar's working hours is muted, and
 * its name says why.
 */
function YearDayCell<TEvent>({
  closed,
  day,
  formats,
  getEventColor,
  handle,
  onOpenDay,
  renderUnavailable,
  triggerId,
}: YearDayCellProps<TEvent>) {
  const roving = useRovingFocus({ date: day.date, kind: "day" });

  return (
    <div
      role="gridcell"
      aria-current={day.isToday ? "date" : undefined}
      aria-haspopup="dialog"
      aria-label={[
        formats.date.format(day.date),
        closed?.label,
        closed === undefined ? undefined : "closed",
        eventCount(day.fragments.length),
      ]
        .filter((part) => part !== undefined)
        .join(", ")}
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
      className="relative min-w-0 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {closed !== undefined && (
        <UnavailableTime
          band={closed}
          className="inset-0 rounded-md bg-calendar-closed"
          date={day.date}
          end={1}
          render={renderUnavailable}
          resource={null}
          slot="year-closed"
          start={0}
        />
      )}
      <PopoverPrimitive.Trigger
        handle={handle}
        id={triggerId}
        payload={day.date}
        aria-label={formats.date.format(day.date)}
        // A click opens the popover without focusing this button: keys belong to the cell around
        // it, the view's one tab stop, where the popover returns focus.
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        className="relative flex size-full flex-col items-center justify-center gap-0.5 rounded-md outline-none hover:bg-accent data-popup-open:bg-accent"
      >
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
            day.isToday && "bg-calendar-today font-semibold text-calendar-today-foreground",
          )}
        >
          {day.date.day}
        </span>
        <span aria-hidden className="flex h-1 gap-0.5">
          {dotColors(day.fragments, getEventColor).map((color, index) => (
            <span
              // Colours are unique per day, but `undefined` can't be a key.
              key={color ?? `default-${index}`}
              data-color={color}
              data-slot="year-event-dot"
              className="size-1 rounded-full bg-calendar-event-border"
            />
          ))}
        </span>
      </PopoverPrimitive.Trigger>
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
  triggerId,
}: YearMonthGridProps<TEvent>) {
  const first = month.range.start;
  const label = formats.monthYear.format(first);
  const closed = useClosedDates(month.range);
  const isOpen = (week: YearWeek<TEvent, EventId, ResourceId>, column: number) => {
    const day = week.days[column];
    return day != null && !closed.has(day.date.toString());
  };
  /** A closed day, opening on a side where its row has an open day beside it. */
  const closedDay = (week: YearWeek<TEvent, EventId, ResourceId>, column: number) => {
    const day = closed.get(week.days[column]!.date.toString());
    return (
      day && {
        ...day,
        opensAfter: column < week.days.length - 1 && isOpen(week, column + 1),
        opensBefore: column > 0 && isOpen(week, column - 1),
      }
    );
  };
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    month.weeks[0]!.range.start.add({ days: index }),
  );

  return (
    <div
      data-month={first.toPlainYearMonth().toString()}
      data-slot="year-month"
      className="flex min-w-0 flex-col gap-1"
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpenMonth(first)}
        // Keys move through the days; the view switcher reaches the month too.
        tabIndex={-1}
        className="self-start rounded-md px-1.5 py-0.5 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        {formats.month.format(first)}
      </button>
      <div role="grid" aria-label={label} className="flex flex-col">
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((date) => (
            <div
              key={date.dayOfWeek}
              role="columnheader"
              aria-label={formats.weekdayName.format(date)}
              className="py-1 text-center text-[0.6875rem] font-medium text-muted-foreground"
            >
              {formats.weekday.format(date)}
            </div>
          ))}
        </div>
        <div className="grid grid-rows-[repeat(6,2.25rem)]">
          {month.weeks.map((week) => (
            <div key={week.range.start.toString()} role="row" className="grid grid-cols-7">
              {week.days.map((day, column) =>
                day === null ? (
                  // Keeps the columns in step for screen readers; the date shows in its own month.
                  <div key={column} role="gridcell" />
                ) : (
                  <YearDayCell
                    key={day.date.toString()}
                    closed={closedDay(week, column)}
                    day={day}
                    formats={formats}
                    getEventColor={getEventColor}
                    handle={handle}
                    onOpenDay={onOpenDay}
                    renderUnavailable={renderUnavailable}
                    triggerId={triggerId(day.date)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
