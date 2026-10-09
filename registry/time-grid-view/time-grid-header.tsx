import type {
  CalendarEnvironmentBase,
  CalendarViewActions,
  TimeGridDay,
} from "@moltenship/calendar";
import { useMemo } from "react";

import { cn } from "cn";

export interface TimeGridHeaderProps {
  readonly actions: CalendarViewActions;
  readonly days: readonly TimeGridDay<unknown>[];
  /** View a date opens in a multi-day grid; dates are static without one. */
  readonly dayView: string | undefined;
  readonly environment: CalendarEnvironmentBase;
}

/** "GMT-4" for the display zone at the start of the visible range. */
function offsetLabel(locale: Intl.LocalesArgument, timeZone: string, day: TimeGridDay<unknown>) {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(day.column.day.start)
    .find((part) => part.type === "timeZoneName")?.value;
}

/**
 * The grid's header row: the display zone's offset over the hour gutter, then the weekday and date
 * naming each column. In a multi-day grid the date can open that day.
 */
export function TimeGridHeader({ actions, days, dayView, environment }: TimeGridHeaderProps) {
  const { locale, timeZone } = environment;
  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );
  const single = days.length === 1;
  const opensDay = !single && dayView !== undefined;

  return (
    <div role="row" className="flex">
      <div
        role="columnheader"
        className="flex w-(--calendar-gutter-width) shrink-0 items-end justify-end pr-2 pb-1 text-[0.625rem] text-calendar-axis"
      >
        {days[0] === undefined ? null : offsetLabel(locale, timeZone, days[0])}
      </div>
      <div
        className="grid flex-1"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map(({ column: { date }, isToday }) => {
          const label = formats.full.format(date);
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
