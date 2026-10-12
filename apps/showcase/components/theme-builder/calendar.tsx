import { availabilityPolicy, createCalendar, defineEventAdapter } from "@moltenship/calendar";
import { useState } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { previewAvailability } from "@/components/calendar-preview/availability";
import {
  applyPreviewChange,
  createPreviewEvents,
  type PreviewEvent,
} from "@/components/calendar-preview/events";

export type ThemeCalendarView = "week" | "day" | "month" | "agenda";

const locale = "en-US";
const noResourceIds: readonly never[] = [];
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const getEventColor = (event: PreviewEvent) => event.color;
/** Work meetings in the time grids use the default event tokens, so their controls show here. */
const plain = new Set(["Standup", "Weekly planning", "Sprint planning", "Quarterly planning"]);
const getTimeGridColor = (event: PreviewEvent) =>
  plain.has(event.title) ? undefined : event.color;
const policies = [availabilityPolicy<PreviewEvent, string, never>({ mode: "warn" })];

const Calendar = createCalendar<PreviewEvent, never>()({
  eventAdapter: defineEventAdapter<PreviewEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: () => noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [
    createWeekView<PreviewEvent>({ dayView: "day", getEventColor: getTimeGridColor }),
    createDayView<PreviewEvent>({ getEventColor: getTimeGridColor }),
    // The month and agenda views take a palette color for every event.
    createMonthView<PreviewEvent>({ getEventColor }),
    createAgendaView<PreviewEvent>({ getEventColor }),
  ],
});

/** A color per title, so this week shows every color of the palette. */
const colors: Readonly<Record<string, CalendarEventColor>> = {
  "1:1 with Maya": "teal",
  "Acme kickoff (New York)": "blue",
  "Book club": "orange",
  "Brunch with parents": "pink",
  Climbing: "green",
  "Deploy window": "orange",
  Dentist: "red",
  "Design review": "purple",
  "Focus time": "yellow",
  "Mom's birthday": "pink",
  "Release freeze": "red",
  "Release retro": "purple",
  "Team lunch": "green",
};

const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;

/** The mini month: today, the anchor date, and the visible week in the selection colour. */
function Sidebar({ today }: { readonly today: Temporal.PlainDate }) {
  const anchorDate = Calendar.useCalendarSelector(selectAnchorDate);
  const visibleRange = Calendar.useVisibleRange();
  const { setAnchorDate } = Calendar.useCalendarActions();

  return (
    <MiniMonth
      locale={locale}
      onSelectDate={setAnchorDate}
      selectedDate={anchorDate}
      today={today}
      visibleRange={visibleRange ?? undefined}
      weekStartsOn={weekRules.firstDay}
    />
  );
}

/**
 * This week in the visitor's time zone, in every palette color and the default event tokens, with
 * office hours shaded and a holiday on Friday. The mini month shows beside the view when the frame
 * is wide enough. Edits stay in memory.
 */
export default function ThemeCalendar({
  onViewChange,
  view,
}: {
  readonly onViewChange: (view: ThemeCalendarView) => void;
  readonly view: ThemeCalendarView;
}) {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState<readonly PreviewEvent[]>(() =>
    createPreviewEvents(now).map((event) => ({
      ...event,
      color: colors[event.title] ?? event.color,
    })),
  );
  const today = now.toPlainDate();

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        availability={previewAvailability(today)}
        defaultAnchorDate={today}
        defaultTimeZone={now.timeZoneId}
        events={events}
        locale={locale}
        onEventChange={(change) => setEvents((current) => applyPreviewChange(current, change))}
        onViewChange={onViewChange}
        policies={policies}
        view={view}
        weekRules={weekRules}
      >
        <Calendar.Frame className="@container flex h-full flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b" />
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-56 shrink-0 border-e p-3 @2xl:block">
              <Sidebar today={today} />
            </aside>
            <Calendar.Viewport className="min-w-0 flex-1">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </div>
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
