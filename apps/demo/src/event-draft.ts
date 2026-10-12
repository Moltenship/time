import type { CalendarEventInterval } from "@moltenship/calendar";

import type { DemoEvent, DemoOccurrence } from "./calendar";
import type { DemoCalendarId } from "./calendars";
import { noRepeat, repeatFromRule, ruleFromRepeat, seriesDate, type RepeatDraft } from "./repeat";
import type { DemoResourceId } from "./resources";

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
  /** The end's original UTC offset, which picks the same occurrence of a repeated wall time. */
  readonly endOffset?: string;
  readonly endTime: Temporal.PlainTime;
  /** Set when editing an existing event: its ID in the calendar, an occurrence's for a series. */
  readonly id?: string;
  /** The first day of the series an occurrence belongs to: the earliest it can stop repeating. */
  readonly firstDate?: Temporal.PlainDate;
  /** Set when editing an occurrence of a series, which saves through the scope dialog. */
  readonly occurrence?: DemoOccurrence;
  /** How the event repeats: the Repeat field. */
  readonly repeat: RepeatDraft;
  /** Rooms and people the event books. */
  readonly resourceIds?: readonly DemoResourceId[];
  /** The zone a timed series repeats in, which its end date is read in. */
  readonly seriesTimeZone: string;
  readonly startDate: Temporal.PlainDate;
  /** The start's original UTC offset, which picks the same occurrence of a repeated wall time. */
  readonly startOffset?: string;
  readonly startTime: Temporal.PlainTime;
  readonly title: string;
}

export type EventDraftResult = { readonly event: DemoEvent } | { readonly error: string };

const defaultStartTime = Temporal.PlainTime.from("09:00");

type IntervalFields = Pick<
  EventDraft,
  "allDay" | "endDate" | "endOffset" | "endTime" | "startDate" | "startOffset" | "startTime"
>;

function intervalFields(interval: CalendarEventInterval, timeZone: string): IntervalFields {
  if (interval.kind === "all-day") {
    return {
      allDay: true,
      endDate: interval.end.subtract({ days: 1 }),
      endTime: defaultStartTime.add({ hours: 1 }),
      startDate: interval.start,
      startTime: defaultStartTime,
    };
  }
  if (interval.kind === "floating") {
    return {
      allDay: false,
      endDate: interval.end.toPlainDate(),
      endTime: interval.end.toPlainTime(),
      startDate: interval.start.toPlainDate(),
      startTime: interval.start.toPlainTime(),
    };
  }
  const start = interval.start.toZonedDateTimeISO(timeZone);
  const end = interval.end.toZonedDateTimeISO(timeZone);
  return {
    allDay: false,
    endDate: end.toPlainDate(),
    endOffset: end.offset,
    endTime: end.toPlainTime(),
    startDate: start.toPlainDate(),
    startOffset: start.offset,
    startTime: start.toPlainTime(),
  };
}

/**
 * The editable form of what the calendar shows: a one-off event, or an occurrence of a series,
 * at the occurrence's own time, with its series' rule in the Repeat field.
 */
export function draftFromOccurrence(occurrence: DemoOccurrence, timeZone: string): EventDraft {
  const { event, interval, recurrence } = occurrence;
  const series = recurrence?.series;
  const seriesTimeZone = (series?.kind === "timed" ? series.sourceTimeZone : undefined) ?? timeZone;
  return {
    ...intervalFields(interval, timeZone),
    calendarId: event.calendarId,
    description: event.description ?? "",
    id: occurrence.id,
    ...(series === undefined ? {} : { firstDate: seriesDate(series, seriesTimeZone) }),
    ...(recurrence === undefined ? {} : { occurrence }),
    // Presets are named after the day the occurrence shows on, in the series' zone, as the Repeat
    // field names them; an override moved off its rule's days reads as a custom rule.
    repeat:
      recurrence === undefined
        ? noRepeat
        : repeatFromRule(
            series?.recurrence?.rule,
            seriesDate(interval, seriesTimeZone),
            seriesTimeZone,
          ),
    resourceIds: event.resourceIds,
    seriesTimeZone,
    title: event.title,
  };
}

