// The Scrolling views page's agenda, after `shadcn add` of the Solid scrolling agenda. It loads
// events from a pretend server as it scrolls. The registry's install test adds this file to a
// clean Solid app, whose typecheck and build cover it.

// #region view
import {
  createCalendar,
  createCanonicalEventAdapter,
  iteratePlainDates,
  plainDateInterval,
  type CalendarEvent,
  type CalendarVisibleRange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createScrollingAgendaView } from "@/components/calendar/scrolling-list-view/scrolling-agenda-view";

export type Event = CalendarEvent<{ readonly color: CalendarEventColor }>;

export const Calendar = createCalendar<Event>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }>(),
  views: [createScrollingAgendaView<Event>({ getEventColor: (event) => event.data.color })],
});
// #endregion view

const timeZone = "UTC";

/** A pretend server: a standup each weekday and a review every other Thursday, after a pause. */
async function loadEvents(from: Temporal.PlainDate, to: Temporal.PlainDate): Promise<Event[]> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const at = (date: Temporal.PlainDate, time: string) =>
    date.toZonedDateTime({ plainTime: time, timeZone }).toInstant();
  return [...iteratePlainDates(plainDateInterval(from, to))].flatMap((date): Event[] => {
    if (date.dayOfWeek > 5) return [];
    const standup: Event = {
      data: { color: "blue" },
      end: at(date, "09:15"),
      id: `standup-${date.toString()}`,
      kind: "timed",
      start: at(date, "09:00"),
      title: "Standup",
    };
    const review: Event = {
      data: { color: "teal" },
      end: at(date, "15:00"),
      id: `review-${date.toString()}`,
      kind: "timed",
      start: at(date, "14:00"),
      title: "Design review",
    };
    const weekNumber = Math.floor(date.since("2026-01-01").days / 7);
    return date.dayOfWeek === 4 && weekNumber % 2 === 0 ? [standup, review] : [standup];
  });
}

// #region loading
/**
 * Fetches events for the dates the agenda lists, each date once, as it scrolls, and says so while
 * some are still on their way.
 */
export default function ScrollingAgendaPage() {
  const [loaded, setLoaded] = createSignal<ReadonlyMap<string, Event>>(new Map());
  const [fetching, setFetching] = createSignal(0);
  const requested = new Set<string>();

  const load = ({ loadRange }: CalendarVisibleRange) => {
    const missing = [...iteratePlainDates(loadRange)].filter(
      (date) => !requested.has(date.toString()),
    );
    if (missing.length === 0) return;
    for (const date of missing) requested.add(date.toString());
    setFetching((count) => count + 1);
    void loadEvents(missing[0]!, missing.at(-1)!.add({ days: 1 }))
      .then((arrived) =>
        setLoaded((current) => new Map([...current, ...arrived.map((e) => [e.id, e] as const)])),
      )
      .finally(() => setFetching((count) => count - 1));
  };

  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone={timeZone}
      events={[...loaded().values()]}
      locale="en-US"
      onVisibleRangeChange={load}
      viewOptions={{ "scrolling-agenda": { loading: fetching() > 0 } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <h1 class="p-4 text-lg font-semibold">
          <Calendar.Title />
        </h1>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion loading
