import {
  createCalendar,
  defineEventAdapter,
  type CalendarResource,
  type OverlapLayout,
} from "@moltenship/calendar";
import { useMemo, useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { applyPreviewChange, type PreviewEvent } from "./events";
import { ChoiceToggle, overlapLayouts } from "./layout-toggle";

type Space = CalendarResource<{ readonly kind: "person" | "room" }>;

const spaces: readonly Space[] = [
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "room" }, id: "lotus", title: "Lotus" },
  { data: { kind: "person" }, id: "maya", title: "Maya" },
  { data: { kind: "person" }, id: "sam", title: "Sam" },
];

const noResourceIds: readonly string[] = [];
const getEventColor = (event: PreviewEvent) => event.color;

const Calendar = createCalendar<PreviewEvent, Space>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [createResourceColumnsView<PreviewEvent, Space>({ getEventColor })],
});

type Booking = readonly [
  CalendarEventColor,
  string,
  string,
  Temporal.DurationLike,
  readonly string[],
];

/** A morning that double-books both rooms and both people, and a lunch that runs over. */
const bookings: readonly Booking[] = [
  ["blue", "Design review", "09:00", { hours: 1, minutes: 30 }, ["orchid", "maya"]],
  ["orange", "Sprint planning", "09:00", { hours: 2 }, ["lotus", "sam"]],
  ["teal", "Pairing", "09:15", { hours: 1 }, ["sam"]],
  ["green", "Standup", "09:30", { minutes: 30 }, ["orchid", "sam"]],
  ["purple", "Interview", "10:00", { hours: 1 }, ["orchid", "maya"]],
  ["pink", "Roadmap", "10:30", { hours: 1 }, ["lotus", "maya"]],
  ["yellow", "Lunch and learn", "12:00", { hours: 1 }, ["lotus", "maya", "sam"]],
  ["red", "Customer call", "12:30", { hours: 1 }, ["orchid", "sam"]],
];

/** The bookings on `day`, at wall-clock times in its time zone. */
export function createRoomBookings(day: Temporal.ZonedDateTime): readonly PreviewEvent[] {
  return bookings.map(([color, title, time, duration, resourceIds], index) => {
    const start = day.withPlainTime(Temporal.PlainTime.from(time));
    return {
      color,
      end: start.add(duration).toInstant(),
      id: `booking-${index}`,
      kind: "timed",
      resourceIds,
      start: start.toInstant(),
      title,
    } as const;
  });
}

/**
 * Two rooms and two people over tomorrow, so it opens at 08:00, with a layout for each kind of
 * resource. Edits stay in memory.
 */
export default function RoomsAndPeopleCalendar() {
  const [day] = useState(() => Temporal.Now.zonedDateTimeISO().add({ days: 1 }).startOfDay());
  const [events, setEvents] = useState(() => createRoomBookings(day));
  const [rooms, setRooms] = useState<OverlapLayout>("stack");
  const [people, setPeople] = useState<OverlapLayout>("columns");
  const resourceOptions = useMemo(
    () => ({
      getResourceOverlapLayout: (resource: Space) =>
        resource.data.kind === "room" ? rooms : people,
    }),
    [people, rooms],
  );

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        defaultAnchorDate={day.toPlainDate()}
        defaultTimeZone={day.timeZoneId}
        events={events}
        locale="en-US"
        onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
        resources={spaces}
        viewOptions={{ resources: resourceOptions }}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
            <ChoiceToggle
              label="Rooms"
              onChange={setRooms}
              options={overlapLayouts}
              value={rooms}
            />
            <ChoiceToggle
              label="People"
              onChange={setPeople}
              options={overlapLayouts}
              value={people}
            />
          </div>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
