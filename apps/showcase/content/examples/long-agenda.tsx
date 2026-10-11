"use client";

import { createCalendar, iteratePlainDates, type CalendarVisibleRange } from "@moltenship/calendar";
import { useCallback, useMemo, useRef, useState } from "react";

import { createScrollingAgendaView } from "@/components/calendar/scrolling-list-view/scrolling-agenda-view";

import { eventAdapter, weekRules, type Meeting } from "./quick-start";

export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [createScrollingAgendaView<Meeting>({ getEventColor: (meeting) => meeting.color })],
});

// #region loading
const timeZone = "Europe/Berlin";

/**
 * Fetches meetings for the dates the agenda lists, each date once, as it scrolls, and says so
 * while some are still on their way.
 */
export function LongAgenda({
  loadMeetings,
}: {
  readonly loadMeetings: (from: Temporal.Instant, to: Temporal.Instant) => Promise<Meeting[]>;
}) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, Meeting>>(new Map());
  const [fetching, setFetching] = useState(0);
  const requested = useRef(new Set<string>());
  const meetings = useMemo(() => [...loaded.values()], [loaded]);

  const load = useCallback(
    ({ loadRange }: CalendarVisibleRange) => {
      const missing = [...iteratePlainDates(loadRange)].filter(
        (date) => !requested.current.has(date.toString()),
      );
      if (missing.length === 0) return;
      for (const date of missing) requested.current.add(date.toString());
      const from = missing[0]!.toZonedDateTime(timeZone).toInstant();
      const to = missing.at(-1)!.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
      setFetching((count) => count + 1);
      void loadMeetings(from, to)
        .then((arrived) =>
          setLoaded((current) => new Map([...current, ...arrived.map((m) => [m.id, m] as const)])),
        )
        .finally(() => setFetching((count) => count - 1));
    },
    [loadMeetings],
  );

  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.Now.plainDateISO(timeZone)}
      onVisibleRangeChange={load}
      timeZone={timeZone}
      locale="en-US"
      viewOptions={{ "scrolling-agenda": { loading: fetching > 0 } }}
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion loading
