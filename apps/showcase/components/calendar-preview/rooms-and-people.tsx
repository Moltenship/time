import {
  conflictPolicy,
  createCalendar,
  defineEventAdapter,
  type CalendarResource,
  type CalendarTransactionResult,
  type ConflictMode,
  type OverlapLayout,
} from "@moltenship/calendar";
import { useMemo, useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "@registry/resource-timeline-view/resource-timeline-view";
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
const rooms = new Set(spaces.filter(({ data }) => data.kind === "room").map(({ id }) => id));

/** In a timeline, `"columns"` and `"equal"` are the same lanes. */
const timelineLayouts = [
  { label: "Lanes", value: "columns" },
  { label: "Stack", value: "stack" },
] as const satisfies readonly { readonly label: string; readonly value: OverlapLayout }[];

const conflictModes = [
  { label: "Block", value: "block" },
  { label: "Warn", value: "warn" },
  { label: "Allow", value: "allow" },
] as const satisfies readonly { readonly label: string; readonly value: ConflictMode }[];

const noResourceIds: readonly string[] = [];
const getEventColor = (event: PreviewEvent) => event.color;

const Calendar = createCalendar<PreviewEvent, Space>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [
    createResourceColumnsView<PreviewEvent, Space>({ getEventColor }),
    createTimelineDayView<PreviewEvent, Space>({ getEventColor }),
  ],
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

/** What happened to the last change, in words. */
function describeResult(result: CalendarTransactionResult<PreviewEvent, string, string>): string {
  const title = result.change?.event?.title ?? "The new event";
  if (result.status === "rejected") {
    return result.reason === "resource-conflict"
      ? `${title} wasn't saved: it would be double-booked.`
      : `${title} wasn't saved.`;
  }
  return result.change.warnings?.includes("resource-conflict")
    ? `${title} was saved, flagged as double-booked.`
    : `${title} was saved.`;
}

/**
 * Two rooms and two people over tomorrow, so it opens at 08:00, as resource columns or a timeline
 * of the day. With `rules="layout"`, a toggle picks each kind's overlap layout; with
 * `rules="conflicts"`, rooms stack and people sit side by side, and a toggle picks what
 * double-booking each kind does. Edits stay in memory.
 */
export default function RoomsAndPeopleCalendar({
  rules = "layout",
  view = "resources",
}: {
  readonly rules?: "conflicts" | "layout";
  readonly view?: "resources" | "timeline-day";
}) {
  const [day] = useState(() => Temporal.Now.zonedDateTimeISO().add({ days: 1 }).startOfDay());
  const [events, setEvents] = useState(() => createRoomBookings(day));
  const [roomLayout, setRoomLayout] = useState<OverlapLayout>("stack");
  const [peopleLayout, setPeopleLayout] = useState<OverlapLayout>("columns");
  const [roomMode, setRoomMode] = useState<ConflictMode>("block");
  const [peopleMode, setPeopleMode] = useState<ConflictMode>("warn");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const resourceOptions = useMemo(
    () => ({
      getResourceOverlapLayout: (resource: Space) =>
        resource.data.kind === "room" ? roomLayout : peopleLayout,
    }),
    [peopleLayout, roomLayout],
  );
  const policies = useMemo(
    () =>
      rules === "conflicts"
        ? [
            conflictPolicy<PreviewEvent, string, string>({
              getResourceMode: (resourceId) => (rooms.has(resourceId) ? roomMode : peopleMode),
            }),
          ]
        : undefined,
    [peopleMode, roomMode, rules],
  );

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        defaultAnchorDate={day.toPlainDate()}
        defaultTimeZone={day.timeZoneId}
        defaultView={view}
        events={events}
        locale="en-US"
        onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
        onEventChangeResult={
          rules === "conflicts" ? (result) => setLastResult(describeResult(result)) : undefined
        }
        policies={policies}
        resources={spaces}
        viewOptions={{ resources: resourceOptions, "timeline-day": resourceOptions }}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
            {rules === "layout" ? (
              <>
                <ChoiceToggle
                  label="Rooms"
                  onChange={setRoomLayout}
                  options={view === "resources" ? overlapLayouts : timelineLayouts}
                  value={roomLayout}
                />
                <ChoiceToggle
                  label="People"
                  onChange={setPeopleLayout}
                  options={view === "resources" ? overlapLayouts : timelineLayouts}
                  value={peopleLayout}
                />
              </>
            ) : (
              <>
                <ChoiceToggle
                  label="Rooms"
                  onChange={(mode) => {
                    setRoomMode(mode);
                    setLastResult(null);
                  }}
                  options={conflictModes}
                  value={roomMode}
                />
                <ChoiceToggle
                  label="People"
                  onChange={(mode) => {
                    setPeopleMode(mode);
                    setLastResult(null);
                  }}
                  options={conflictModes}
                  value={peopleMode}
                />
                <p
                  data-slot="rooms-preview-outcome"
                  className="min-h-5 basis-full text-sm text-fd-muted-foreground"
                >
                  {lastResult ?? "Drag a booking onto another in the same room or person."}
                </p>
              </>
            )}
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
