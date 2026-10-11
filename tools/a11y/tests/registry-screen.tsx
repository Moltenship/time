import {
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  type CalendarAnnotation,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

type Fixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

const getEventColor = (event: Fixture) => event.data.color;
const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<Fixture>({ dayView: "day", getEventColor }),
    createDayView<Fixture>({ getEventColor }),
    createMonthView<Fixture>({ getEventColor }),
    createAgendaView<Fixture>({ getEventColor }),
    createResourceColumnsView<Fixture>({ getEventColor }),
  ],
});

export type RegistryView = (typeof Calendar.views)[number]["name"];
export const registryViews: readonly RegistryView[] = [
  "month",
  "week",
  "day",
  "agenda",
  "resources",
];
const viewOptions = registryViews.map((value) => ({ label: value, value }));

const today = Temporal.PlainDate.from("2026-10-08");
const firstMeeting = Temporal.Instant.from("2026-10-08T08:00:00Z");
const firstCall = Temporal.Instant.from("2026-10-05T15:00:00Z");

/**
 * A group of two people and a room, for the resources view; the meetings book them in turn. Grace
 * works from London, so her hours and her header's local time follow its clock.
 */
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "team", title: "Team" },
  { data: null, id: "ada", parentId: "team", title: "Ada" },
  { data: null, id: "grace", parentId: "team", timeZone: "Europe/London", title: "Grace" },
  { data: null, id: "orchid", title: "Orchid" },
];

/** Weekdays 09:00 to 17:00, shaded outside; a closed Friday mutes its day in the month. */
const availability: CalendarAvailability = {
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};
const bookable = ["ada", "grace", "orchid"];

function timed(
  color: CalendarEventColor,
  title: string,
  start: Temporal.Instant,
  minutes: number,
  resourceIds: readonly string[] = [],
) {
  const end = start.add({ minutes });
  return { data: { color }, end, id: title, kind: "timed", resourceIds, start, title } as const;
}

function allDay(color: CalendarEventColor, title: string, start: string, end: string) {
  return {
    data: { color },
    end: Temporal.PlainDate.from(end),
    id: title,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title,
  } as const;
}

/**
 * Every palette colour as a 45-minute block on the anchor day and a 30-minute one across the week,
 * plus all-day bars, one crossing into the next week: enough to fill a month cell and show "+N more".
 */
const events: readonly Fixture[] = [
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} meeting`, firstMeeting.add({ hours: index }), 45, [
      bookable[index % bookable.length]!,
    ]),
  ),
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} call`, firstCall.add({ hours: 24 * (index % 7) }), 30),
  ),
  allDay("teal", "Conference", "2026-10-06", "2026-10-10"),
  allDay("orange", "Holiday", "2026-10-08", "2026-10-09"),
  allDay("purple", "Offsite", "2026-10-10", "2026-10-14"),
];

function NoteIcon({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M9 18V5l12-2v13" />
    </svg>
  );
}

/** Sleep across midnight and a listening session of tracks, so the rail has bars and a dot. */
const annotationSources: readonly TimeGridAnnotationSource[] = [
  { color: "purple", id: "sleep", label: "Sleep" },
  {
    color: "green",
    Icon: NoteIcon,
    id: "music",
    label: "Music",
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
];
const annotations: readonly CalendarAnnotation[] = [
  {
    end: Temporal.Instant.from("2026-10-08T07:00:00Z"),
    id: "night",
    sourceId: "sleep",
    start: Temporal.Instant.from("2026-10-07T23:00:00Z"),
    title: "Sleep",
  },
  ...[0, 4, 8, 12].map((minutes) => ({
    end: firstMeeting.add({ minutes: minutes + 3 }),
    id: `track-${minutes}`,
    sourceId: "music",
    start: firstMeeting.add({ minutes }),
    title: `Track ${minutes / 4 + 1}`,
  })),
  {
    end: Temporal.Instant.from("2026-10-08T15:03:00Z"),
    id: "short",
    sourceId: "music",
    start: Temporal.Instant.from("2026-10-08T15:00:00Z"),
    title: "One track",
  },
  // A dot at the day's very end, which must stay inside the day.
  {
    end: Temporal.Instant.from("2026-10-08T23:59:30Z"),
    id: "late",
    sourceId: "music",
    start: Temporal.Instant.from("2026-10-08T23:59:00Z"),
    title: "Last track",
  },
];

/** A view under the toolbar, beside a mini month whose selected date is not today. */
export function RegistryScreen({
  annotations: annotationData = annotations,
  dir,
  view,
}: {
  readonly annotations?: readonly CalendarAnnotation[];
  readonly dir?: "ltr" | "rtl";
  readonly view: RegistryView;
}) {
  return (
    <TooltipProvider>
      <Calendar.Root
        annotationSources={annotationSources}
        annotations={annotationData}
        availability={availability}
        defaultAnchorDate={today}
        defaultExpandedResourceIds={["team"]}
        defaultTimeZone="UTC"
        defaultView={view}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh" dir={dir}>
          <aside className="w-64 shrink-0 border-e p-3">
            <MiniMonth
              locale="en-US"
              onSelectDate={() => {}}
              selectedDate={today.add({ days: 1 })}
              today={today}
              visibleRange={plainDateInterval(today.subtract({ days: 3 }), today.add({ days: 4 }))}
              weekStartsOn={1}
            />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <CalendarToolbar calendar={Calendar} className="border-b">
              <ViewSwitcher onValueChange={() => {}} options={viewOptions} value={view} />
            </CalendarToolbar>
            <Calendar.Viewport className="min-h-0 flex-1">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </main>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