/** A new event for a range dragged out in a view, in the resource it was dragged out in. */
export function draftFromPlacement(
  placement: CalendarEventInterval & { readonly resourceIds?: readonly DemoResourceId[] },
  timeZone: string,
  calendarId: DemoCalendarId,
): EventDraft {
  return {
    ...intervalFields(placement, timeZone),
    calendarId,
    description: "",
    repeat: noRepeat,
    resourceIds: placement.resourceIds,
    seriesTimeZone: timeZone,
    title: "",
  };
}

/**
 * Resolves a wall time in `timeZone`. The original offset wins while it is still valid for that
 * wall time, so an unchanged time in a DST fold keeps its occurrence; otherwise the earlier
 * occurrence of a repeated time, or the shifted time of a skipped one, is used.
 */
function resolveWallTime(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
  offset: string | undefined,
): Temporal.Instant {
  const dateTime = date.toPlainDateTime(time);
  if (offset === undefined) return dateTime.toZonedDateTime(timeZone).toInstant();
  return Temporal.ZonedDateTime.from(`${dateTime.toString()}${offset}[${timeZone}]`, {
    offset: "prefer",
  }).toInstant();
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
    repeat: noRepeat,
    seriesTimeZone: now.timeZoneId,
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

/** The draft's time as an event's interval, or why it has none. */
export function intervalFromDraft(
  draft: EventDraft,
  timeZone: string,
):
  | Extract<CalendarEventInterval, { readonly kind: "all-day" | "timed" }>
  | { readonly error: string } {
  if (draft.allDay) {
    if (Temporal.PlainDate.compare(draft.endDate, draft.startDate) < 0) {
      return { error: "The event ends before it starts." };
    }
    return { end: draft.endDate.add({ days: 1 }), kind: "all-day", start: draft.startDate };
  }
  const start = resolveWallTime(draft.startDate, draft.startTime, timeZone, draft.startOffset);
  const end = resolveWallTime(draft.endDate, draft.endTime, timeZone, draft.endOffset);
  if (Temporal.Instant.compare(end, start) <= 0) {
    return { error: "The event must end after it starts." };
  }
  return { end, kind: "timed", start };
}

/**
 * The earliest day a draft's series can stop repeating: its first day, or for a new series the
 * day it starts, in the zone it repeats in.
 */
export function repeatsFrom(draft: EventDraft, timeZone: string): Temporal.PlainDate {
  if (draft.firstDate !== undefined) return draft.firstDate;
  const interval = intervalFromDraft(draft, timeZone);
  return "error" in interval ? draft.startDate : seriesDate(interval, draft.seriesTimeZone);
}

export function eventFromDraft(draft: EventDraft, timeZone: string, id: string): EventDraftResult {
  const title = draft.title.trim();
  if (title === "") return { error: "Add a title." };
  const interval = intervalFromDraft(draft, timeZone);
  if ("error" in interval) return interval;

  const { end } = draft.repeat;
  if (
    draft.repeat.frequency !== "none" &&
    end.type === "until" &&
    Temporal.PlainDate.compare(end.date, repeatsFrom(draft, timeZone)) < 0
  ) {
    return { error: "The event stops repeating before it starts." };
  }

  const description = draft.description.trim();
  const { resourceIds = [] } = draft;
  const rule = ruleFromRepeat(draft.repeat, interval, draft.seriesTimeZone);
  // A series repeats on the wall clock of the zone it was made in, across DST.
  const zone = rule !== undefined && interval.kind === "timed" ? draft.seriesTimeZone : undefined;
  return {
    event: {
      calendarId: draft.calendarId,
      id,
      title,
      ...(description === "" ? {} : { description }),
      ...(rule === undefined ? {} : { recurrence: { rule } }),
      ...(resourceIds.length === 0 ? {} : { resourceIds }),
      ...interval,
      ...(zone === undefined ? {} : { sourceTimeZone: zone }),
    },
  };
}
