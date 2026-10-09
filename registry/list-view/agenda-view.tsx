import {
  defineCalendarView,
  getListRange,
  getListTitle,
  listSpatialNavigation,
  navigateList,
  projectList,
  type CalendarViewProjectionInput,
  type CalendarViewRendererProps,
  type EventId,
  type ListProjection,
  type ListViewOptions,
  type ResourceId,
  useRovingFocus,
} from "@moltenship/calendar";
import { CalendarX2Icon } from "lucide-react";
import { useId, useMemo } from "react";

import { useEventLabel, type EventDescriber } from "@registry/calendar/event-label";
import { useViewKeyboard } from "@registry/calendar/view-keyboard";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import { AgendaItem } from "./agenda-item";

export interface AgendaViewOptions<TEvent> extends ListViewOptions {
  /** Extra words for each event's accessible name, such as its calendar. */
  readonly describeEvent?: EventDescriber<TEvent>;
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

/**
 * A range without events, still the agenda's one tab stop: Up and Page Up from it page back, and
 * Down and Page Down page on, so keyboard paging can cross empty weeks.
 */
function EmptyAgenda({
  dates,
  start,
}: {
  readonly dates: string;
  readonly start: Temporal.PlainDate;
}) {
  const roving = useRovingFocus({ date: start, kind: "day" });
  const id = useId();

  return (
    <div
      role="group"
      aria-labelledby={id}
      {...roving}
      onKeyDown={(event) => {
        // Only for paging: the agenda has no cells, so Space must not start an event here.
        if (event.key === " ") event.preventDefault();
      }}
      className="flex flex-col items-center gap-2 rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <CalendarX2Icon aria-hidden className="mb-1 size-10 text-muted-foreground/60" />
      <div id={id} className="flex flex-col gap-2">
        <p className="font-medium">No events</p>
        <p className="text-sm text-muted-foreground">Nothing is scheduled for {dates}.</p>
      </div>
    </div>
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
  const labelEvent = useEventLabel(environment, options.describeEvent);
  const keyboard = useViewKeyboard();
  const openDay = (date: Temporal.PlainDate) => {
    actions.setAnchorDate(date);
    actions.setView("day");
  };

  if (projection.days.length === 0) {
    return (
      <div
        {...keyboard}
        data-slot="agenda-view"
        className="flex h-full items-center justify-center p-6 text-center"
      >
        <EmptyAgenda
          dates={formats.range.formatRange(range.start, range.end.subtract({ days: 1 }))}
          start={range.start}
        />
      </div>
    );
  }

  return (
    <ol
      aria-label={getListTitle(range, environment)}
      {...keyboard}
      data-slot="agenda-view"
      className="h-full divide-y divide-calendar-grid overflow-y-auto"
    >
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
              onClick={() => openDay(day.date)}
              // The list keeps one tab stop; Shift+Enter on an event opens its day.
              tabIndex={-1}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-lg tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
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
                  labelEvent={labelEvent}
                  onOpenDay={openDay}
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
 * week unless `weeks` says otherwise. Clicking a date opens the `day` view on it. From the
 * keyboard the list is one tab stop: Up and Down move between events, Page Up and Page Down
 * between days, and Shift+Enter opens an event's day.
 */
export function createAgendaView<TEvent>(defaultOptions: AgendaViewOptions<TEvent> = {}) {
  return defineCalendarView({
    name: "agenda",
    defaultOptions,
    strategy: {
      getRange: getListRange,
      getSpatialNavigation: listSpatialNavigation,
      getTitle: getListTitle,
      navigate: navigateList,
      project: (input: CalendarViewProjectionInput<AgendaViewOptions<TEvent>, TEvent>) =>
        projectList(input),
    },
    Renderer: AgendaView<TEvent>,
  });
}
