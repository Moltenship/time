// The Week and day page's samples, after `shadcn add` of the Solid time grid. The registry's install
// test adds this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

const getEventColor = (event: Event) => event.data.color;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [
    createWeekView<Event>({ dayView: "day", getEventColor }),
    createDayView<Event>({ getEventColor }),
  ],
});
// #endregion view

const seed: readonly Event[] = [
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

// #region page
export default function WeekPage() {
  const [events, setEvents] = createSignal<readonly Event[]>(seed);
  // A drag or a key proposes a change; saving it moves the event.
  const save = (change: CalendarEventChange<Event, string, string>) => {
    if (change.cause === "create") {
      const event: Event = {
        data: { color: "blue" },
        id: crypto.randomUUID(),
        title: "New event",
        ...change.proposed,
      };
      setEvents((all) => [...all, event]);
    } else if (change.cause !== "delete") {
      setEvents((all) =>
        all.map((event) =>
          event.id === change.eventId ? { ...event, ...change.proposed } : event,
        ),
      );
    }
  };
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events()}
      locale="en-US"
      onEventChange={save}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      {/* The hours scroll inside the viewport, under the header and the all-day row. */}
      <Calendar.Frame class="flex h-dvh flex-col">
        <h1 class="p-4 text-lg font-semibold">
          <Calendar.Title />
        </h1>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion page
