// The Month page's samples, after `shadcn add` of the Solid month. The registry's install test adds
// this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createMonthView } from "@/components/calendar/month-view/month-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createMonthView<Event>({ getEventColor: (event) => event.data.color })],
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
export default function MonthPage() {
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
      defaultView="month"
      events={events()}
      locale="en-US"
      onEventChange={save}
      viewOptions={{ month: { dragPreview: "free" } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {/* The weeks share the viewport's height, and show as many events as fit. */}
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
