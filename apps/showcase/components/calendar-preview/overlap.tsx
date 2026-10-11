import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  timeGridStrategy,
  type OverlapLayout,
} from "@moltenship/calendar";
import { useId, useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { TimeGridView, type TimeGridViewOptions } from "@registry/time-grid-view/time-grid-view";

import { applyPreviewChange, type PreviewEvent, type PreviewEventChange } from "./events";

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

export const overlapLayouts = [
  { label: "Columns", value: "columns" },
  { label: "Equal", value: "equal" },
  { label: "Stack", value: "stack" },
] as const satisfies readonly { readonly label: string; readonly value: OverlapLayout }[];

type Booking = readonly [CalendarEventColor, string, string, Temporal.DurationLike];

/**
 * From the first day: a workshop with talks across it, meetings that start together, and a run
 * of meetings that each overrun into the next.
 */
const bookings: readonly (readonly Booking[])[] = [
  [
    ["orange", "Workshop", "09:00", { hours: 3 }],
    ["blue", "Keynote recap", "09:30", { hours: 1 }],
    ["green", "Coffee chat", "10:00", { minutes: 45 }],
    ["gray", "Lunch", "12:00", { hours: 1 }],
  ],
  [
    ["blue", "Design review", "10:00", { hours: 1 }],
    ["purple", "Hiring sync", "10:00", { hours: 1 }],
    ["green", "1:1 with Maya", "10:00", { minutes: 30 }],
    ["orange", "Planning", "10:30", { hours: 1, minutes: 30 }],
  ],
  [
    ["teal", "Customer call", "09:00", { hours: 1 }],
    ["blue", "Sprint review", "09:45", { hours: 1 }],
    ["purple", "Retro", "10:30", { hours: 1 }],
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
 * the overlap layouts. Edits stay in memory.
 */
export default function OverlapCalendar() {
  const [first] = useState(() => Temporal.Now.zonedDateTimeISO().add({ days: 1 }).startOfDay());
  const [events, setEvents] = useState(() => createBusyDays(first));
  const [overlapLayout, setOverlapLayout] = useState<OverlapLayout>("columns");
  const labelId = useId();

  const changeEvent = (change: PreviewEventChange) =>
    setEvents((current) => applyPreviewChange(current, change));

  return (
    <Calendar.Root
      defaultAnchorDate={first.toPlainDate()}
      defaultTimeZone={first.timeZoneId}
      events={events}
      locale="en-US"
      onEventChange={changeEvent}
      viewOptions={{ "busy-days": { overlapLayout } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <span className="font-mono text-sm" id={labelId}>
            overlapLayout
          </span>
          <ToggleGroup
            aria-labelledby={labelId}
            className="flex gap-1 rounded-full bg-fd-muted p-1"
            onValueChange={([next]) => {
              if (next !== undefined) setOverlapLayout(next);
            }}
            value={[overlapLayout]}
          >
            {overlapLayouts.map(({ label, value }) => (
              <Toggle
                key={value}
                className="rounded-full px-3 py-1 text-sm text-fd-foreground transition-colors outline-none hover:bg-fd-background/60 focus-visible:ring-2 focus-visible:ring-fd-ring data-pressed:bg-fd-background data-pressed:font-medium data-pressed:shadow-sm"
                value={value}
              >
                {label}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
