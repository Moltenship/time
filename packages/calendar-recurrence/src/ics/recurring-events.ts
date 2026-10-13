import type { CalendarEventInterval } from "@moltenship/calendar-core";
import {
  getEventEnd,
  type IcsDateValue,
  type IcsEvent,
  type IcsExtensionsConfig,
} from "@moltenship/ics";

import { isPeriod } from "../internal/dates";
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
  isMidnight,
  midnightDate,
  ownRecurrenceId,
  toSeriesDate,
  toSeriesPeriod,
  writtenWall,
  type FeedSeries,
  type SeriesDate,
} from "./dates";
import { applyThisAndFuture } from "./this-and-future";

export type IcsRecurrenceIssueCode =
  /**
   * EXDATE, RDATE, UNTIL or RECURRENCE-ID is a DATE where the series is DATE-TIME or the other way
   * round, or has a TZID that resolved to no time zone. It was converted into the series' kind, or
   * dropped when it can't stand for its role, such as a date-only RDATE on a timed series. A
   * date-only EXDATE is no mismatch: it excludes the whole day. An RDATE PERIOD that ends no later
   * than it starts once in the series' kind, as hours on an all-day series can, keeps only its start.
   */
  | "date-kind-mismatch"
  /**
   * Another VEVENT has the same UID, or the same UID and RECURRENCE-ID. The higher SEQUENCE wins,
   * then the later one in the input.
   */
  | "duplicate-event"
  /**
   * An RDATE PERIOD that doesn't end after it starts as written, which RFC 5545 §3.3.9 doesn't
   * allow. Only its start is kept.
   */
  | "invalid-period"
  /**
   * DTSTART, or the RECURRENCE-ID of an override without its series, has a TZID that resolved to
   * no time zone. The event is skipped.
   */
  | "unresolved-time-zone"
  /**
   * RANGE=THISANDFUTURE whose change the series can't take, such as a BYSETPOS rule moved to
   * another day, or whose series or occurrence isn't in the feed: the override replaces only the
   * occurrence it names.
   */
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
   * the feed's dates; on an all-day series Outlook flags with `X-MICROSOFT-CDO-ALLDAYEVENT`, they
   * are read in the zone of its DTSTART instead. Floating DTSTARTs stay floating. Defaults to the
   * zone most of the events' TZIDs resolve to, as feeds without X-WR-TIMEZONE, such as Exchange's,
   * need, and to UTC when none has one. Pass `"UTC"` for the reading before that default.
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

function minimumDurationOf(input: Temporal.DurationLike | undefined): Temporal.Duration {
  let duration: Temporal.Duration | undefined;
  try {
    duration = Temporal.Duration.from(input ?? defaultMinimumDuration);
  } catch {
    duration = undefined;
  }
  if (duration === undefined || duration.sign <= 0) {
    throw new RangeError("minimumDuration must be a positive duration, such as { minutes: 30 }.");
  }
  return duration;
}

function timeZoneOf(timeZone: string | undefined): string | undefined {
  if (timeZone === undefined) return undefined;
  try {
    return new Temporal.ZonedDateTime(0n, timeZone).timeZoneId;
  } catch (error) {
    throw new RangeError(`timeZone "${timeZone}" isn't a time zone Temporal knows.`, {
      cause: error,
    });
  }
}

type IcsEventTimes = Pick<IcsEvent, "duration" | "end" | "otherProperties" | "start">;

const allDayProperty = "X-MICROSOFT-CDO-ALLDAYEVENT";

/** The zone a value was written in: its TZID's, UTC for a UTC time, else none. */
function zoneOf(value: IcsDateValue): string | undefined {
  return value.kind === "zoned" ? value.zoned.timeZoneId : value.kind === "utc" ? "UTC" : undefined;
}

/** Outlook's all-day flag, which older exports pair with midnight-to-midnight date-times. */
function flaggedAllDay(event: Pick<IcsEvent, "otherProperties">): boolean {
  return event.otherProperties.some(
    ({ name, value }) => name === allDayProperty && value.trim().toUpperCase() === "TRUE",
  );
}

