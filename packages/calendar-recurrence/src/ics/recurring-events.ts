import type { CalendarEventInterval } from "@moltenship/calendar-core";
import {
  getEventEnd,
  type IcsDateValue,
  type IcsEvent,
  type IcsExtensionsConfig,
} from "@moltenship/ics";

import { occurrenceId, recurrenceKey } from "../occurrence-id";
import type {
  EventRecurrence,
  RecurrenceDate,
  RecurrenceOverride,
  RecurrencePeriod,
  RecurrenceRule,
  RecurringCalendarEvent,
} from "../types";
import {
  instantOf,
  ownRecurrenceId,
  toSeriesDate,
  toSeriesPeriod,
  type SeriesDate,
  type SeriesTime,
} from "./dates";

export type IcsRecurrenceIssueCode =
  /**
   * EXDATE, RDATE, UNTIL or RECURRENCE-ID is a DATE where the series is DATE-TIME or the other way
   * round, or has a TZID that resolved to no time zone. It was converted into the series' kind, or
   * dropped when it can't stand for its role, such as a date-only RDATE on a timed series. A
   * date-only EXDATE is no mismatch: it excludes the whole day. An RDATE PERIOD that doesn't end
   * after it starts in the series' kind keeps only its start.
   */
  | "date-kind-mismatch"
  /**
   * Another VEVENT has the same UID, or the same UID and RECURRENCE-ID. The higher SEQUENCE wins,
   * then the later one in the input.
   */
  | "duplicate-event"
  /**
   * DTSTART, or the RECURRENCE-ID of an override without its series, has a TZID that resolved to
   * no time zone. The event is skipped.
   */
  | "unresolved-time-zone"
  /** RANGE=THISANDFUTURE, which isn't supported: the override replaces only the occurrence it names. */
  | "unsupported-rule";

export interface IcsRecurrenceIssue<TExtensions extends IcsExtensionsConfig = {}> {
  readonly code: IcsRecurrenceIssueCode;
  readonly event: IcsEvent<TExtensions>;
  /** The event's position in the input. */
  readonly index: number;
  readonly message: string;
  /** The property it concerns, such as `EXDATE`. */
  readonly property?: string;
}

export interface IcsRecurringEventsOptions {
  /**
   * How long a timed or floating event lasts when DTEND or DURATION make it zero-length or
   * negative. Defaults to 30 minutes. Such all-day events last one day.
   */
  readonly minimumDuration?: Temporal.DurationLike;
  /**
   * The feed's time zone: its X-WR-TIMEZONE (`IcsCalendar.timeZone`), or one the application
   * chose. UTC times on all-day and floating series, such as an UNTIL, are read in it, so they keep
   * the feed's dates. Defaults to UTC. Floating DTSTARTs stay floating.
   */
  readonly timeZone?: string;
}

export interface IcsRecurringEvents<TExtensions extends IcsExtensionsConfig = {}> {
  /** Series masters, overrides and one-off events, in input order. */
  readonly events: readonly RecurringCalendarEvent<IcsEvent<TExtensions>>[];
  /** In input order of the events they concern. */
  readonly issues: readonly IcsRecurrenceIssue<TExtensions>[];
}

const defaultMinimumDuration: Temporal.DurationLike = { minutes: 30 };

type IcsEventTimes = Pick<IcsEvent, "duration" | "end" | "start">;

// DTSTART to the effective end; `undefined` when DTSTART's time zone didn't resolve.
function intervalOf(
  event: IcsEventTimes,
  minimumDuration: Temporal.DurationLike,
): CalendarEventInterval | undefined {
  const { start } = event;
  const end = getEventEnd(event);
  switch (start.kind) {
    case "date": {
      const endDate = end.kind === "date" ? end.date : start.date;
      return {
        end:
          Temporal.PlainDate.compare(endDate, start.date) > 0
            ? endDate
            : start.date.add({ days: 1 }),
        kind: "all-day",
        start: start.date,
      };
    }
    case "floating": {
      const endTime = end.kind === "floating" ? end.wallTime : start.wallTime;
      return {
        end:
          Temporal.PlainDateTime.compare(endTime, start.wallTime) > 0
            ? endTime
            : start.wallTime.add(minimumDuration),
        kind: "floating",
        start: start.wallTime,
      };
    }
    case "unresolved":
      return undefined;
    default: {
      // A UTC DTSTART repeats in UTC, whatever the expander's `defaultTimeZone`.
      const zone = start.kind === "zoned" ? start.zoned.timeZoneId : "UTC";
      const startInstant = instantOf(start)!;
      const endInstant = instantOf(end) ?? startInstant;
      return {
        end:
          Temporal.Instant.compare(endInstant, startInstant) > 0
            ? endInstant
            : startInstant.toZonedDateTimeISO(zone).add(minimumDuration).toInstant(),
        kind: "timed",
        sourceTimeZone: zone,
        start: startInstant,
      };
    }
  }
}

function keyOf(date: RecurrenceDate | RecurrencePeriod): string {
  return "end" in date
    ? `${recurrenceKey(date.start)}/${recurrenceKey(date.end)}`
    : recurrenceKey(date);
}

