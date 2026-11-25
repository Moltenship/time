// The Year page's samples, after `shadcn add` of the Solid year and month. The registry's install
// test adds this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createYearView } from "@/components/calendar/year-view/year-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

const getEventColor = (event: Event) => event.data.color;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createYearView<Event>({ getEventColor }), createMonthView<Event>({ getEventColor })],
});
// #endregion view

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

// #region page
export default function YearPage() {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="year"
      events={events}
      locale="en-US"
      // Shade weekends too, not only the dates an exception closes.
      viewOptions={{ year: { closedDays: "all" } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {/* The months scroll inside the viewport; the page around it stays put. */}
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
