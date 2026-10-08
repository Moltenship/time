// #region calendar
"use client";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createAgendaView } from "@/components/calendar/list-view/agenda-view";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";
import { ViewSwitcher } from "@/components/calendar/view-switcher";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly color: CalendarEventColor;
}

export const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: () => [],
});

const getEventColor = (meeting: Meeting) => meeting.color;

export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [
    createWeekView<Meeting>({ dayView: "day", getEventColor }),
    createDayView<Meeting>({ getEventColor }),
    createMonthView<Meeting>({ getEventColor }),
    createAgendaView<Meeting>({ getEventColor }),
  ],
});
// #endregion calendar

// #region root
const viewLabels = { week: "Week", day: "Day", month: "Month", agenda: "Agenda" };
const viewSwitcherOptions = Calendar.views.map(({ name }) => ({
  value: name,
  label: viewLabels[name],
}));

function CalendarViewSwitcher() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const { setView } = Calendar.useCalendarActions();
  return <ViewSwitcher value={view} onValueChange={setView} options={viewSwitcherOptions} />;
}

export const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

export function TeamCalendar({ meetings }: { readonly meetings: readonly Meeting[] }) {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-[640px] flex-col rounded-xl border">
        <CalendarToolbar calendar={Calendar}>
          <CalendarViewSwitcher />
        </CalendarToolbar>
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion root

// #region data
function meeting(
  id: string,
  title: string,
  start: string,
  end: string,
  color: CalendarEventColor,
): Meeting {
  return {
    id,
    title,
    start: Temporal.Instant.from(start),
    end: Temporal.Instant.from(end),
    color,
  };
}

export const meetings: readonly Meeting[] = [
  meeting("standup", "Standup", "2026-10-08T07:00:00Z", "2026-10-08T07:15:00Z", "blue"),
  meeting("review", "Design review", "2026-10-08T13:00:00Z", "2026-10-08T14:00:00Z", "purple"),
  meeting("planning", "Sprint planning", "2026-10-05T08:00:00Z", "2026-10-05T09:30:00Z", "green"),
  meeting("lunch", "Team lunch", "2026-10-07T10:30:00Z", "2026-10-07T11:30:00Z", "orange"),
  meeting("one-on-one", "1:1 with Sam", "2026-10-09T12:00:00Z", "2026-10-09T12:30:00Z", "teal"),
];
// #endregion data
