import {
  plainDateIntervalContains,
  type CalendarEnvironmentBase,
  type CalendarViewActions,
  type PlainDateInterval,
  type TimeGridColumn,
  type TimeGridDay,
} from "@moltenship/calendar";
import { useId, useMemo } from "react";

import { cn } from "cn";

import { describeDayAnnotations } from "./annotation-label";
import type { TimeGridAnnotationWiring } from "./time-grid-annotations";

export interface TimeGridHeaderProps {
  readonly actions: CalendarViewActions;
  /** The root's annotations; each day's header describes its own. */
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
}

/** "GMT-4" for the display zone at the start of a column, such as the first visible day. */
export function offsetLabel(
  locale: Intl.LocalesArgument,
  timeZone: string,
  column: TimeGridColumn,
) {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(column.day.start)
    .find((part) => part.type === "timeZoneName")?.value;
}

export interface TimeGridDayHeadersProps {
  readonly actions: CalendarViewActions;
  /** The root's annotations; each day's header describes its own. */
  readonly annotations?: TimeGridAnnotationWiring;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
  /**
   * The dates on screen, when the grid renders days around them while it scrolls; the others are
   * hidden from assistive technology. All of `days` by default.
   */
  readonly shown?: PlainDateInterval;
  /** Whether the grid shows one day, which takes the larger, start-aligned date. */
  readonly single: boolean;
}

/** A column header per day: the weekday and date, which can open that day in a multi-day grid. */
export function TimeGridDayHeaders({
  actions,
  annotations,
  days,
  dayView,
  environment,
  shown,
  single,
}: TimeGridDayHeadersProps) {
  const { locale } = environment;
  const summaryId = useId();
  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );
  const opensDay = !single && dayView !== undefined;

  return (
    <div
      className="grid flex-1"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map(({ column: { date }, isToday }, index) => {
        const label = formats.full.format(date);
        const marks = annotations?.layout.columns[index];
        const summary =
          annotations === undefined || marks === undefined
            ? undefined
            : describeDayAnnotations(marks, annotations.formats);
        const number = (
          <span
            className={cn(
              "flex items-center justify-center rounded-full text-xl tabular-nums sm:text-2xl",
              single ? "size-11" : "size-9 sm:size-11",
              isToday
                ? "bg-calendar-today text-calendar-today-foreground"
                : opensDay && "group-hover:bg-accent",
            )}
          >
            {date.day}
          </span>
        );

        return (
          <div
            key={date.toString()}
            aria-current={isToday ? "date" : undefined}
            aria-describedby={summary === undefined ? undefined : `${summaryId}-${index}`}
            aria-hidden={
              shown === undefined || plainDateIntervalContains(shown, date) ? undefined : true
            }
            aria-label={label}
            className={cn(
              "flex min-w-0 flex-col gap-0.5 py-2",
              single ? "items-start px-2" : "items-center",
            )}
            role="columnheader"
          >
            <span
              className={cn(
                "text-[0.6875rem] font-medium tracking-wide uppercase",
                isToday ? "text-calendar-today" : "text-muted-foreground",
              )}
            >
              {formats.weekday.format(date)}
            </span>
            {opensDay ? (
              <button
                aria-label={`Open ${label}`}
                // The grid keeps one tab stop; Shift+Enter on a day's cells opens it.
                tabIndex={-1}
                className="group rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                onClick={() => {
                  actions.setAnchorDate(date);
                  actions.setView(dayView);
                }}
                type="button"
              >
                {number}
              </button>
            ) : (
              number
            )}
            {summary !== undefined && (
              <span className="sr-only" id={`${summaryId}-${index}`}>
                {summary}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The grid's header row: the display zone's offset over the hour gutter, then the weekday and date
 * naming each column. In a multi-day grid the date can open that day.
 */
export function TimeGridHeader({
  actions,
  annotations,
  days,
  dayView,
  environment,
}: TimeGridHeaderProps) {
  const { locale, timeZone } = environment;

  return (
    <div role="row" className="flex">
      <div
        role="columnheader"
        className="flex w-(--calendar-gutter-width) shrink-0 items-end justify-end pe-2 pb-1 text-[0.625rem] text-calendar-axis"
      >
        {days[0] === undefined ? null : offsetLabel(locale, timeZone, days[0].column)}
      </div>
      <TimeGridDayHeaders
        actions={actions}
        annotations={annotations}
        days={days}
        dayView={dayView}
        environment={environment}
        single={days.length === 1}
      />
    </div>
  );
}
