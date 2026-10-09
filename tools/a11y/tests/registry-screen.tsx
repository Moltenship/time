import {
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  type CalendarEvent,
} from "@moltenship/calendar";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const getEventColor = (event: Fixture) => event.data.color;
const Calendar = createCalendar<Fixture, never>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<Fixture>({ dayView: "day", getEventColor }),
    createDayView<Fixture>({ getEventColor }),
    createMonthView<Fixture>({ getEventColor }),
    createAgendaView<Fixture>({ getEventColor }),
  ],
});

export type RegistryView = (typeof Calendar.views)[number]["name"];
export const registryViews: readonly RegistryView[] = ["month", "week", "day", "agenda"];
const viewOptions = registryViews.map((value) => ({ label: value, value }));

const today = Temporal.PlainDate.from("2026-10-08");
const firstMeeting = Temporal.Instant.from("2026-10-08T08:00:00Z");
const firstCall = Temporal.Instant.from("2026-10-05T15:00:00Z");

function timed(color: CalendarEventColor, title: string, start: Temporal.Instant, minutes: number) {
  const end = start.add({ minutes });
  return { data: { color }, end, id: title, kind: "timed", start, title } as const;
}

function allDay(color: CalendarEventColor, title: string, start: string, end: string) {
  return {
    data: { color },
    end: Temporal.PlainDate.from(end),
    id: title,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title,
  } as const;
}

/**
 * Every palette colour as a 45-minute block on the anchor day and a 30-minute one across the week,
 * plus all-day bars, one crossing into the next week: enough to fill a month cell and show "+N more".
 */
const events: readonly Fixture[] = [
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} meeting`, firstMeeting.add({ hours: index }), 45),
  ),
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} call`, firstCall.add({ hours: 24 * (index % 7) }), 30),
  ),
  allDay("teal", "Conference", "2026-10-06", "2026-10-10"),
  allDay("orange", "Holiday", "2026-10-08", "2026-10-09"),
  allDay("purple", "Offsite", "2026-10-10", "2026-10-14"),
];

/** A view under the toolbar, beside a mini month whose selected date is not today. */
export function RegistryScreen({
  dir,
  view,
}: {
  readonly dir?: "ltr" | "rtl";
  readonly view: RegistryView;
}) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={today}
        defaultTimeZone="UTC"
        defaultView={view}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh" dir={dir}>
          <aside className="w-64 shrink-0 border-e p-3">
            <MiniMonth
              locale="en-US"
              onSelectDate={() => {}}
              selectedDate={today.add({ days: 1 })}
              today={today}
              visibleRange={plainDateInterval(today.subtract({ days: 3 }), today.add({ days: 4 }))}
              weekStartsOn={1}
            />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <CalendarToolbar calendar={Calendar} className="border-b">
              <ViewSwitcher onValueChange={() => {}} options={viewOptions} value={view} />
            </CalendarToolbar>
            <Calendar.Viewport className="min-h-0 flex-1">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </main>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
