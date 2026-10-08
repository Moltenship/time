import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  timeGridStrategy,
} from "@moltenship/calendar";
import { useState, useSyncExternalStore } from "react";

import { MiniMonth } from "@registry/calendar/mini-month";
import {
  createWeekView,
  TimeGridView,
  type TimeGridViewOptions,
} from "@registry/time-grid-view/time-grid-view";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

import {
  applyLandingChange,
  createLandingEvents,
  type LandingEvent,
  type LandingEventChange,
} from "./events";
import { calendarCaptionClass, calendarFrameClass } from "./frame";

const locale = "en-US";
const noResourceIds: readonly never[] = [];
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const viewOptions: TimeGridViewOptions<LandingEvent> = { getEventColor: (event) => event.color };

// Phones get three columns; the registry renderer draws any time-grid span.
const threeDayView = defineCalendarView({
  defaultOptions: viewOptions,
  name: "3-day",
  strategy: timeGridStrategy<TimeGridViewOptions<LandingEvent>, LandingEvent>({
    count: 3,
    kind: "days",
  }),
  Renderer: TimeGridView<LandingEvent>,
});

const Calendar = createCalendar<LandingEvent, never>()({
  eventAdapter: defineEventAdapter<LandingEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: () => noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: [createWeekView<LandingEvent>(viewOptions), threeDayView],
});

const wideQuery = "(min-width: 640px)";

function subscribeToWidth(onChange: () => void) {
  const query = matchMedia(wideQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isWide = () => matchMedia(wideQuery).matches;

const iconButtonClass =
  "grid size-8 place-items-center rounded-full text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground";

function Toolbar() {
  return (
    <Calendar.Toolbar className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Calendar.TodayTrigger className="h-8 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-fd-accent">
        Today
      </Calendar.TodayTrigger>
      <span className="flex">
        <Calendar.PreviousTrigger aria-label="Previous period" className={iconButtonClass}>
          <ChevronLeftIcon />
        </Calendar.PreviousTrigger>
        <Calendar.NextTrigger aria-label="Next period" className={iconButtonClass}>
          <ChevronRightIcon />
        </Calendar.NextTrigger>
      </span>
      <Calendar.Title className="min-w-0 truncate text-base font-medium sm:text-lg" />
    </Calendar.Toolbar>
  );
}

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

export default function LiveCalendar() {
  const [timeZone] = useState(() => Temporal.Now.timeZoneId());
  const [today] = useState(() => Temporal.Now.plainDateISO(timeZone));
  const [events, setEvents] = useState(() => createLandingEvents(today, timeZone));
  const wide = useSyncExternalStore(subscribeToWidth, isWide);

  // Edits stay in this tab: the landing has no backend, so a change applies as soon as it lands.
  const changeEvent = (change: LandingEventChange) =>
    setEvents((current) => applyLandingChange(current, change));

  return (
    <div>
      <Calendar.Root
        defaultAnchorDate={today}
        defaultTimeZone={timeZone}
        events={events}
        locale={locale}
        onEventChange={changeEvent}
        view={wide ? "week" : "3-day"}
        weekRules={weekRules}
      >
        <Calendar.Frame className={calendarFrameClass}>
          <Toolbar />
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-64 shrink-0 border-r p-3 lg:block">
              <Sidebar today={today} />
            </aside>
            <Calendar.Viewport className="min-w-0 flex-1">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </div>
        </Calendar.Frame>
      </Calendar.Root>
      <p className={calendarCaptionClass}>
        Live in your time zone, {timeZone}. Drag to move, resize or create events.
      </p>
    </div>
  );
}
