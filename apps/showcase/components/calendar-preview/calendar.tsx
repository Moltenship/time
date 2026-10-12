import {
  availabilityPolicy,
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  scrollingTimeGridStrategy,
  timeGridStrategy,
} from "@moltenship/calendar";
import { useState, useSyncExternalStore, type CSSProperties } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
  ScrollingTimeGridView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import {
  createDayView,
  createWeekView,
  TimeGridView,
  type TimeGridViewOptions,
} from "@registry/time-grid-view/time-grid-view";
import { Button } from "@registry/ui/button";
import { TooltipProvider } from "@registry/ui/tooltip";
import { createYearView } from "@registry/year-view/year-view";

import { createPreviewAnnotations, previewAnnotationSources } from "./annotations";
import { previewAvailability } from "./availability";
import {
  applyPreviewChange,
  createPreviewEvents,
  type PreviewEvent,
  type PreviewEventChange,
} from "./events";
import { useLongRangeEvents } from "./long-range";

export type PreviewView =
  | "week"
  | "day"
  | "month"
  | "year"
  | "agenda"
  | "scrolling-week"
  | "scrolling-3-day"
  | "scrolling-day"
  | "scrolling-month"
  | "scrolling-agenda";

export interface LiveCalendarProps {
  /** Add a week of sample annotations: sleep, listening sessions and workouts. */
  readonly annotations?: boolean;
  /** Show what a screen reader hears in a strip under the calendar. */
  readonly announcements?: boolean;
  /** Add office hours, shaded, that warn about changes outside them. */
  readonly availability?: boolean;
  /**
   * A year of events either way of today, fetched from a pretend server as the view scrolls, in
   * place of the seeded weeks.
   */
  readonly longRange?: boolean;
  /** Show the registry mini month beside the view on large screens. */
  readonly sidebar?: boolean;
  /** Add a view switcher for the week, day, month, year and agenda views. */
  readonly switcher?: boolean;
  readonly view: PreviewView;
}

const locale = "en-US";
const noResourceIds: readonly never[] = [];
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const getEventColor = (event: PreviewEvent) => event.color;
const timeGridOptions: TimeGridViewOptions<PreviewEvent> = { dayView: "day", getEventColor };
/** Changes outside working hours are saved, flagged, and announced as outside them. */
const availabilityPolicies = [availabilityPolicy<PreviewEvent, string, never>({ mode: "warn" })];

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

// Three days at a time, swiping to the next three.
const scrollingThreeDayView = defineCalendarView({
  defaultOptions: { dayView: "scrolling-day", getEventColor },
  name: "scrolling-3-day",
  strategy: scrollingTimeGridStrategy<TimeGridViewOptions<PreviewEvent>, PreviewEvent>({
    count: 3,
    kind: "days",
  }),
  Renderer: ScrollingTimeGridView<PreviewEvent>,
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
    createYearView<PreviewEvent>({ getEventColor }),
    createAgendaView<PreviewEvent>({ getEventColor }),
    createScrollingWeekView<PreviewEvent>({ dayView: "scrolling-day", getEventColor }),
    scrollingThreeDayView,
    createScrollingDayView<PreviewEvent>({ getEventColor }),
    createScrollingMonthView<PreviewEvent>({ dayView: "scrolling-day", getEventColor }),
    createScrollingAgendaView<PreviewEvent>({ dayView: "scrolling-day", getEventColor }),
  ],
});

const viewLabels: Record<PreviewView, string> = {
  week: "Week",
  day: "Day",
  month: "Month",
  year: "Year",
  agenda: "Agenda",
  "scrolling-week": "Week",
  "scrolling-3-day": "3 days",
  "scrolling-day": "Day",
  "scrolling-month": "Month",
  "scrolling-agenda": "Agenda",
};
const viewOptions = (["week", "day", "month", "year", "agenda"] as const).map((value) => ({
  label: viewLabels[value],
  value,
}));

/** Undoes the announcer's visually hidden style, so the transcript strip can show it. */
const shownAnnouncer: CSSProperties = {
  clipPath: "none",
  height: "auto",
  margin: 0,
  position: "static",
  whiteSpace: "normal",
  width: "auto",
};

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

/** Events from another preview, such as a parsed ICS feed, in place of the seeded ones. */
export interface LiveCalendarEvents {
  readonly events?: readonly PreviewEvent[];
}

/** The registry views over seeded events in the visitor's time zone; edits stay in memory. */
export default function LiveCalendar({
  annotations = false,
  announcements = false,
  availability = false,
  events: givenEvents,
  longRange = false,
  sidebar = false,
  switcher = false,
  view,
}: LiveCalendarProps & LiveCalendarEvents) {
  const [now] = useState(() => Temporal.Now.zonedDateTimeISO());
  const [seeded, setSeeded] = useState(() => givenEvents ?? createPreviewEvents(now));
  const fetched = useLongRangeEvents(now);
  const [events, setEvents] = longRange ? [fetched.events, fetched.setEvents] : [seeded, setSeeded];
  const [sampleAnnotations] = useState(() => (annotations ? createPreviewAnnotations(now) : []));
  const today = now.toPlainDate();
  const [activeView, setActiveView] = useState<PreviewView>(view);
  const wide = useSyncExternalStore(subscribeToWidth, isWide);

  const changeEvent = (change: PreviewEventChange) =>
    setEvents((current) => applyPreviewChange(current, change));

  return (
    <TooltipProvider delay={400}>
      <Calendar.Root
        annotationSources={annotations ? previewAnnotationSources : undefined}
        annotations={sampleAnnotations}
        availability={availability ? previewAvailability(today) : undefined}
        defaultAnchorDate={today}
        defaultTimeZone={now.timeZoneId}
        events={events}
        locale={locale}
        onEventChange={changeEvent}
        onViewChange={(next) => setActiveView(next === "3-day" ? "week" : next)}
        onVisibleRangeChange={longRange ? fetched.load : undefined}
        policies={availability ? availabilityPolicies : undefined}
        view={activeView === "week" && !wide ? "3-day" : activeView}
        viewOptions={longRange ? { "scrolling-agenda": { loading: fetched.loading } } : undefined}
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
            ) : activeView === view ? null : (
              // Dates open the day view, so a single-view preview needs a way back to its view.
              <Button
                className="rounded-full"
                onClick={() => setActiveView(view)}
                size="sm"
                variant="outline"
              >
                Back to {viewLabels[view].toLowerCase()}
              </Button>
            )}
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
          {announcements ? (
            <div className="flex min-h-11 shrink-0 items-center gap-3 border-t px-4 py-2 text-sm">
              <span className="shrink-0 text-xs font-medium text-fd-muted-foreground uppercase">
                Screen reader
              </span>
              <Calendar.Announcer messages={calendarAnnouncements} style={shownAnnouncer} />
            </div>
          ) : (
            <Calendar.Announcer messages={calendarAnnouncements} />
          )}
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}
