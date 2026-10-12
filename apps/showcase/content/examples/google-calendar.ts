// #region types
// lib/google-calendar.ts
import type { CalendarEventInterval } from "@moltenship/calendar";
import {
  formatRecurrenceRule,
  parseRecurrenceRule,
  type EventRecurrence,
  type RecurrenceDate,
  type RecurrenceRule,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import {
  decodeIcsDateValue,
  encodeIcsValue,
  icsValueTypeOf,
  parseIcsComponents,
  splitIcsValues,
  type IcsDateValue,
} from "@moltenship/ics";

/** The fields of a Google Calendar API event that this mapping and the sync guide read. */
export interface GoogleEvent {
  readonly id: string;
  /** Changes on every write. Send it as `If-Match`, so a write never overwrites a newer one. */
  readonly etag?: string;
  readonly status?: "confirmed" | "tentative" | "cancelled";
  readonly summary?: string;
  /** An event color from `colors.get`, "1" to "11". Without it, the calendar's color. */
  readonly colorId?: string;
  /** "transparent" shows the time as free. "opaque", the default, as busy. */
  readonly transparency?: "opaque" | "transparent";
  readonly start?: GoogleEventTime;
  readonly end?: GoogleEventTime;
  /** On a series' master: RRULE, EXRULE, RDATE and EXDATE lines. */
  readonly recurrence?: readonly string[];
  /** On a changed or cancelled occurrence: the master's ID. */
  readonly recurringEventId?: string;
  /** On a changed or cancelled occurrence: where the series put it. */
  readonly originalStartTime?: GoogleEventTime;
}

export interface GoogleEventTime {
  /** An all-day event's date, such as "2026-10-12". */
  readonly date?: string;
  /** RFC 3339. The offset may be left out when `timeZone` is set. */
  readonly dateTime?: string;
  /** The IANA time zone a series repeats in. */
  readonly timeZone?: string;
}

/** A Google event as the calendar's event, with the Google event as its `data`. */
export type GoogleCalendarEvent = RecurringCalendarEvent<GoogleEvent>;
// #endregion types

// #region recurrence
/** A master's `recurrence` lines as an `EventRecurrence`, and the lines it couldn't read. */
export function readGoogleRecurrence(lines: readonly string[]): {
  readonly problems: readonly string[];
  readonly recurrence: EventRecurrence;
} {
  const problems: string[] = [];
  const exceptionDates: RecurrenceDate[] = [];
  const recurrenceDates: RecurrenceDate[] = [];
  let rule: RecurrenceRule | undefined;

  // The ICS syntax layer splits content lines into names, parameters and values.
  const { components } = parseIcsComponents(["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n"));
  for (const property of components[0]?.properties ?? []) {
    if (property.name === "RRULE") {
      const parsed = parseRecurrenceRule(property.value);
      rule = parsed.rule;
      problems.push(...parsed.issues.map((issue) => `RRULE: ${issue.message}`));
      continue;
    }
    // EXRULE, which RFC 5545 deprecated, and anything else.
    if (property.name !== "EXDATE" && property.name !== "RDATE") {
      problems.push(`${property.name} isn't supported`);
      continue;
    }
    // A DATE-TIME unless VALUE says otherwise, as in EXDATE;VALUE=DATE:20261014.
    const type = icsValueTypeOf(property);
    if (type !== "DATE" && type !== "DATE-TIME") {
      problems.push(`${property.name};VALUE=${type} isn't read`);
      continue;
    }
    const tzid = property.parameters.TZID?.[0];
    const dates = property.name === "EXDATE" ? exceptionDates : recurrenceDates;
    for (const raw of splitIcsValues(type, property.value)) {
      const decoded = decodeIcsDateValue(raw, type, tzid === undefined ? {} : { tzid });
      const date = decoded.ok ? recurrenceDateOf(decoded.value) : undefined;
      if (date === undefined) problems.push(`${property.name}: can't read ${raw}`);
      else dates.push(date);
    }
  }
  return { problems, recurrence: { exceptionDates, recurrenceDates, rule } };
}

/** An ICS date in the series' terms. The expander converts dates of another kind. */
function recurrenceDateOf(value: IcsDateValue): RecurrenceDate | undefined {
  switch (value.kind) {
    case "date":
      return value.date;
    case "utc":
      return value.instant;
    case "zoned":
      return value.zoned.toInstant();
    case "floating":
      return value.wallTime;
    case "unresolved":
      return undefined;
  }
}
// #endregion recurrence

// #region events
/**
 * Events from `events.list` without `singleEvents`: masters with `recurrence`, occurrences that
 * changed or were cancelled with `recurringEventId`, and one-off events.
 */
export function fromGoogleEvents(items: readonly GoogleEvent[]): {
  readonly events: readonly GoogleCalendarEvent[];
  readonly problems: readonly string[];
} {
  const events: GoogleCalendarEvent[] = [];
  const problems: string[] = [];

  for (const item of items) {
    const base = { data: item, id: item.id, title: item.summary ?? "(No title)" };

    if (item.recurringEventId !== undefined) {
      // An occurrence that changed, or was cancelled, which Google returns without times.
      const recurrenceId = item.originalStartTime && pointOf(item.originalStartTime);
      const interval = intervalOf(item.start, item.end) ?? recurrenceId?.interval;
      if (recurrenceId === undefined || interval === undefined) {
        problems.push(`${item.id}: no original start`);
        continue;
      }
      const cancelled = item.status === "cancelled";
      events.push({
        ...base,
        ...interval,
        override: { cancelled, recurrenceId: recurrenceId.date, seriesId: item.recurringEventId },
      });
      continue;
    }

    if (item.status === "cancelled") continue;
    const interval = intervalOf(item.start, item.end);
    if (interval === undefined) {
      problems.push(`${item.id}: no start or end`);
      continue;
    }
    if (item.recurrence === undefined) {
      events.push({ ...base, ...interval });
      continue;
    }
    const { problems: lines, recurrence } = readGoogleRecurrence(item.recurrence);
    problems.push(...lines.map((problem) => `${item.id}: ${problem}`));
    events.push({ ...base, ...interval, recurrence });
  }
  return { events, problems };
}

function intervalOf(
  start: GoogleEventTime | undefined,
  end: GoogleEventTime | undefined,
): CalendarEventInterval | undefined {
  if (start?.date !== undefined && end?.date !== undefined) {
    const [from, to] = [Temporal.PlainDate.from(start.date), Temporal.PlainDate.from(end.date)];
    return { end: to, kind: "all-day", start: from };
  }
  if (start?.dateTime === undefined || end?.dateTime === undefined) return undefined;
  const timeZone = start.timeZone;
  return {
    end: instantOf(end.dateTime, end.timeZone ?? timeZone),
    kind: "timed",
    start: instantOf(start.dateTime, timeZone),
    // A series repeats on this zone's wall clock, so 09:00 stays 09:00 across DST.
    ...(timeZone === undefined ? {} : { sourceTimeZone: timeZone }),
  };
}

/** `originalStartTime` as a recurrence ID, and an interval there for a cancelled occurrence. */
function pointOf(time: GoogleEventTime) {
  const interval = intervalOf(time, time);
  return interval && { date: interval.start, interval };
}

function instantOf(dateTime: string, timeZone: string | undefined): Temporal.Instant {
  // "2026-10-12T09:00:00+02:00" has its offset; "2026-10-12T09:00:00" is a wall time in timeZone.
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTime)
    ? Temporal.Instant.from(dateTime)
    : Temporal.PlainDateTime.from(dateTime)
        .toZonedDateTime(timeZone ?? "UTC")
        .toInstant();
}
// #endregion events

