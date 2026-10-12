// #region client
// app/team/feed-calendar.tsx
"use client";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import { useMemo } from "react";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

import type { FeedEventJson } from "./feed-events";

export type FeedEvent = {
  readonly id: string;
  readonly title: string;
  readonly color: CalendarEventColor;
} & (
  | { readonly kind: "timed"; readonly start: Temporal.Instant; readonly end: Temporal.Instant }
  | {
      readonly kind: "all-day";
      readonly start: Temporal.PlainDate;
      readonly end: Temporal.PlainDate;
    }
);

/** Turns the strings from the server back into Temporal values. */
export function fromFeedJson({ kind, start, end, ...event }: FeedEventJson): FeedEvent {
  return kind === "timed"
    ? { ...event, kind, start: Temporal.Instant.from(start), end: Temporal.Instant.from(end) }
    : { ...event, kind, start: Temporal.PlainDate.from(start), end: Temporal.PlainDate.from(end) };
}

const Calendar = createCalendar<FeedEvent>()({
  eventAdapter: defineEventAdapter<FeedEvent>()({
    getId: (event) => event.id,
    getTitle: (event) => event.title,
    // A FeedEvent is already an interval: its kind, start and end.
    getInterval: (event) => event,
    getResourceIds: () => [],
  }),
  views: [createWeekView<FeedEvent>({ getEventColor: (event) => event.color })],
});

const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

interface FeedCalendarProps {
  readonly events: readonly FeedEventJson[];
  readonly now: string;
  readonly timeZone: string;
}

export function FeedCalendar({ events, now, timeZone }: FeedCalendarProps) {
  const feedEvents = useMemo(() => events.map(fromFeedJson), [events]);
  const nowInstant = Temporal.Instant.from(now);

  return (
    <Calendar.Root
      events={feedEvents}
      now={nowInstant}
      defaultAnchorDate={nowInstant.toZonedDateTimeISO(timeZone).toPlainDate()}
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
// #endregion client
