"use client";

// The page the install test adds to each clean app after `shadcn add calendar-full`. It imports
// every item the way the docs do, so the apps' typecheck and build cover all of them. Imports
// from `@/components/calendar/` follow the app's own `components` alias.

import { createCalendar, defineEventAdapter, type CalendarResource } from "@moltenship/calendar";
import { useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createAgendaView } from "@/components/calendar/list-view/agenda-view";
import { MiniMonth } from "@/components/calendar/mini-month";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { useRecurrenceScopePrompt } from "@/components/calendar/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { createResourceColumnsView } from "@/components/calendar/resource-columns-view/resource-columns-view";
import { createTimelineWeekView } from "@/components/calendar/resource-timeline-view/resource-timeline-view";
import { createScrollingAgendaView } from "@/components/calendar/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@/components/calendar/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "@/components/calendar/scrolling-time-grid-view/scrolling-time-grid-view";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
import { createYearView } from "@/components/calendar/year-view/year-view";

interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly color: CalendarEventColor;
  readonly roomId: string;
}

type Room = CalendarResource<{ readonly seats: number }>;

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: (meeting) => [meeting.roomId],
});

const options = { getEventColor: (meeting: Meeting) => meeting.color };

const Calendar = createCalendar<Meeting, Room>()({
  eventAdapter,
  views: [
    createWeekView<Meeting>({ ...options, dayView: "day" }),
    createDayView<Meeting>(options),
    createMonthView<Meeting>(options),
    createYearView<Meeting>(options),
    createAgendaView<Meeting>(options),
    createResourceColumnsView<Meeting>(options),
    createTimelineWeekView<Meeting>(options),
    createScrollingWeekView<Meeting>({ ...options, dayView: "scrolling-day" }),
    createScrollingDayView<Meeting>(options),
    createScrollingMonthView<Meeting>(options),
    createScrollingAgendaView<Meeting>(options),
  ],
});

const rooms: readonly Room[] = [
  { id: "atlas", title: "Atlas", data: { seats: 8 } },
  { id: "borealis", title: "Borealis", data: { seats: 4 } },
];

const meetings: readonly Meeting[] = [
  {
    id: "standup",
    title: "Standup",
    start: Temporal.Instant.from("2026-10-08T07:00:00Z"),
    end: Temporal.Instant.from("2026-10-08T07:15:00Z"),
    color: "blue",
    roomId: "atlas",
  },
  {
    id: "review",
    title: "Design review",
    start: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    end: Temporal.Instant.from("2026-10-08T14:00:00Z"),
    color: "purple",
    roomId: "borealis",
  },
];

const anchorDate = Temporal.PlainDate.from("2026-10-08");
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const viewOptions = Calendar.views.map(({ name }) => ({ value: name, label: name }));

function CalendarViewSwitcher() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const { setView } = Calendar.useCalendarActions();
  return <ViewSwitcher value={view} onValueChange={setView} options={viewOptions} />;
}

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const { ask, dialog } = useRecurrenceScopePrompt();

  return (
    <TooltipProvider>
      <MiniMonth
        locale="en-US"
        onSelectDate={setSelectedDate}
        selectedDate={selectedDate}
        today={anchorDate}
        weekStartsOn={1}
      />
      <Calendar.Root
        events={meetings}
        resources={rooms}
        anchorDate={selectedDate}
        onAnchorDateChange={setSelectedDate}
        now={Temporal.Instant.from("2026-10-08T10:00:00Z")}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
        onEventChange={async () => {
          if ((await ask({ eventTitle: "Standup" })) === null) {
            throw new DOMException("Cancelled", "AbortError");
          }
        }}
      >
        <Calendar.Frame className="flex h-[640px] flex-col">
          <CalendarToolbar calendar={Calendar}>
            <CalendarViewSwitcher />
          </CalendarToolbar>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Root>
      {dialog}
    </TooltipProvider>
  );
}
