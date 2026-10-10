import { createCalendar, defineEventAdapter, type CalendarResource } from "@moltenship/calendar";
import { useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { applyPreviewChange, createPreviewEvents, type PreviewEvent } from "./events";

/** Three rooms, then two teams of people. */
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "orchid", title: "Orchid" },
  { data: null, id: "lotus", title: "Lotus" },
  { data: null, id: "cedar", title: "Cedar" },
  { data: null, id: "design", title: "Design" },
  { data: null, id: "maya", parentId: "design", title: "Maya" },
  { data: null, id: "alex", parentId: "design", title: "Alex" },
  { data: null, id: "engineering", title: "Engineering" },
  { data: null, id: "sam", parentId: "engineering", title: "Sam" },
  { data: null, id: "lee", parentId: "engineering", title: "Lee" },
  { data: null, id: "jordan", parentId: "engineering", title: "Jordan" },
];

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

const Calendar = createCalendar<PreviewEvent, CalendarResource<null>>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [createResourceColumnsView<PreviewEvent>({ getEventColor })],
});

/** The resource columns view over today's bookings in the visitor's time zone. */
export default function ResourceCalendar() {
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
