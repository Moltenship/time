// The page Installation and the Agenda page show, after `shadcn add @moltenship/list-view`. The
// registry's install test adds this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createAgendaView } from "@/components/calendar/list-view/agenda-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createAgendaView<Event>({ getEventColor: (event) => event.data.color })],
});
// #endregion view

// #region page
const events: readonly Event[] = [
  {
    data: { color: "blue" },
    end: Temporal.Instant.from("2026-10-08T09:30:00Z"),
    id: "standup",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Standup",
  },
  {
    data: { color: "teal" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "conference",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Conference",
  },
];

export default function CalendarPage() {
  return (
    <div class="h-dvh">
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="agenda"
        events={events}
        locale="en-US"
        weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
      >
        <h1 class="p-4 text-lg font-semibold">
          <Calendar.Title />
        </h1>
        <Calendar.ActiveView />
      </Calendar.Root>
    </div>
  );
}
// #endregion page