/**
 * The days of an event Outlook flags all-day and writes from midnight to a later midnight, on the
 * wall clock written, whatever its TZID resolved to. `undefined` for anything else.
 */
function flaggedDays(event: IcsEventTimes): CalendarEventInterval | undefined {
  const { duration, end, start } = event;
  if (start.kind === "date" || !flaggedAllDay(event)) return undefined;
  const from = writtenWall(start);
  const to =
    end !== undefined ? writtenWall(getEventEnd(event)) : from.add(duration ?? { days: 1 });
  if (!isMidnight(from) || !isMidnight(to)) return undefined;
  const [startDate, endDate] = [from.toPlainDate(), to.toPlainDate()];
  return Temporal.PlainDate.compare(endDate, startDate) > 0
    ? { end: endDate, kind: "all-day", start: startDate }
    : undefined;
}

/**
 * DTSTART to the effective end; `undefined` when DTSTART's time zone didn't resolve. `repeats` is
 * for a series, whose later occurrences repeat at DTSTART's written time.
 */
function intervalOf(
  event: IcsEventTimes,
  minimumDuration: Temporal.DurationLike,
  repeats: boolean,
): CalendarEventInterval | undefined {
  const days = flaggedDays(event);
  if (days !== undefined) return days;
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
      let endInstant = instantOf(end) ?? startInstant;
      // A DTSTART in a DST gap moves forward by the gap (RFC 5545 §3.3.5), and DTEND stays. A
      // series repeats at the written time on later weeks, so it keeps the length written from
      // DTSTART to a DTEND in its zone: 02:30–03:30 on the night 02:00 becomes 03:00 is
      // 03:30–04:30, and 02:30–03:30 later. A single event keeps its exact length, unless the gap
      // leaves it none.
      const written = event.end;
      if (
        start.kind === "zoned" &&
        written?.kind === "zoned" &&
        written.zoned.timeZoneId === zone &&
        !start.wallTime.equals(start.zoned.toPlainDateTime())
      ) {
        const length = start.wallTime.until(written.wallTime, { largestUnit: "hours" });
        const empty = Temporal.Instant.compare(endInstant, startInstant) <= 0;
        if (length.sign > 0 && (repeats || empty)) endInstant = startInstant.add(length);
      }
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

/** The zone most events have a TZID that resolves to, each event counted once per zone. */
function feedTimeZoneOf(events: readonly IcsEvent<IcsExtensionsConfig>[]): string | undefined {
  const counts = new Map<string, number>();
  for (const event of events) {
    const values = [
      event.start,
      event.end,
      event.recurrenceId,
      ...event.exceptionDates,
      ...event.recurrenceDates.flatMap((value) =>
        "kind" in value ? [value] : [value.start, "end" in value ? value.end : undefined],
      ),
    ];
    const zones = new Set(
      values.flatMap((value) => (value?.kind === "zoned" ? [value.zoned.timeZoneId] : [])),
    );
    for (const zone of zones) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let most: string | undefined;
  for (const [zone, count] of counts) {
    if (most === undefined || count > counts.get(most)!) most = zone;
  }
  return most;
}

function keyOf(date: RecurrenceDate | RecurrencePeriod): string {
  return isPeriod(date)
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
 *   the override's zone. For feeds that follow RFC 5545, where RECURRENCE-ID has the type of the
 *   master's DTSTART, the ID stays the same when the master loads.
 * - Intervals: a UTC DTSTART repeats in UTC (`sourceTimeZone: "UTC"`), a zoned one in its zone.
 * - Masters: an event with RRULE, RDATE or EXDATE, or one an override names by UID. DURATION
 *   without DTEND on a timed or floating master becomes `recurrence.duration`, and a DTSTART in a
 *   DST gap keeps its written time as `recurrence.wallStart`. A DTSTART in a gap moves forward by
 *   the gap, as RFC 5545 §3.3.5 says; a series with DTEND in the same zone keeps the length written
 *   between them, so later occurrences keep it, and a single event its exact length, unless the gap
 *   leaves it none.
 * - Outlook's all-day events: with `X-MICROSOFT-CDO-ALLDAYEVENT:TRUE` (unless an extension claims
 *   it), an event written from midnight to a later midnight, or from midnight without DTEND or
 *   DURATION, as older Outlook and Exchange exports write all-day events, is all-day on the dates
 *   written, even when its TZID resolves to no zone. Its series' EXDATE, UNTIL and RECURRENCE-ID
 *   values at midnight are those dates, without an issue, and UTC ones read in the zone of its
 *   DTSTART, or UTC.
 * - Dates: EXDATE, RDATE, UNTIL and RECURRENCE-ID take the kind of the series' first occurrence
 *   through `coerceRecurrenceDate`. A date-only EXDATE excludes the whole day, a date-only UNTIL
 *   lasts through that day, and a date-only RDATE or RECURRENCE-ID on a timed or floating series
 *   is dropped with an issue. On all-day and floating series, UTC times are read in `timeZone`,
 *   which defaults to the zone most of the events' TZIDs resolve to, and zoned ones keep their
 *   written wall time. An RDATE PERIOD stays a period, with both ends converted.
 * - Lengths: an event that DTEND or DURATION make zero-length or negative lasts `minimumDuration`,
 *   30 minutes by default, or one day when all-day.
 * - STATUS:CANCELLED: a cancelled one-off event or master is left out, with the master's
 *   overrides; a cancelled override comes out with `override.cancelled`, which hides its
 *   occurrence.
 * - Duplicates: of usable VEVENTs with the same UID, or UID and RECURRENCE-ID, the highest
 *   SEQUENCE wins, then the later one. An event whose DTSTART or RECURRENCE-ID can't be read is
 *   left out with its issue first, so it can't replace a usable one.
 * - RANGE=THISANDFUTURE (RFC 5545 §3.8.4.4): the occurrence it names and every later one change by
 *   the same difference, as Apple's "this and future" changes mean. The series is split as a
 *   `"following"` edit splits it: it ends before the occurrence, and a new series with the
 *   override's ID, VEVENT and title starts where the override is, with the rest of the rule moved
 *   by the same difference and the override's length. Later EXDATEs, RDATEs and overrides move to
 *   it and keep their own placements, and overrides take the IDs of the occurrences they then
 *   replace: later occurrences are keyed by their new starts, not the feed's RECURRENCE-IDs. On
 *   the first occurrence the whole series changes instead. A cancelled one ends the series there;
 *   when nothing before it is left, the series keeps no occurrence. Either way later overrides
 *   stay, since RFC 5545 leaves instances in separate components alone. One the series can't take,
 *   such as a BYSETPOS rule moved to another day, replaces only the occurrence it names, with an
 *   `unsupported-rule` issue.
 *
 * Bad data becomes `issues`; only invalid options throw, as a `RangeError`.
 */
export function recurringEventsFromIcs<TExtensions extends IcsExtensionsConfig = {}>(
  events: readonly IcsEvent<TExtensions>[],
  options: IcsRecurringEventsOptions = {},
): IcsRecurringEvents<TExtensions> {
  const minimumDuration = minimumDurationOf(options.minimumDuration);
  const timeZone = timeZoneOf(options.timeZone) ?? feedTimeZoneOf(events);
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

  // Masters and one-off events: only those with a usable DTSTART compete, one per UID.
  const intervals = new Map<number, CalendarEventInterval>();
  const masterIndexes = new Map<string, number>();
  events.forEach((event, index) => {
    if (event.recurrenceId !== undefined) return;
    const repeats =
      event.recurrenceRule !== undefined ||
      event.recurrenceDates.length > 0 ||
      event.exceptionDates.length > 0;
    const interval = intervalOf(event, minimumDuration, repeats);
    if (interval === undefined) {
      unresolved(index, "DTSTART", event.start, "the event is skipped");
      return;
    }
    intervals.set(index, interval);
    const kept = masterIndexes.get(event.uid);
    masterIndexes.set(
      event.uid,
      kept === undefined ? index : pick(kept, index, `UID "${event.uid}"`),
    );
  });

  const series = new Map<string, FeedSeries>();
  const cancelledUids = new Set<string>();
  for (const [uid, index] of masterIndexes) {
    const event = events[index]!;
    const first = intervals.get(index)!;
    if (event.status === "CANCELLED") {
      cancelledUids.add(uid);
    } else if (first.kind === "all-day" && flaggedAllDay(event)) {
      // Outlook's all-day series write their dates as midnights, and UTC ones at the midnight of
      // the zone DTSTART was written in.
      const own = zoneOf(event.start) ?? timeZone;
      series.set(uid, { first, midnights: true, ...(own === undefined ? {} : { timeZone: own }) });
    } else {
      series.set(uid, { first, ...(timeZone === undefined ? {} : { timeZone }) });
    }
  }

  // Overrides: only those with a usable DTSTART and RECURRENCE-ID compete, one per occurrence.
  const overrideIndexes = new Map<string, number>();
  const recurrenceIds = new Map<number, RecurrenceDate>();
  events.forEach((event, index) => {
    const value = event.recurrenceId;
    if (value === undefined || cancelledUids.has(event.uid)) return;
    // One with RANGE=THISANDFUTURE starts a series.
    const interval = intervalOf(event, minimumDuration, event.recurrenceRange === "THISANDFUTURE");
    if (interval === undefined) {
      unresolved(index, "DTSTART", event.start, "the override is skipped");
      return;
    }
    intervals.set(index, interval);
    const time = series.get(event.uid);
    let recurrenceId: RecurrenceDate | undefined;
    if (time === undefined) {
      if (value.kind === "unresolved") {
        unresolved(index, "RECURRENCE-ID", value, "the override, which has no series, is skipped");
        return;
      }
      // A flagged all-day override names its occurrence by a midnight, as its series would.
      recurrenceId =
        (interval.kind === "all-day" && flaggedAllDay(event)
          ? midnightDate(value, { first: interval, midnights: true, timeZone: zoneOf(event.start) })
          : undefined) ?? ownRecurrenceId(value, interval);
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
  const overriddenUids = new Set([...keptOverrides].map((index) => events[index]!.uid));

  const recurrenceOf = (index: number, time: FeedSeries): EventRecurrence => {
    const event = events[index]!;
    // One issue per property, for the first value that needs one.
    const keep = <TDate>(property: string, converted: readonly SeriesDate<TDate>[]): TDate[] => {
      const invalid = converted.find((date) => date.invalid !== undefined)?.invalid;
      if (invalid !== undefined) report(index, "invalid-period", invalid, property);
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
  const ranges = new Map<IcsEvent<TExtensions>, number>();
  events.forEach((event, index) => {
    const title = event.summary ?? "";
    if (event.recurrenceId !== undefined) {
      if (!keptOverrides.has(index)) return;
      const interval = intervals.get(index)!;
      if (event.recurrenceRange === "THISANDFUTURE") ranges.set(event, index);
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
    const time = series.get(event.uid);
    if (time === undefined || masterIndexes.get(event.uid) !== index) return;
    const isMaster =
      event.recurrenceRule !== undefined ||
      event.recurrenceDates.length > 0 ||
      event.exceptionDates.length > 0 ||
      overriddenUids.has(event.uid);
    const recurrence = isMaster ? recurrenceOf(index, time) : undefined;
    output.push({
      ...time.first,
      data: event,
      id: event.uid,
      ...(recurrence === undefined ? {} : { recurrence }),
      title,
    });
  });

  const { events: bridged, failures } =
    ranges.size === 0
      ? { events: output, failures: new Map<IcsEvent<TExtensions>, string>() }
      : applyThisAndFuture(output, [...ranges.keys()], timeZone ?? "UTC");
  for (const [event, reason] of failures) {
    report(
      ranges.get(event)!,
      "unsupported-rule",
      `RANGE=THISANDFUTURE can't apply: ${reason}. The override replaces only the occurrence it names.`,
      "RECURRENCE-ID",
    );
  }
  return { events: bridged, issues: issues.sort((left, right) => left.index - right.index) };
}
