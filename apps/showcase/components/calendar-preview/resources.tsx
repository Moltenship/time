import {
  availabilityPolicy,
  createCalendar,
  defineEventAdapter,
  type CalendarResource,
} from "@moltenship/calendar";
import { useState, type CSSProperties } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import {
  ResourceHeaderIcon,
  ResourceHeaderStatus,
  ResourceHeaderTime,
  ResourceHeaderTitle,
  ResourceHeaderToggle,
  useResourceHeader,
  type ResourceHeaderProps,
} from "@registry/resource-columns-view/resource-header";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";
import { Avatar, AvatarFallback, AvatarImage } from "@registry/ui/avatar";
import { TooltipProvider } from "@registry/ui/tooltip";

import { hours, previewAvailability } from "./availability";
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
  const { status } = useResourceHeader();
  return (
    <>
      <ResourceHeaderToggle />
      {/* In a narrow column with a status, the badge needs the icon's room more. */}
      {resource?.data.kind === "person" && (
        <ResourceHeaderIcon className={status ? "@max-[11rem]:hidden" : undefined}>
          <Avatar size="sm">
            <AvatarImage alt="" src={resource.data.avatar} />
            <AvatarFallback>{title.slice(0, 1)}</AvatarFallback>
          </Avatar>
        </ResourceHeaderIcon>
      )}
      {resource?.data.kind === "room" && (
        <ResourceHeaderIcon
          className={`size-6 justify-center rounded-md bg-muted text-muted-foreground ${status ? "@max-[11rem]:hidden" : ""}`}
        >
          <DoorOpenIcon className="size-3.5" />
        </ResourceHeaderIcon>
      )}
      <span className="flex min-w-0 flex-col">
        <ResourceHeaderTitle />
        {status ? (
          <span className="flex min-w-0 items-center gap-1">
            {/* The badge keeps its words and the local time gives way after it, out of sight in
                a narrow column; the name still reads the time first. */}
            <ResourceHeaderTime className="order-last min-w-0 shrink @max-[11rem]:sr-only" />
            <ResourceHeaderStatus />
          </span>
        ) : (
          <ResourceHeaderTime />
        )}
      </span>
    </>
  );
}

/** Rooms' closed time in a cool tint; people's keeps the default. */
const tintRooms: UnavailableTimeRender = (props, { resource }) =>
  (resource?.data as PreviewResource["data"] | undefined)?.kind === "room" ? (
    <div
      {...props}
      style={
        {
          ...props.style,
          "--calendar-unavailable": "color-mix(in oklch, var(--color-sky-500) 14%, transparent)",
        } as CSSProperties
      }
    />
  ) : (
    <div {...props} />
  );
const statusOptions = { renderUnavailable: tintRooms, resourceStatus: true } as const;

/** Meetings in progress as the page opens, and one later, so some rooms and people are busy. */
function busyNow(now: Temporal.ZonedDateTime): readonly PreviewEvent[] {
  const start = now.round({ roundingIncrement: 15, roundingMode: "floor", smallestUnit: "minute" });
  const meeting = (id: string, title: string, from: number, minutes: number, ids: string[]) =>
    ({
      color: "blue",
      end: start.add({ minutes: from + minutes }).toInstant(),
      id,
      kind: "timed",
      resourceIds: ids,
      start: start.add({ minutes: from }).toInstant(),
      title,
    }) as const;
  return [
    meeting("busy-workshop", "Client workshop", -30, 90, ["orchid", "maya"]),
    meeting("busy-pairing", "Pairing session", -15, 60, ["sam", "jordan"]),
    meeting("busy-interview", "Candidate chat", 60, 45, ["lotus", "alex"]),
  ];
}

/**
 * Hours for the rooms and people whose hours differ from the office's, with Alex in Los Angeles
 * and Lee in Bengaluru.
 */
function withHours(resource: PreviewResource): PreviewResource {
  switch (resource.id) {
    case "orchid":
      return { ...resource, availability: { weekly: [hours([1, 2, 3, 4, 5], "08:00", "20:00")] } };
    case "sam":
      return { ...resource, availability: { weekly: [hours([1, 2, 3, 4, 5], "08:00", "16:00")] } };
    case "alex":
      return { ...resource, timeZone: "America/Los_Angeles" };
    case "lee":
      return { ...resource, timeZone: "Asia/Kolkata" };
    default:
      return resource;
  }
}

const resourcesWithHours = resources.map(withHours);
/** Changes outside working hours are saved, flagged, and announced as outside them. */
const availabilityPolicies = [availabilityPolicy<PreviewEvent, string, string>({ mode: "warn" })];

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

/**
 * A resource view over this week's bookings in the visitor's time zone; with `availability`, the
 * office's hours and the people's own, two of them in other time zones.
 */
export default function ResourceCalendar({
  availability = false,
  status = false,
  view = "resources",
}: {
  readonly availability?: boolean;
  /** Status badges, a tint for rooms' closed time, and meetings in progress now. */
  readonly status?: boolean;
  readonly view?: (typeof Calendar.views)[number]["name"];
}) {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState<readonly PreviewEvent[]>(() => [
    ...createPreviewEvents(now).map((event) => {
      const resourceIds = bookings[event.title];
      return resourceIds === undefined ? event : { ...event, resourceIds };
    }),
    ...(status ? busyNow(now) : []),
  ]);

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        availability={availability ? previewAvailability(now.toPlainDate()) : undefined}
        defaultAnchorDate={now.toPlainDate()}
        defaultExpandedResourceIds={["design", "engineering"]}
        defaultTimeZone={now.timeZoneId}
        defaultView={view}
        events={events}
        locale="en-US"
        onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
        policies={availability ? availabilityPolicies : undefined}
        resources={availability ? resourcesWithHours : resources}
        viewOptions={
          status
            ? {
                resources: statusOptions,
                "timeline-day": statusOptions,
                "timeline-week": statusOptions,
              }
            : undefined
        }
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
