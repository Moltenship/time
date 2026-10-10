import { createCalendar, defineEventAdapter, type CalendarResource } from "@moltenship/calendar";
import { useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import {
  ResourceHeaderIcon,
  ResourceHeaderTitle,
  ResourceHeaderToggle,
  type ResourceHeaderProps,
} from "@registry/resource-columns-view/resource-header";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";
import { Avatar, AvatarFallback, AvatarImage } from "@registry/ui/avatar";
import { TooltipProvider } from "@registry/ui/tooltip";

import { applyPreviewChange, createPreviewEvents, type PreviewEvent } from "./events";

type PreviewResource = CalendarResource<
  { readonly kind: "room" | "team" } | { readonly avatar: string; readonly kind: "person" }
>;

const person = (id: string, parentId: string, title: string): PreviewResource => ({
  data: { avatar: `/avatars/${id}.svg`, kind: "person" },
  id,
  parentId,
  title,
});

/** Three rooms, then two teams of people. */
const resources: readonly PreviewResource[] = [
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "room" }, id: "lotus", title: "Lotus" },
  { data: { kind: "room" }, id: "cedar", title: "Cedar" },
  { data: { kind: "team" }, id: "design", title: "Design" },
  person("maya", "design", "Maya"),
  person("alex", "design", "Alex"),
  { data: { kind: "team" }, id: "engineering", title: "Engineering" },
  person("sam", "engineering", "Sam"),
  person("lee", "engineering", "Lee"),
  person("jordan", "engineering", "Jordan"),
];

/** Lucide's door-open, drawn here so the docs don't depend on the icon set. */
function DoorOpenIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M10 21H2" />
      <path d="M10 3H7a2 2 0 00-2 2v16" />
      <path d="M14 12h.01" />
      <path d="M19 21V5a2 2 0 00-1.675-1.974l-6.163-1.013A1 1 0 0010 3v18a1 1 0 001.124.992z" />
      <path d="M22 21h-3" />
    </svg>
  );
}

/** People show their avatar and rooms a door; teams keep just their chevron. */
function ResourceHeader({ resource, title }: ResourceHeaderProps<PreviewResource>) {
  return (
    <>
      <ResourceHeaderToggle />
      {resource?.data.kind === "person" && (
        <ResourceHeaderIcon>
          <Avatar size="sm">
            <AvatarImage alt="" src={resource.data.avatar} />
            <AvatarFallback>{title.slice(0, 1)}</AvatarFallback>
          </Avatar>
        </ResourceHeaderIcon>
      )}
      {resource?.data.kind === "room" && (
        <ResourceHeaderIcon className="size-6 justify-center rounded-md bg-muted text-muted-foreground">
          <DoorOpenIcon className="size-3.5" />
        </ResourceHeaderIcon>
      )}
      <ResourceHeaderTitle />
    </>
  );
}

/** The rooms and people each work event books, by title; personal events book none. */
const bookings: Readonly<Record<string, readonly string[]>> = {
  "1:1 with Maya": ["lotus", "maya", "sam"],
  "Acme kickoff (New York)": ["sam"],
  "Deploy window": ["lotus", "jordan"],
  "Design review": ["orchid", "maya", "alex"],
  "Focus time": ["lee"],
  "On-call handover": ["sam", "jordan"],
  "Quarterly planning": ["cedar"],
  "Release freeze": ["engineering"],
  "Release retro": ["cedar", "engineering"],
  "Roadmap review": ["orchid"],
  "Sprint planning": ["cedar", "engineering"],
  Standup: ["orchid"],
  "Team lunch": ["design", "engineering"],
  "Weekly planning": ["cedar", "sam", "lee"],
};

const noResourceIds: readonly string[] = [];
const getEventColor = (event: PreviewEvent) => event.color;

const Calendar = createCalendar<PreviewEvent, PreviewResource>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [
    createResourceColumnsView<PreviewEvent, PreviewResource>({ getEventColor, ResourceHeader }),
    createTimelineWeekView<PreviewEvent>({ getEventColor }),
    createTimelineDayView<PreviewEvent>({ getEventColor }),
  ],
});

/** A resource view over this week's bookings in the visitor's time zone. */
export default function ResourceCalendar({
  view = "resources",
}: {
  readonly view?: (typeof Calendar.views)[number]["name"];
}) {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState<readonly PreviewEvent[]>(() =>
    createPreviewEvents(now).map((event) => {
      const resourceIds = bookings[event.title];
      return resourceIds === undefined ? event : { ...event, resourceIds };
    }),
  );

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        defaultAnchorDate={now.toPlainDate()}
        defaultExpandedResourceIds={["design", "engineering"]}
        defaultTimeZone={now.timeZoneId}
        defaultView={view}
        events={events}
        locale="en-US"
        onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b" />
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
