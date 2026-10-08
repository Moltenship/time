import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  timeGridStrategy,
} from "@moltenship/calendar";
import { useState, useSyncExternalStore } from "react";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import {
  createDayView,
  createWeekView,
  TimeGridView,
  type TimeGridViewOptions,
} from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import {
  applyPreviewChange,
  createPreviewEvents,
  type PreviewEvent,
  type PreviewEventChange,
} from "./events";

export type PreviewView = "week" | "day" | "month" | "agenda";

export interface LiveCalendarProps {
  /** Show the registry mini month beside the view on large screens. */
  readonly sidebar?: boolean;
  /** Add a view switcher for all four views. */
  readonly switcher?: boolean;
  readonly view: PreviewView;
}

const locale = "en-US";
const noResourceIds: readonly never[] = [];
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const getEventColor = (event: PreviewEvent) => event.color;
const timeGridOptions: TimeGridViewOptions<PreviewEvent> = { dayView: "day", getEventColor };

// Narrow screens show the week as three columns; the registry renderer draws any time-grid span.
const threeDayView = defineCalendarView({
  defaultOptions: timeGridOptions,
  name: "3-day",
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
  views: [
    createWeekView<PreviewEvent>(timeGridOptions),
    threeDayView,
    createDayView<PreviewEvent>({ getEventColor }),
    createMonthView<PreviewEvent>({ getEventColor }),
    createAgendaView<PreviewEvent>({ getEventColor }),
  ],
});

const viewOptions = [
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
  { label: "Month", value: "month" },
  { label: "Agenda", value: "agenda" },
] as const;

const wideQuery = "(min-width: 640px)";

function subscribeToWidth(onChange: () => void) {
  const query = matchMedia(wideQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isWide = () => matchMedia(wideQuery).matches;

const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;

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

/** The registry views over seeded events in the visitor's time zone; edits stay in memory. */
export default function LiveCalendar({
  sidebar = false,
  switcher = false,
  view,
}: LiveCalendarProps) {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [events, setEvents] = useState(() => createPreviewEvents(now));
  const today = now.toPlainDate();
  const [activeView, setActiveView] = useState<PreviewView>(view);
  const wide = useSyncExternalStore(subscribeToWidth, isWide);

  const changeEvent = (change: PreviewEventChange) =>
    setEvents((current) => applyPreviewChange(current, change));

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        defaultAnchorDate={today}
        defaultTimeZone={now.timeZoneId}
        events={events}
        locale={locale}
        onEventChange={changeEvent}
        onViewChange={(next) => setActiveView(next === "3-day" ? "week" : next)}
        view={activeView === "week" && !wide ? "3-day" : activeView}
        weekRules={weekRules}
      >
        <Calendar.Frame className="flex h-full flex-col">
          <CalendarToolbar calendar={Calendar} className="border-b">
            {switcher ? (
              <ViewSwitcher
                onValueChange={setActiveView}
                options={viewOptions}
                value={activeView}
              />
            ) : null}
          </CalendarToolbar>
          <div className="flex min-h-0 flex-1">
            {sidebar ? (
              <aside className="hidden w-64 shrink-0 border-r p-3 lg:block">
                <Sidebar today={today} />
              </aside>
            ) : null}
            <Calendar.Viewport className="min-w-0 flex-1">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </div>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
