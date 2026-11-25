// The Week and day page's annotations and working hours, after `shadcn add` of the Solid time
// grid. The registry's install test adds this file to a clean Solid app, whose typecheck and build
// cover it.

import type { CalendarAnnotation, CalendarAvailability } from "@moltenship/calendar-solid";

import type { TimeGridAnnotationSource } from "@/components/calendar/time-grid-view/time-grid-annotations";

import { Calendar, type Event } from "./week-page";

// #region sources
function MoonIcon(props: { readonly class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MusicIcon(props: { readonly class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

const sources: readonly TimeGridAnnotationSource[] = [
  { id: "sleep", label: "Sleep", color: "purple", Icon: MoonIcon },
  {
    id: "music",
    label: "Music",
    color: "green",
    Icon: MusicIcon,
    // Tracks less than five minutes apart draw as one listening session.
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
];
// #endregion sources

const annotation = (
  id: string,
  sourceId: string,
  title: string,
  start: string,
  end: string,
): CalendarAnnotation => ({
  id,
  sourceId,
  start: Temporal.Instant.from(start),
  end: Temporal.Instant.from(end),
  title,
});

const annotations: readonly CalendarAnnotation[] = [
  annotation("tue-night", "sleep", "Sleep", "2026-10-06T23:00:00Z", "2026-10-07T07:00:00Z"),
  annotation("wed-night", "sleep", "Sleep", "2026-10-07T23:30:00Z", "2026-10-08T06:45:00Z"),
  annotation("p1", "music", "Nightcall · Kavinsky", "2026-10-08T08:00:00Z", "2026-10-08T08:04:00Z"),
  annotation("p2", "music", "Genesis · Justice", "2026-10-08T08:05:00Z", "2026-10-08T08:09:00Z"),
  annotation("p3", "music", "Intro · The xx", "2026-10-08T12:15:00Z", "2026-10-08T12:17:00Z"),
];

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
    data: { color: "orange" },
    end: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    id: "lunch",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T12:00:00Z"),
    title: "Lunch",
  },
  {
    data: { color: "teal" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "conference",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Conference",
  },
  {
    data: { color: "pink" },
    end: Temporal.PlainDate.from("2026-10-07"),
    id: "birthday",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-06"),
    title: "Ana's birthday",
  },
];

// #region root
const time = (value: string) => Temporal.PlainTime.from(value);

// Weekdays 9 to 5; the weekend is closed.
const officeHours: CalendarAvailability = {
  weekly: [{ days: [1, 2, 3, 4, 5], start: time("09:00"), end: time("17:00") }],
};

export default function WeekAnnotations() {
  return (
    <Calendar.Root
      annotationSources={sources}
      annotations={annotations}
      availability={officeHours}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion root
