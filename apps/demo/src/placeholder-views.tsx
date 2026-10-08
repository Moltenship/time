import type {
  CalendarEnvironment,
  CalendarViewRendererProps,
  CalendarViewStrategy,
} from "@moltenship/calendar";
import {
  instantInterval,
  iteratePlainDates,
  plainDateInterval,
  weekRange,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";
import { useMemo } from "react";

import { EventChip } from "@registry/calendar/event-chip";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";

import { DemoCalendar, type DemoEvent, type DemoView } from "./calendar";
import { getCalendarColor } from "./calendars";

// Stand-ins built on the public view API until the registry month, time-grid and list views
// land. Every view renders its visible range as a day-by-day agenda.

interface PlaceholderOptions {
  readonly getEventColor?: (event: DemoEvent) => CalendarEventColor;
}

type PlaceholderStrategy = CalendarViewStrategy<
  DemoView,
  PlaceholderOptions,
  null,
  null,
  null,
  null,
  null,
  null
>;

function placeholderStrategy(
  name: DemoView,
  getRange: (anchor: Temporal.PlainDate, environment: CalendarEnvironment) => PlainDateInterval,
  step: Temporal.DurationLike,
  getTitle: (range: PlainDateInterval, locale: Intl.LocalesArgument) => string,
): PlaceholderStrategy {
  const forward = Temporal.Duration.from(step);
  return {
    getInteractionGeometry: () => null,
    getRange,
    getSpatialNavigation: () => null,
    getTitle: (range, environment) => getTitle(range, environment.locale),
    name,
    navigate: (anchor, direction) => anchor.add(direction === 1 ? forward : forward.negated()),
    project: () => null,
  };
}

function formatSpan(range: PlainDateInterval, locale: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(range.start, range.end.subtract({ days: 1 }));
}

const strategies = {
  agenda: placeholderStrategy(
    "agenda",
    (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    { days: 7 },
    formatSpan,
  ),
  day: placeholderStrategy(
    "day",
    (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    { days: 1 },
    (range, locale) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
        range.start,
      ),
  ),
  month: placeholderStrategy(
    "month",
    (anchor) => {
      const start = anchor.with({ day: 1 });
      return plainDateInterval(start, start.add({ months: 1 }));
    },
    { months: 1 },
    (range, locale) =>
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(range.start),
  ),
  week: placeholderStrategy(
    "week",
    (anchor, environment) => weekRange(anchor, { weekStartsOn: environment.weekRules.firstDay }),
    { weeks: 1 },
    formatSpan,
  ),
} satisfies Record<DemoView, PlaceholderStrategy>;

const options: PlaceholderOptions = {
  getEventColor: (event) => getCalendarColor(event.calendarId),
};

/** The dates the active placeholder view shows; replaced by `useVisibleRange` with #70. */
export function getVisibleRange(
  view: DemoView,
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironment,
): PlainDateInterval {
  return strategies[view].getRange(anchor, environment, options);
}

function AgendaPlaceholder({
  calendar,
  options: viewOptions,
  strategy,
}: CalendarViewRendererProps<DemoEvent, never, DemoView, PlaceholderOptions, PlaceholderStrategy>) {
  const { anchorDate, timeZone } = calendar.state;
  const { environment, eventSnapshot } = calendar.meta;
  const today = Temporal.Now.plainDateISO(timeZone);
  const days = useMemo(() => {
    const weekday = new Intl.DateTimeFormat(environment.locale, { weekday: "short" });
    const time = new Intl.DateTimeFormat(environment.locale, {
      hour: "numeric",
      minute: "2-digit",
    });
    const wallTime = (instant: Temporal.Instant) =>
      instant.toZonedDateTimeISO(timeZone).toPlainTime();
    const range = strategy.getRange(anchorDate, environment, viewOptions);

    return Array.from(iteratePlainDates(range), (date) => {
      const next = date.add({ days: 1 });
      const dayStart = date.toZonedDateTime(timeZone).toInstant();
      const dayEnd = next.toZonedDateTime(timeZone).toInstant();
      const allDay = eventSnapshot
        .queryAllDay(plainDateInterval(date, next))
        .map(({ event }) => ({ event, label: "All day" }));
      // Clip timed events to this day so overnight events read "11:00 PM – 12:00 AM".
      const timed = eventSnapshot
        .queryTimed(instantInterval(dayStart, dayEnd))
        .toSorted((left, right) => Temporal.Instant.compare(left.start, right.start))
        .map(({ end, event, start }) => {
          const from = Temporal.Instant.compare(start, dayStart) < 0 ? dayStart : start;
          const to = Temporal.Instant.compare(end, dayEnd) > 0 ? dayEnd : end;
          const spansDay = from.equals(dayStart) && to.equals(dayEnd);
          return {
            event,
            label: spansDay ? "All day" : time.formatRange(wallTime(from), wallTime(to)),
          };
        });
      return { date, entries: [...allDay, ...timed], weekday: weekday.format(date) };
    });
  }, [anchorDate, environment, eventSnapshot, strategy, timeZone, viewOptions]);

  return (
    <ol className="h-full divide-y divide-calendar-grid overflow-y-auto">
      {days.map(({ date, entries, weekday }) => {
        const isToday = date.equals(today);
        return (
          <li key={date.toString()} className="flex gap-3 px-3 py-3 sm:gap-6 sm:px-6">
            <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
              <span
                className={cn(
                  "text-[0.6875rem] font-medium uppercase",
                  isToday ? "text-calendar-today" : "text-muted-foreground",
                )}
              >
                {weekday}
              </span>
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-lg",
                  isToday && "bg-calendar-today text-calendar-today-foreground",
                )}
              >
                {date.day}
              </span>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              {entries.length === 0 && (
                <li className="py-1.5 text-sm text-muted-foreground">No events</li>
              )}
              {entries.map(({ event, label }) => (
                <li key={event.id}>
                  <EventChip
                    color={viewOptions.getEventColor?.(event)}
                    className="w-full py-1.5 text-sm max-sm:flex-col max-sm:items-start max-sm:gap-0.5 sm:gap-3"
                  >
                    <span className="shrink-0 font-normal tabular-nums opacity-80 sm:w-36">
                      {label}
                    </span>
                    <span className="truncate">{event.title}</span>
                  </EventChip>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

export const demoViews = (["week", "day", "month", "agenda"] as const).map((name) =>
  DemoCalendar.defineView({
    defaultOptions: options,
    Renderer: AgendaPlaceholder,
    strategy: strategies[name],
  }),
);
