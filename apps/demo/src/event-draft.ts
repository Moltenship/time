import type { DemoEvent } from "./calendar";
import type { DemoCalendarId } from "./calendars";

/**
 * The editable form of an event, in wall-clock fields of the display time zone. All-day end dates
 * are inclusive here, as people read them; events store them exclusive. Times are kept while
 * all-day is on, so switching it off restores them.
 */
export interface EventDraft {
  readonly allDay: boolean;
  readonly calendarId: DemoCalendarId;
  readonly description: string;
  readonly endDate: Temporal.PlainDate;
  readonly endTime: Temporal.PlainTime;
  /** Set when editing an existing event. */
  readonly id?: string;
  readonly startDate: Temporal.PlainDate;
  readonly startTime: Temporal.PlainTime;
  readonly title: string;
}

export type EventDraftResult = { readonly event: DemoEvent } | { readonly error: string };

const defaultStartTime = Temporal.PlainTime.from("09:00");

export function draftFromEvent(event: DemoEvent, timeZone: string): EventDraft {
  const base = {
    calendarId: event.calendarId,
    description: event.description ?? "",
    id: event.id,
    title: event.title,
  };
  if (event.kind === "all-day") {
    return {
      ...base,
      allDay: true,
      endDate: event.end.subtract({ days: 1 }),
      endTime: defaultStartTime.add({ hours: 1 }),
      startDate: event.start,
      startTime: defaultStartTime,
    };
  }
  const start = event.start.toZonedDateTimeISO(timeZone);
  const end = event.end.toZonedDateTimeISO(timeZone);
  return {
    ...base,
    allDay: false,
    endDate: end.toPlainDate(),
    endTime: end.toPlainTime(),
    startDate: start.toPlainDate(),
    startTime: start.toPlainTime(),
  };
}

/** Where "Create" starts an hour-long event: the next half hour today, otherwise 09:00. */
export function draftForNewEvent(
  date: Temporal.PlainDate,
  now: Temporal.ZonedDateTime,
  calendarId: DemoCalendarId,
): EventDraft {
  const start = date.equals(now.toPlainDate())
    ? now
        .round({ roundingIncrement: 30, roundingMode: "ceil", smallestUnit: "minute" })
        .toPlainDateTime()
    : date.toPlainDateTime(defaultStartTime);
  const end = start.add({ hours: 1 });
  return {
    allDay: false,
    calendarId,
    description: "",
    endDate: end.toPlainDate(),
    endTime: end.toPlainTime(),
    startDate: start.toPlainDate(),
    startTime: start.toPlainTime(),
    title: "",
  };
}

/** Moves the start and keeps the event's length, the way calendar apps do. */
export function moveDraftStart(
  draft: EventDraft,
  startDate: Temporal.PlainDate,
  startTime: Temporal.PlainTime,
): EventDraft {
  const previousStart = draft.startDate.toPlainDateTime(draft.startTime);
  const length = previousStart.until(draft.endDate.toPlainDateTime(draft.endTime));
  const end = startDate.toPlainDateTime(startTime).add(length);
  return {
    ...draft,
    endDate: end.toPlainDate(),
    endTime: end.toPlainTime(),
    startDate,
    startTime,
  };
}

export function eventFromDraft(draft: EventDraft, timeZone: string, id: string): EventDraftResult {
  const title = draft.title.trim();
  if (title === "") return { error: "Add a title." };

  const description = draft.description.trim();
  const base = {
    calendarId: draft.calendarId,
    id,
    title,
    ...(description === "" ? {} : { description }),
  };
  if (draft.allDay) {
    if (Temporal.PlainDate.compare(draft.endDate, draft.startDate) < 0) {
      return { error: "The event ends before it starts." };
    }
    return {
      event: {
        ...base,
        end: draft.endDate.add({ days: 1 }),
        kind: "all-day",
        start: draft.startDate,
      },
    };
  }

  const toInstant = (date: Temporal.PlainDate, plainTime: Temporal.PlainTime) =>
    date.toZonedDateTime({ plainTime, timeZone }).toInstant();
  const start = toInstant(draft.startDate, draft.startTime);
  const end = toInstant(draft.endDate, draft.endTime);
  if (Temporal.Instant.compare(end, start) <= 0) {
    return { error: "The event must end after it starts." };
  }
  return { event: { ...base, end, kind: "timed", start } };
}