function unique<TDate extends RecurrenceDate | RecurrencePeriod>(
  dates: readonly TDate[],
): readonly TDate[] {
  const keys = new Set<string>();
  return dates.filter((date) => {
    const key = keyOf(date);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

/**
 * Groups parsed VEVENTs into series masters, overrides and one-off events, which the expander
 * takes with `createCanonicalRecurrenceAdapter`. Each event's `data` is its `IcsEvent`.
 *
 * - IDs: masters and one-off events keep their UID; an override gets the ID of the occurrence it
 *   replaces, `occurrenceId(uid, recurrenceId)`, with or without its master. Without one, its
 *   RECURRENCE-ID keeps its own kind, except that a floating one on a timed override resolves in
 *   the override's zone, so the ID doesn't change when the master loads.
 * - Intervals: a UTC DTSTART repeats in UTC (`sourceTimeZone: "UTC"`), a zoned one in its zone.
 * - Masters: an event with RRULE, RDATE or EXDATE, or one an override names by UID. DURATION
 *   without DTEND on a timed or floating master becomes `recurrence.duration`, and a DTSTART in a
 *   DST gap keeps its written time as `recurrence.wallStart`.
 * - Dates: EXDATE, RDATE, UNTIL and RECURRENCE-ID take the kind of the series' first occurrence
 *   through `coerceRecurrenceDate`. A date-only EXDATE excludes the whole day, a date-only UNTIL
 *   lasts through that day, and a date-only RDATE or RECURRENCE-ID on a timed or floating series
 *   is dropped with an issue. On all-day and floating series, UTC times are read in `timeZone` and
 *   zoned ones in their own zone. An RDATE PERIOD stays a period, with both ends converted.
 * - Lengths: an event that DTEND or DURATION make zero-length or negative lasts `minimumDuration`,
 *   30 minutes by default, or one day when all-day.
 * - STATUS:CANCELLED: a cancelled one-off event or master is left out, with the master's
 *   overrides; a cancelled override comes out with `override.cancelled`, which hides its
 *   occurrence.
 * - Duplicates: of VEVENTs with the same UID, or UID and RECURRENCE-ID, the highest SEQUENCE wins,
 *   then the later one.
 * - RANGE=THISANDFUTURE isn't supported: the override replaces only the occurrence it names.
 *
 * Bad data becomes `issues`; it never throws.
 */
export function recurringEventsFromIcs<TExtensions extends IcsExtensionsConfig = {}>(
  events: readonly IcsEvent<TExtensions>[],
  options: IcsRecurringEventsOptions = {},
): IcsRecurringEvents<TExtensions> {
  const minimumDuration = options.minimumDuration ?? defaultMinimumDuration;
  const issues: IcsRecurrenceIssue<TExtensions>[] = [];
  const report = (
    index: number,
    code: IcsRecurrenceIssueCode,
    message: string,
    property?: string,
  ) => {
    const event = events[index]!;
    issues.push({ code, event, index, message, ...(property === undefined ? {} : { property }) });
  };
  const unresolved = (index: number, property: string, value: IcsDateValue, skipped: string) => {
    const tzid = value.kind === "unresolved" ? value.tzid : "";
    report(
      index,
      "unresolved-time-zone",
      `${property} has TZID "${tzid}", which resolved to no time zone; ${skipped}.`,
      property,
    );
  };
  // The higher SEQUENCE wins, then the later event.
  const pick = (kept: number, index: number, name: string): number => {
    const keptSequence = events[kept]!.sequence ?? 0;
    const sequence = events[index]!.sequence ?? 0;
    const [winner, loser] = sequence >= keptSequence ? [index, kept] : [kept, index];
    const reason =
      sequence === keptSequence ? "has the same SEQUENCE and comes later" : "has a higher SEQUENCE";
    report(
      loser,
      "duplicate-event",
      `Another VEVENT with ${name} ${reason}, and replaces this one.`,
    );
    return winner;
  };

  const overriddenUids = new Set<string>();
  const masterIndexes = new Map<string, number>();
  events.forEach((event, index) => {
    if (event.recurrenceId !== undefined) {
      overriddenUids.add(event.uid);
      return;
    }
    const kept = masterIndexes.get(event.uid);
    masterIndexes.set(
      event.uid,
      kept === undefined ? index : pick(kept, index, `UID "${event.uid}"`),
    );
  });

  const intervals = new Map<number, CalendarEventInterval | undefined>();
  const series = new Map<string, SeriesTime>();
  const cancelledUids = new Set<string>();
  for (const [uid, index] of masterIndexes) {
    const event = events[index]!;
    if (event.status === "CANCELLED") {
      cancelledUids.add(uid);
      continue;
    }
    const interval = intervalOf(event, minimumDuration);
    if (interval === undefined) {
      unresolved(index, "DTSTART", event.start, "the event is skipped");
      continue;
    }
    intervals.set(index, interval);
    series.set(uid, { first: interval, timeZone: options.timeZone });
  }

  const overrideIndexes = new Map<string, number>();
  const recurrenceIds = new Map<number, RecurrenceDate>();
  events.forEach((event, index) => {
    const value = event.recurrenceId;
    if (value === undefined || cancelledUids.has(event.uid)) return;
    const interval = intervalOf(event, minimumDuration);
    intervals.set(index, interval);
    const time = series.get(event.uid);
    let recurrenceId: RecurrenceDate | undefined;
    if (time === undefined) {
      if (value.kind === "unresolved") {
        unresolved(index, "RECURRENCE-ID", value, "the override, which has no series, is skipped");
        return;
      }
      recurrenceId = ownRecurrenceId(value, interval);
    } else {
      const { date, mismatch } = toSeriesDate(value, time, "start", "RECURRENCE-ID");
      if (mismatch !== undefined) report(index, "date-kind-mismatch", mismatch, "RECURRENCE-ID");
      if (date === undefined) return;
      recurrenceId = date;
    }
    recurrenceIds.set(index, recurrenceId);
    const id = occurrenceId(event.uid, recurrenceId);
    const kept = overrideIndexes.get(id);
    const name = `UID "${event.uid}" and RECURRENCE-ID ${recurrenceKey(recurrenceId)}`;
    overrideIndexes.set(id, kept === undefined ? index : pick(kept, index, name));
  });
  const keptOverrides = new Set(overrideIndexes.values());

  const recurrenceOf = (index: number, time: SeriesTime): EventRecurrence => {
    const event = events[index]!;
    // One issue per property, for the first value that needs one.
    const keep = <TDate>(property: string, converted: readonly SeriesDate<TDate>[]): TDate[] => {
      const mismatch = converted.find((date) => date.mismatch !== undefined)?.mismatch;
      if (mismatch !== undefined) report(index, "date-kind-mismatch", mismatch, property);
      return converted.flatMap(({ date }) => (date === undefined ? [] : [date]));
    };

    const recurrenceDates = unique(
      keep(
        "RDATE",
        event.recurrenceDates.map((value) =>
          "kind" in value
            ? toSeriesDate(value, time, "start", "RDATE")
            : toSeriesPeriod(value, time),
        ),
      ),
    );
    const exceptionDates = unique(
      keep(
        "EXDATE",
        event.exceptionDates.map((value) => toSeriesDate(value, time, "exception", "EXDATE")),
      ),
    );
    let rule: RecurrenceRule | undefined;
    if (event.recurrenceRule !== undefined) {
      const { until, ...parts } = event.recurrenceRule;
      const [date] =
        until === undefined ? [] : keep("RRULE", [toSeriesDate(until, time, "until", "UNTIL")]);
      rule = date === undefined ? parts : { ...parts, until: date };
    }
    const { duration, end, start } = event;
    const nominal =
      end === undefined &&
      duration !== undefined &&
      duration.sign > 0 &&
      time.first.kind !== "all-day";
    const inGap = start.kind === "zoned" && !start.wallTime.equals(start.zoned.toPlainDateTime());
    return {
      ...(nominal ? { duration } : {}),
      ...(exceptionDates.length > 0 ? { exceptionDates } : {}),
      ...(recurrenceDates.length > 0 ? { recurrenceDates } : {}),
      ...(rule === undefined ? {} : { rule }),
      ...(inGap ? { wallStart: start.wallTime } : {}),
    };
  };

  const output: RecurringCalendarEvent<IcsEvent<TExtensions>>[] = [];
  events.forEach((event, index) => {
    const title = event.summary ?? "";
    if (event.recurrenceId !== undefined) {
      if (!keptOverrides.has(index)) return;
      const interval = intervals.get(index);
      if (interval === undefined) {
        unresolved(index, "DTSTART", event.start, "the override is skipped");
        return;
      }
      if (event.recurrenceRange === "THISANDFUTURE") {
        report(
          index,
          "unsupported-rule",
          "RANGE=THISANDFUTURE isn't supported; the override replaces only the occurrence it names.",
          "RECURRENCE-ID",
        );
      }
      const recurrenceId = recurrenceIds.get(index)!;
      const override: RecurrenceOverride<string> = {
        ...(event.status === "CANCELLED" ? { cancelled: true } : {}),
        recurrenceId,
        seriesId: event.uid,
      };
      const id = occurrenceId(event.uid, recurrenceId);
      output.push({ ...interval, data: event, id, override, title });
      return;
    }
    const interval = intervals.get(index);
    if (interval === undefined) return;
    const isMaster =
      event.recurrenceRule !== undefined ||
      event.recurrenceDates.length > 0 ||
      event.exceptionDates.length > 0 ||
      overriddenUids.has(event.uid);
    const recurrence = isMaster ? recurrenceOf(index, series.get(event.uid)!) : undefined;
    output.push({
      ...interval,
      data: event,
      id: event.uid,
      ...(recurrence === undefined ? {} : { recurrence }),
      title,
    });
  });

  return { events: output, issues: issues.sort((left, right) => left.index - right.index) };
}
