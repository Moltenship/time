import {
  defineCalendarView,
  getListRange,
  getListTitle,
  navigateList,
  projectList,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ListViewOptions,
  type ResourceId,
} from "@moltenship/calendar";
import { CalendarX2Icon } from "lucide-react";
import { useMemo } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";

import { AgendaItem } from "./agenda-item";

export interface AgendaViewOptions<TEvent> extends ListViewOptions {
  /** Picks each event's `data-color`; events without one use the theme's default colour. */
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
}

type AgendaViewProps<TEvent> = CalendarViewRendererProps<
  ListProjection<TEvent, EventId, ResourceId>,
  AgendaViewOptions<TEvent>
>;

function useAgendaFormats(locale: Intl.LocalesArgument) {
  return useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
      range: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
    }),
    [locale],
  );
}

function AgendaView<TEvent>({
  actions,
  environment,
  options,
  projection,
  range,
}: AgendaViewProps<TEvent>) {
  const formats = useAgendaFormats(environment.locale);

  if (projection.days.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <CalendarX2Icon aria-hidden className="mb-1 size-10 text-muted-foreground/60" />
        <p className="font-medium">No events</p>
        <p className="text-sm text-muted-foreground">
          Nothing is scheduled for{" "}
          {formats.range.formatRange(range.start, range.end.subtract({ days: 1 }))}.
        </p>
      </div>
    );
  }

  return (
    <ol data-slot="agenda-view" className="h-full divide-y divide-calendar-grid overflow-y-auto">
      {projection.days.map((day) => (
        <li
          key={day.date.toString()}
          data-date={day.date.toString()}
          className="flex gap-3 px-3 py-2 sm:gap-6 sm:px-6"
        >
          {/* Sticks to the top while the day's events scroll past. */}
          <div className="sticky top-0 flex w-12 shrink-0 flex-col items-center gap-0.5 self-start pt-1">
            <span
              className={cn(
                "text-[0.6875rem] font-medium uppercase",
                day.isToday ? "text-calendar-today" : "text-muted-foreground",
              )}
            >
              {formats.weekday.format(day.date)}
            </span>
            <button
              type="button"
              aria-current={day.isToday ? "date" : undefined}
              aria-label={formats.date.format(day.date)}
              onClick={() => {
                actions.setAnchorDate(day.date);
                actions.setView("day");
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-lg tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                day.isToday &&
                  "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
              )}
            >
              {day.date.day}
            </button>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
            {day.items.map((item) => (
              // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
              <li key={`${typeof item.event.id}:${item.event.id}`}>
                <AgendaItem
                  color={options.getEventColor?.(item.event.event)}
                  item={item}
                  timeFormat={formats.time}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * A chronological agenda named `agenda`: the days that have events, four weeks from the anchor's
 * week unless `weeks` says otherwise. Clicking a date opens the `day` view on it.
 */
export function createAgendaView<TEvent>(defaultOptions: AgendaViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "agenda",
    defaultOptions,
    strategy: {
      getRange: getListRange,
      getTitle: getListTitle,
      navigate: navigateList,
      project: (input: CalendarViewProjectionInput<AgendaViewOptions<TEvent>, TEvent>) =>
        projectList(input),
    },
    Renderer: AgendaView<TEvent>,
  });
}