// #region write
/**
 * A series' recurrence as Google's `recurrence` lines, such as the one an edit writes. Instants
 * are written on the series' wall clock when it has a time zone.
 */
export function toGoogleRecurrence(
  recurrence: EventRecurrence,
  timeZone: string | undefined,
): string[] {
  const lines =
    recurrence.rule === undefined ? [] : [`RRULE:${formatRecurrenceRule(recurrence.rule)}`];
  for (const date of recurrence.exceptionDates ?? [])
    lines.push(`EXDATE${dateText(date, timeZone)}`);
  for (const date of recurrence.recurrenceDates ?? []) {
    // This mapping reads no RDATE periods, so edits write none.
    if ("start" in date) continue;
    lines.push(`RDATE${dateText(date, timeZone)}`);
  }
  return lines;
}

function dateText(date: RecurrenceDate, timeZone: string | undefined): string {
  if (date instanceof Temporal.PlainDate) {
    return `;VALUE=DATE:${encodeIcsValue("DATE", { date, kind: "date" })}`;
  }
  if (date instanceof Temporal.PlainDateTime) {
    return `:${encodeIcsValue("DATE-TIME", { kind: "floating", wallTime: date })}`;
  }
  if (timeZone === undefined)
    return `:${encodeIcsValue("DATE-TIME", { instant: date, kind: "utc" })}`;
  const wallTime = date.toZonedDateTimeISO(timeZone).toPlainDateTime();
  return `;TZID=${timeZone}:${encodeIcsValue("DATE-TIME", { kind: "floating", wallTime })}`;
}
// #endregion write
