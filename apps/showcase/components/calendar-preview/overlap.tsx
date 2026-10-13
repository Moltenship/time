import { Toggle } from "@base-ui/react/toggle";
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  timeGridStrategy,
  type OverlapLayout,
} from "@moltenship/calendar";
import { useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { TimeGridView, type TimeGridViewOptions } from "@registry/time-grid-view/time-grid-view";

import { applyPreviewChange, type PreviewEvent, type PreviewEventChange } from "./events";
import { ChoiceToggle, overlapLayouts } from "./layout-toggle";

const noResourceIds: readonly never[] = [];
const getEventColor = (event: PreviewEvent) => event.color;

// Three busy days, laid out by whichever overlap layout the toggle picks.
const busyDays = defineCalendarView({
  defaultOptions: { getEventColor },
  name: "busy-days",
  strategy: timeGridStrategy<TimeGridViewOptions<PreviewEvent>, PreviewEvent>({
    count: 3,
    kind: "days",
  }),
  Renderer: TimeGridView<PreviewEvent>,
});

const Calendar = createCalendar<PreviewEvent, never>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: () => noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [busyDays],
});

/** Purple is the focus time calendar, which can stack on its own. */
const stackFocusTime = (event: PreviewEvent) => (event.color === "purple" ? "stack" : undefined);

type Booking = readonly [CalendarEventColor, string, string, Temporal.DurationLike];

/**
 * From the first day: a workshop with talks across it and an afternoon of focus time, meetings
 * that start together around a focus block, and a run of meetings that each overrun into the next.
 */
const bookings: readonly (readonly Booking[])[] = [
  [
    ["orange", "Workshop", "09:00", { hours: 3 }],
    ["blue", "Keynote recap", "09:30", { hours: 1 }],
    ["green", "Coffee chat", "10:00", { minutes: 45 }],
    ["gray", "Lunch", "12:00", { hours: 1 }],
    ["purple", "Deep work", "13:00", { hours: 2 }],
    ["purple", "Writing", "13:30", { hours: 1 }],
    ["purple", "Reading", "14:00", { minutes: 45 }],
  ],
  [
    ["blue", "Design review", "10:00", { hours: 1 }],
    ["purple", "Focus block", "10:00", { hours: 1 }],
    ["green", "1:1 with Maya", "10:00", { minutes: 30 }],
    ["orange", "Planning", "10:30", { hours: 1, minutes: 30 }],
  ],
  [
    ["teal", "Customer call", "09:00", { hours: 1 }],
    ["blue", "Sprint review", "09:45", { hours: 1 }],
    ["pink", "Retro", "10:30", { hours: 1 }],
    ["orange", "Demo prep", "11:15", { minutes: 45 }],
  ],
];

/** The bookings over the three days from `first`, at wall-clock times in its time zone. */
export function createBusyDays(first: Temporal.ZonedDateTime): readonly PreviewEvent[] {
  return bookings.flatMap((day, index) =>
    day.map(([color, title, time, duration], position) => {
      const start = first.add({ days: index }).withPlainTime(Temporal.PlainTime.from(time));
      return {
        color,
        end: start.add(duration).toInstant(),
        id: `busy-${index}-${position}`,
        kind: "timed",
        start: start.toInstant(),
        title,
      } as const;
    }),
  );
}

/**
 * The time grid over three busy days, from tomorrow so it opens at 08:00, with a toggle between
 * the overlap layouts and one that stacks the focus time calendar. Edits stay in memory.
 */
export default function OverlapCalendar() {
  const [first] = useState(() => Temporal.Now.zonedDateTimeISO().add({ days: 1 }).startOfDay());
  const [events, setEvents] = useState(() => createBusyDays(first));
  const [overlapLayout, setOverlapLayout] = useState<OverlapLayout>("columns");
  const [focusStacks, setFocusStacks] = useState(false);

  const changeEvent = (change: PreviewEventChange) =>
    setEvents((current) => applyPreviewChange(current, change));

  return (
    <Calendar.Root
      defaultAnchorDate={first.toPlainDate()}
      defaultTimeZone={first.timeZoneId}
      events={events}
      locale="en-US"
      onEventChange={changeEvent}
      viewOptions={{
        "busy-days": {
          getEventOverlapLayout: focusStacks ? stackFocusTime : undefined,
          overlapLayout,
        },
      }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
          <ChoiceToggle
            label={<span className="font-mono">overlapLayout</span>}
            onChange={setOverlapLayout}
            options={overlapLayouts}
            value={overlapLayout}
          />
          <Toggle
            className="rounded-full border px-3 py-1 text-sm text-fd-foreground transition-colors outline-none hover:bg-fd-muted focus-visible:ring-2 focus-visible:ring-fd-ring data-pressed:border-transparent data-pressed:bg-fd-primary data-pressed:text-fd-primary-foreground"
            onPressedChange={setFocusStacks}
            pressed={focusStacks}
          >
            Stack focus time
          </Toggle>
        </div>
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
