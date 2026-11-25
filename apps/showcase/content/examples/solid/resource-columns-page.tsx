// The Resource columns page's calendar and page, after `shadcn add` of the Solid resource columns.
// The registry's install test adds this file to a clean Solid app, whose typecheck and build cover
// it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarResource,
} from "@moltenship/calendar-solid";
import { createSignal, Show } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import {
  ResourceHeaderIcon,
  ResourceHeaderTitle,
  ResourceHeaderToggle,
  type ResourceHeaderProps,
} from "@/components/calendar/resource-columns-view/resource-header";
import { createResourceColumnsView } from "@/components/calendar/resource-columns-view/resource-columns-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;
export type Resource = CalendarResource<{ readonly kind: "person" | "room" | "team" }>;

/** The chevron, a person's initial in a circle, and the name. */
function ResourceHeader(props: ResourceHeaderProps<Resource>) {
  return (
    <>
      <ResourceHeaderToggle />
      <Show when={props.resource?.data.kind === "person"}>
        <ResourceHeaderIcon class="size-6 justify-center rounded-full bg-muted text-xs font-medium">
          {props.title.slice(0, 1)}
        </ResourceHeaderIcon>
      </Show>
      <ResourceHeaderTitle />
    </>
  );
}

export const Calendar = createCalendar<Event, Resource>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [
    createResourceColumnsView<Event, Resource>({
      getEventColor: (event) => event.data.color,
      // A room's bookings stack; a person's meetings sit side by side.
      getResourceOverlapLayout: (resource) => (resource.data.kind === "room" ? "stack" : undefined),
      ResourceHeader,
    }),
  ],
});
// #endregion view

// #region resources
const resources: readonly Resource[] = [
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "room" }, id: "lotus", title: "Lotus" },
  { data: { kind: "team" }, id: "design", title: "Design" },
  { data: { kind: "person" }, id: "maya", parentId: "design", title: "Maya" },
  { data: { kind: "person" }, id: "alex", parentId: "design", title: "Alex" },
];

const seed: readonly Event[] = [
  {
    data: { color: "blue" },
    end: Temporal.Instant.from("2026-10-08T11:30:00Z"),
    id: "design-review",
    kind: "timed",
    // In the room and with both people: it shows in each of their columns.
    resourceIds: ["orchid", "maya", "alex"],
    start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
    title: "Design review",
  },
  {
    data: { color: "teal" },
    end: Temporal.Instant.from("2026-10-08T14:00:00Z"),
    id: "interview",
    kind: "timed",
    resourceIds: ["lotus", "maya"],
    start: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    title: "Interview",
  },
  {
    data: { color: "purple" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "offsite",
    kind: "all-day",
    resourceIds: ["alex"],
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Offsite",
  },
];
// #endregion resources

// #region page
export default function ResourceColumnsPage() {
  const [events, setEvents] = createSignal<readonly Event[]>(seed);
  // A drag or a key proposes a change, with the resources it lands in; saving it moves the event.
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
      defaultExpandedResourceIds={["design"]}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={events()}
      locale="en-US"
      onEventChange={save}
      resources={resources}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {/* The columns scroll both ways inside the viewport; the header and gutter follow them. */}
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
