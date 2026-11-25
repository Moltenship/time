// Availability's rooms and people: the Solid timeline with each resource's own hours and clock, a
// status in each row's header, and policies for working hours and double booking. It opens on
// today, in the visitor's time zone, so the status says who's busy now.

import {
  availabilityPolicy,
  conflictPolicy,
  createCalendar,
  createCanonicalEventAdapter,
  type AvailabilityRule,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarResource,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createTimelineDayView } from "@/components/calendar/resource-timeline-view/resource-timeline-view";

type Meeting = CalendarEvent<{ readonly color: CalendarEventColor }>;
type Member = CalendarResource<{ readonly kind: "person" | "room" }>;

const weekdays = (start: string, end: string): AvailabilityRule => ({
  days: [1, 2, 3, 4, 5],
  start: Temporal.PlainTime.from(start),
  end: Temporal.PlainTime.from(end),
});

// The rooms open longer than the office; Alex and Lee keep 9 to 5 on their own clocks.
const members: readonly Member[] = [
  {
    data: { kind: "room" },
    id: "orchid",
    title: "Orchid",
    availability: { weekly: [weekdays("08:00", "20:00")] },
  },
  { data: { kind: "room" }, id: "lotus", title: "Lotus" },
  { data: { kind: "person" }, id: "alex", title: "Alex", timeZone: "America/Los_Angeles" },
  { data: { kind: "person" }, id: "lee", title: "Lee", timeZone: "Asia/Kolkata" },
];

const rooms = new Set(members.filter(({ data }) => data.kind === "room").map(({ id }) => id));

const policies = [
  availabilityPolicy<Meeting, string, string>({ mode: "warn" }),
  // A room can't be double-booked; a person can, with a warning.
  conflictPolicy<Meeting, string, string>({
    mode: "warn",
    getResourceMode: (resourceId) => (rooms.has(resourceId) ? "block" : undefined),
  }),
];

// #region status
const Calendar = createCalendar<Meeting, Member>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [
    createTimelineDayView<Meeting, Member>({
      getEventColor: (meeting) => meeting.data.color,
      resourceStatus: true,
    }),
  ],
});
// #endregion status

/** A meeting in progress as the page opens, and two later, so some rooms and people are busy. */
function meetings(now: Temporal.ZonedDateTime): readonly Meeting[] {
  const start = now.round({ roundingIncrement: 15, roundingMode: "floor", smallestUnit: "minute" });
  const meeting = (
    id: string,
    title: string,
    color: CalendarEventColor,
    from: number,
    minutes: number,
    resourceIds: readonly string[],
  ): Meeting => ({
    data: { color },
    end: start.add({ minutes: from + minutes }).toInstant(),
    id,
    kind: "timed",
    resourceIds,
    start: start.add({ minutes: from }).toInstant(),
    title,
  });
  return [
    meeting("review", "Design review", "blue", -30, 75, ["orchid", "alex"]),
    meeting("standup", "Standup", "teal", 75, 30, ["lotus", "lee"]),
    meeting("interview", "Interview", "purple", 150, 60, ["orchid"]),
  ];
}

// The announcer hides itself from view. These put it back, to show what a screen reader hears.
const shown: JSX.CSSProperties = {
  "clip-path": "none",
  height: "auto",
  margin: "0",
  position: "static",
  "white-space": "normal",
  width: "auto",
};

export default function AvailabilityTimelinePage() {
  const now = Temporal.Now.zonedDateTimeISO();
  const [events, setEvents] = createSignal(meetings(now));
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
      availability={{ weekly: [weekdays("09:00", "17:00")] }}
      defaultAnchorDate={now.toPlainDate()}
      defaultTimeZone={now.timeZoneId}
      events={events()}
      locale="en-US"
      onEventChange={save}
      policies={policies}
      resources={members}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <div class="flex min-h-11 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
          <span class="shrink-0 text-xs font-medium text-muted-foreground uppercase">
            Screen reader
          </span>
          <Calendar.Announcer messages={calendarAnnouncements} style={shown} />
        </div>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
