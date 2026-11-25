// The Scrolling views page's month, after `shadcn add` of the Solid scrolling month. The registry's
// install test adds this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createScrollingMonthView } from "@/components/calendar/scrolling-month-view/scrolling-month-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createScrollingMonthView<Event>({ getEventColor: (event) => event.data.color })],
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
  {
    data: { color: "purple" },
    end: Temporal.Instant.from("2026-11-03T15:00:00Z"),
    id: "planning",
    kind: "timed",
    start: Temporal.Instant.from("2026-11-03T14:00:00Z"),
    title: "Planning",
  },
];

// #region page
export default function ScrollingMonthPage() {
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
      defaultView="scrolling-month"
      events={events()}
      locale="en-US"
      onEventChange={save}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {/* Six weeks share the viewport's height; the title follows the month a swipe rests on. */}
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
