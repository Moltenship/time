// #region map
// app/team/feed-events.ts
import { getEventEnd, type IcsCalendar, type IcsDateValue, type IcsEvent } from "@moltenship/ics";

import type { CalendarEventColor } from "@/components/calendar/event-colors";

/** A feed event as plain JSON, ready to pass from a Server Component to a Client Component. */
export interface FeedEventJson {
  readonly id: string;
  readonly title: string;
  readonly color: CalendarEventColor;
  readonly kind: "timed" | "all-day";
  /** An instant, such as "2026-10-12T07:00:00Z", or a date for an all-day event. */
  readonly start: string;
  readonly end: string;
}

// The calendar needs an end after the start; ICS allows events that take no time.
const minimumLength = { minutes: 30 };

/** The zone for floating and unresolved times: the feed's X-WR-TIMEZONE, else the viewer's. */
export function feedTimeZone(calendar: IcsCalendar, viewerTimeZone: string): string {
  return calendar.timeZone ?? viewerTimeZone;
}

function toInstant(value: IcsDateValue, timeZone: string): Temporal.Instant {
  switch (value.kind) {
    case "utc":
      return value.instant;
    case "zoned":
      return value.zoned.toInstant();
    case "date":
      return value.date.toZonedDateTime(timeZone).toInstant();
    case "floating":
    case "unresolved":
      return value.wallTime.toZonedDateTime(timeZone).toInstant();
  }
}

/** One event for the calendar, or `undefined` for a cancelled one. */
export function toFeedEvent(event: IcsEvent, timeZone: string): FeedEventJson | undefined {
  if (event.status === "CANCELLED") return undefined;

  const end = getEventEnd(event); // DTEND, else DTSTART + DURATION, in the start's kind
  let times: Pick<FeedEventJson, "kind" | "start" | "end">;
  if (event.start.kind === "date") {
    const start = event.start.date;
    const endDate = end.kind === "date" ? end.date : start;
    const isAfter = Temporal.PlainDate.compare(endDate, start) > 0;
    times = {
      kind: "all-day",
      start: start.toString(),
      end: (isAfter ? endDate : start.add({ days: 1 })).toString(),
    };
  } else {
    const start = toInstant(event.start, timeZone);
    // A DTEND in UTC or a time zone keeps its instant, even after a floating start.
    const absoluteEnd = event.end?.kind === "utc" || event.end?.kind === "zoned";
    const endInstant = toInstant(absoluteEnd ? event.end! : end, timeZone);
    const isAfter = Temporal.Instant.compare(endInstant, start) > 0;
    times = {
      kind: "timed",
      start: start.toString(),
      end: (isAfter ? endInstant : start.add(minimumLength)).toString(),
    };
  }

  return {
    // An override (RECURRENCE-ID) shares its series' UID, so its start keeps the ID unique.
    id: event.recurrenceId === undefined ? event.uid : `${event.uid}/${times.start}`,
    title: event.summary ?? "Busy",
    // Free time (TRANSP:TRANSPARENT) and tentative events are gray, the rest blue.
    color: event.transparency === "TRANSPARENT" || event.status === "TENTATIVE" ? "gray" : "blue",
    ...times,
  };
}

/** Every event of a parsed calendar, ready for the client. */
export function toFeedEvents(
  calendar: IcsCalendar,
  viewerTimeZone: string,
): readonly FeedEventJson[] {
  const timeZone = feedTimeZone(calendar, viewerTimeZone);
  return calendar.events.flatMap((event) => toFeedEvent(event, timeZone) ?? []);
}
// #endregion map
