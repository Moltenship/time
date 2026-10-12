// #region feed
// app/team/recurring-feed-calendar.tsx
"use client";

import { createCalendar, weekRange, type PlainDateInterval } from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  recurringEventsFromIcs,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import { parseIcs, type IcsEvent } from "@moltenship/ics";
import { useMemo, useState } from "react";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

type FeedEvent = RecurringCalendarEvent<IcsEvent>;
type FeedOccurrence = RecurrenceOccurrence<FeedEvent, string>;

const adapters = createCanonicalRecurrenceAdapter<IcsEvent>();

const Calendar = createCalendar<FeedOccurrence>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [createWeekView<FeedOccurrence>()],
});

/** The feed's VEVENTs as series masters, overrides and one-off events. */
export function readRecurringFeed(text: string): readonly FeedEvent[] {
  const { calendars } = parseIcs(text);
  return calendars.flatMap((calendar) => {
    // UTC times on all-day and floating series, such as an UNTIL, read in the feed's zone.
    const { events, issues } = recurringEventsFromIcs(calendar.events, {
      timeZone: calendar.timeZone,
    });
    for (const issue of issues) console.warn(`${issue.event.uid}: ${issue.message}`);
    return events;
  });
}

const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

interface RecurringFeedCalendarProps {
  /** The feed's ICS text, which the server fetched. */
  readonly text: string;
  readonly now: string;
  readonly timeZone: string;
}

export function RecurringFeedCalendar({ text, now, timeZone }: RecurringFeedCalendarProps) {
  const nowInstant = Temporal.Instant.from(now);
  const today = nowInstant.toZonedDateTimeISO(timeZone).toPlainDate();
  const events = useMemo(() => readRecurringFeed(text), [text]);
  const [expander] = useState(() => createOccurrenceExpander(adapters));
  const [range, setRange] = useState<PlainDateInterval>(() =>
    weekRange(today, { weekStartsOn: weekRules.firstDay }),
  );
  const { occurrences } = useMemo(
    () => expander.expand(events, { range, timeZone }),
    [expander, events, range, timeZone],
  );

  return (
    <Calendar.Root
      events={occurrences}
      onVisibleRangeChange={({ loadRange }) => setRange(loadRange)}
      now={nowInstant}
      defaultAnchorDate={today}
      defaultTimeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-[640px] flex-col rounded-xl border">
        <CalendarToolbar calendar={Calendar} />
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion feed
