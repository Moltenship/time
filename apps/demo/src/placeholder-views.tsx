import {
  defineCalendarView,
  type CalendarEnvironmentBase,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
} from "@moltenship/calendar";
import {
  instantInterval,
  iteratePlainDates,
  plainDateInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import { EventChip } from "@registry/calendar/event-chip";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";

import type { DemoEvent } from "./calendar";
import { getCalendarColor } from "./calendars";

// Stand-ins built on the public view API until the registry month and list views land. They
// render their visible range as a day-by-day agenda.

interface PlaceholderOptions {
  readonly getEventColor?: (event: DemoEvent) => CalendarEventColor;
}

const options: PlaceholderOptions = {
  getEventColor: (event) => getCalendarColor(event.calendarId),
};

function formatSpan(range: PlainDateInterval, locale: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(range.start, range.end.subtract({ days: 1 }));
}

function projectAgenda({
  environment,
  range,
  snapshot,
  today,
}: CalendarViewProjectionInput<PlaceholderOptions, DemoEvent>) {
  const { locale, timeZone } = environment;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const wallTime = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toPlainTime();

  return Array.from(iteratePlainDates(range), (date) => {
    const next = date.add({ days: 1 });
    const dayStart = date.toZonedDateTime(timeZone).toInstant();
    const dayEnd = next.toZonedDateTime(timeZone).toInstant();
    const allDay = snapshot
      .queryAllDay(plainDateInterval(date, next))
      .map(({ event }) => ({ event, label: "All day" }));
    // Clip timed events to this day so overnight events read "11:00 PM – 12:00 AM".
    const timed = snapshot
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
    return {
      date,
      entries: [...allDay, ...timed],
      isToday: today?.equals(date) === true,
      weekday: weekday.format(date),
    };
  });
}

function AgendaPlaceholder({
  options: viewOptions,
  projection: days,
}: CalendarViewRendererProps<ReturnType<typeof projectAgenda>, PlaceholderOptions>) {
  return (
    <ol className="h-full divide-y divide-calendar-grid overflow-y-auto">
      {days.map(({ date, entries, isToday, weekday }) => {
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

function placeholderView<const TName extends string>(
  name: TName,
  getRange: (anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase) => PlainDateInterval,
  step: (delta: number) => Temporal.DurationLike,
  getTitle: (range: PlainDateInterval, locale: Intl.LocalesArgument) => string,
) {
  return defineCalendarView({
    defaultOptions: options,
    name,
    strategy: {
      getRange,
      getTitle: (range, environment) => getTitle(range, environment.locale),
      navigate: (anchor, delta) => anchor.add(step(delta)),
      project: projectAgenda,
    },
    Renderer: AgendaPlaceholder,
  });
}

export const demoViews = [
  createWeekView<DemoEvent>({ ...options, dayView: "day" }),
  createDayView<DemoEvent>(options),
  placeholderView(
    "month",
    (anchor) => {
      const start = anchor.with({ day: 1 });
      return plainDateInterval(start, start.add({ months: 1 }));
    },
    (delta) => ({ months: delta }),
    (range, locale) =>
      new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(range.start),
  ),
  placeholderView(
    "agenda",
    (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    (delta) => ({ weeks: delta }),
    formatSpan,
  ),
] as const;
