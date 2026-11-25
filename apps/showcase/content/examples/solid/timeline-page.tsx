// The Resource timeline page's samples, after `shadcn add` of the Solid timeline. The registry's
// install test adds this file to a clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarResource,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import {
  createTimelineDayView,
  createTimelineMonthView,
  createTimelineWeekView,
} from "@/components/calendar/resource-timeline-view/resource-timeline-view";

export type Meeting = CalendarEvent<{ readonly color: CalendarEventColor }>;
export type Room = CalendarResource<{ readonly kind: "floor" | "room" | "person" }>;

const getEventColor = (meeting: Meeting) => meeting.data.color;

export const Calendar = createCalendar<Meeting, Room>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [
    createTimelineDayView<Meeting, Room>({
      getEventColor,
      // #region stack
      // Rooms stack their bookings; people keep a lane for each level of overlap.
      getResourceOverlapLayout: (resource) => (resource.data.kind === "room" ? "stack" : undefined),
      // #endregion stack
    }),
    createTimelineWeekView<Meeting, Room>({ getEventColor }),
    createTimelineMonthView<Meeting, Room>({ getEventColor }),
  ],
});
// #endregion view

// #region resources
export const rooms: readonly Room[] = [
  { data: { kind: "floor" }, id: "floor-1", title: "First floor" },
  { data: { kind: "room" }, id: "orchid", parentId: "floor-1", title: "Orchid" },
  { data: { kind: "room" }, id: "lotus", parentId: "floor-1", title: "Lotus" },
  { data: { kind: "floor" }, id: "floor-2", title: "Second floor" },
  { data: { kind: "room" }, id: "iris", parentId: "floor-2", title: "Iris" },
  { data: { kind: "person" }, id: "ada", title: "Ada" },
];
// #endregion resources

const at = (instant: string) => Temporal.Instant.from(instant);

const seed: readonly Meeting[] = [
  {
    data: { color: "blue" },
    end: at("2026-10-08T09:30:00Z"),
    id: "standup",
    kind: "timed",
    resourceIds: ["orchid", "ada"],
    start: at("2026-10-08T09:00:00Z"),
    title: "Standup",
  },
  {
    data: { color: "teal" },
    end: at("2026-10-08T11:30:00Z"),
    id: "review",
    kind: "timed",
    resourceIds: ["orchid"],
    start: at("2026-10-08T10:00:00Z"),
    title: "Design review",
  },
  {
    data: { color: "purple" },
    end: at("2026-10-08T11:00:00Z"),
    id: "interview",
    kind: "timed",
    resourceIds: ["orchid"],
    start: at("2026-10-08T10:30:00Z"),
    title: "Interview",
  },
  {
    data: { color: "orange" },
    end: at("2026-10-08T15:00:00Z"),
    id: "workshop",
    kind: "timed",
    resourceIds: ["lotus"],
    start: at("2026-10-08T13:00:00Z"),
    title: "Workshop",
  },
  {
    data: { color: "pink" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "offsite",
    kind: "all-day",
    resourceIds: ["iris"],
    start: Temporal.PlainDate.from("2026-10-09"),
    title: "Offsite",
  },
];

// #region page
export default function TimelinePage() {
  const [events, setEvents] = createSignal<readonly Meeting[]>(seed);
  // A drag or a key proposes a change; saving it moves the event, to another room too.
  const save = (change: CalendarEventChange<Meeting, string, string>) => {
    if (change.cause === "create") {
      const meeting: Meeting = {
        data: { color: "blue" },
        id: crypto.randomUUID(),
        title: "New meeting",
        ...change.proposed,
      };
      setEvents((all) => [...all, meeting]);
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
      defaultExpandedResourceIds={["floor-1", "floor-2"]}
      defaultTimeZone="UTC"
      defaultView="timeline-day"
      events={events()}
      locale="en-US"
      onEventChange={save}
      resources={rooms}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      {/* The timeline scrolls inside the height it's given. */}
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
