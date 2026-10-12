"use client";

// #region calendar
import { createCalendar, defineEventAdapter, weekRange } from "@moltenship/calendar";
import { keepPreviousData, usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
import { Button } from "@/components/ui/button";

import type { ApiEvent, EventsApi } from "./query-api";
import { eventsQuery, eventsWindow, shiftWindow, useSaveEvent, writeOf } from "./query-events";

/** Reads the API's records as they are, so the cache can keep plain JSON. */
export const eventAdapter = defineEventAdapter<ApiEvent>()({
  getId: (event) => event.id,
  getTitle: (event) => event.title,
  getInterval: (event) =>
    event.allDay
      ? {
          kind: "all-day",
          start: Temporal.PlainDate.from(event.start),
          end: Temporal.PlainDate.from(event.end),
        }
      : {
          kind: "timed",
          start: Temporal.Instant.from(event.start),
          end: Temporal.Instant.from(event.end),
        },
  getResourceIds: () => [],
});

const getEventColor = (event: ApiEvent) => event.color;

export const Calendar = createCalendar<ApiEvent>()({
  eventAdapter,
  views: [
    createWeekView<ApiEvent>({ dayView: "day", getEventColor }),
    createDayView<ApiEvent>({ getEventColor }),
    createMonthView<ApiEvent>({ getEventColor }),
  ],
});
// #endregion calendar

const viewLabels = { day: "Day", month: "Month", week: "Week" };
const viewOptions = Calendar.views.map(({ name }) => ({ label: viewLabels[name], value: name }));

function CalendarViewSwitcher() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const { setView } = Calendar.useCalendarActions();
  return <ViewSwitcher onValueChange={setView} options={viewOptions} value={view} />;
}

/** A spinner while any request for the dates on screen is on its way. */
function LoadingIndicator({ loading }: { readonly loading: boolean }) {
  return (
    <span
      aria-hidden={!loading}
      className="flex items-center gap-2 text-sm text-muted-foreground transition-opacity data-idle:opacity-0"
      data-idle={loading ? undefined : ""}
    >
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      <span className="max-sm:sr-only">Loading</span>
    </span>
  );
}

// #region root
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
const noEvents: readonly ApiEvent[] = [];

export interface EventsCalendarProps {
  readonly api: EventsApi;
  readonly timeZone: string;
}

export function EventsCalendar({ api, timeZone }: EventsCalendarProps) {
  const [today] = useState(() => Temporal.Now.plainDateISO(timeZone));
  // The calendar reports its dates after its first render, so start from the week it opens on.
  const [loadRange, setLoadRange] = useState(() =>
    weekRange(today, { weekStartsOn: weekRules.firstDay }),
  );
  const dates = useMemo(() => eventsWindow(loadRange, timeZone), [loadRange, timeZone]);

  // Until the next window loads, keep the last one's events on screen.
  const events = useQuery({ ...eventsQuery(api, dates), placeholderData: keepPreviousData });
  // Load the windows either side too, so the next or previous month shows at once.
  usePrefetchQuery(eventsQuery(api, shiftWindow(dates, -1)));
  usePrefetchQuery(eventsQuery(api, shiftWindow(dates, 1)));
  const saveEvent = useSaveEvent(api);

  return (
    <Calendar.Root
      events={events.data ?? noEvents}
      onVisibleRangeChange={(range) => setLoadRange(range.loadRange)}
      // The change shows as pending until the save settles, and rolls back if it fails.
      onEventChange={async (change) => {
        await saveEvent.mutateAsync(writeOf(change));
      }}
      defaultAnchorDate={today}
      timeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <CalendarToolbar calendar={Calendar} className="border-b">
          <LoadingIndicator loading={events.isFetching} />
          <CalendarViewSwitcher />
        </CalendarToolbar>
        {saveEvent.isError ? (
          // No live role: the calendar's announcer already says the change was undone.
          <div className="flex items-center gap-3 border-b px-4 py-2 text-sm">
            Couldn't save the change, so it was undone.
            <Button className="ms-auto" onClick={saveEvent.reset} size="sm" variant="outline">
              Dismiss
            </Button>
          </div>
        ) : events.isError ? (
          <div className="flex items-center gap-3 border-b px-4 py-2 text-sm" role="alert">
            Couldn't load events.
            <Button className="ms-auto" onClick={() => void events.refetch()} size="sm">
              Try again
            </Button>
          </div>
        ) : null}
        <Calendar.Viewport aria-busy={events.isFetching} className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <Calendar.Announcer messages={calendarAnnouncements} />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion root
