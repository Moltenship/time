import type { CalendarEventInterval } from "@moltenship/calendar-core";

import { coerceRecurrenceDate } from "../dates";
import { RecurrenceRuleError } from "../errors";
import type {
  RecurrenceDate,
  RecurrenceRule,
  RecurrenceRuleExpansion,
  RecurrenceRuleStart,
  RecurrenceRuleWindow,
} from "../types";
import {
  floorDiv,
  SECONDS_PER_DAY,
  subsecond,
  toPlainDate,
  toPlainDateTime,
  wallSeconds,
  weekday,
} from "./calendar";
import { Candidates, END, NOTHING, periodOf } from "./candidates";
import { offsetChangeBefore, WallClock } from "./clock";
import { compileRule } from "./compile";

export const DEFAULT_MAX_ITERATIONS = 100_000;

const NANOSECONDS_PER_SECOND = 1_000_000_000n;

const KINDS = {
  "all-day": "Temporal.PlainDate",
  floating: "Temporal.PlainDateTime",
  timed: "Temporal.Instant",
} as const;

function floorSeconds(nanoseconds: bigint): number {
  const seconds = nanoseconds / NANOSECONDS_PER_SECOND;
  return Number(
    nanoseconds < 0n && seconds * NANOSECONDS_PER_SECOND !== nanoseconds ? seconds - 1n : seconds,
  );
}

const ceilSeconds = (nanoseconds: bigint) => -floorSeconds(-nanoseconds);

/** A date as nanoseconds in the series' time: since the epoch for timed series, wall time otherwise. */
function nanosecondsOf(date: RecurrenceDate, first: CalendarEventInterval, name: string): bigint {
  if (first.kind === "timed" && date instanceof Temporal.Instant) return date.epochNanoseconds;
  if (first.kind === "all-day" && date instanceof Temporal.PlainDate) {
    return BigInt(wallSeconds(date)) * NANOSECONDS_PER_SECOND;
  }
  if (first.kind === "floating" && date instanceof Temporal.PlainDateTime) {
    return BigInt(wallSeconds(date)) * NANOSECONDS_PER_SECOND + BigInt(subsecond(date));
  }
  throw new RangeError(
    `${name} must be a ${KINDS[first.kind]}, like the first start of this ${first.kind} series; got ${String(date)}.`,
  );
}

/**
 * The starts of a rule's occurrences inside `window`, strictly increasing, for every part of
 * RFC 5545: each FREQ, every BY part with §3.3.10's expand and limit table, BYSETPOS, WKST, COUNT
 * and UNTIL.
 *
 * - The first occurrence is always the first start and counts toward COUNT, even when the rule
 *   wouldn't produce it or UNTIL is earlier. Rule dates at or before it are left out.
 * - Timed series repeat on the wall clock of `first.sourceTimeZone`, or UTC, every FREQ included:
 *   an HOURLY rule keeps to the clock's hours. Each wall time resolves as RFC 5545 §3.3.5 says
 *   (Temporal's `compatible`): one in a DST gap moves forward by the gap and counts, and a repeated
 *   one takes its first instant, so a repeated hour happens once. Starts that resolve to the same
 *   instant, as gap times moving onto later ones do, appear once (§3.8.5.3). `first.wallStart` is
 *   where the series repeats from when its first start was written in a gap.
 * - Dates no calendar has, such as 30 February or the 5th Friday of a month with four, are
 *   skipped and don't count.
 * - Without COUNT, the loop skips ahead to `window.from` instead of stepping from the first start.
 *
 * - COUNT with UNTIL, which some feeds write, ends at whichever comes first. BYHOUR, BYMINUTE and
 *   BYSECOND are ignored on all-day series, as RFC 5545 §3.3.10 says. UNTIL of another kind is
 *   brought in by `coerceRecurrenceDate`, which reads an instant on an all-day or floating series
 *   in UTC; coerce it first to read it in another zone.
 * - Dates come out in the ISO calendar, and months and years step in it whatever the start's.
 * - `maxIterations` counts steps: each candidate start looked at, and each period visited that
 *   gives none. Periods skipped, to reach `from` or the next day, hour, minute or second the BY
 *   parts allow, aren't visited. A rule whose day parts meet on no date, such as 30 February, ends
 *   after its first occurrence.
 *
 * Throws a `RecurrenceRuleError` for a rule it can't expand or a `sourceTimeZone` that isn't a
 * time zone, and a `RangeError` for window dates of another kind than `first` or a
 * `maxIterations` that isn't a positive integer.
 */
export function expandRecurrenceRule(
  rule: RecurrenceRule,
  first: RecurrenceRuleStart,
  window: RecurrenceRuleWindow = {},
): RecurrenceRuleExpansion {
  const maxIterations = window.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError(`maxIterations must be a positive integer; got ${maxIterations}.`);
  }

  // Times are whole seconds, since the epoch for timed series and of wall time otherwise, in the
  // ISO calendar. Every occurrence shares the first start's fraction of a second.
  let fields: Temporal.PlainDate | Temporal.PlainDateTime;
  let fraction = 0;
  let start: number;
  let wallStart: number;
  let timeZone: string | undefined;
  if (first.kind === "timed") {
    timeZone = first.sourceTimeZone ?? "UTC";
    let zoned: Temporal.ZonedDateTime;
    try {
      zoned = first.start.toZonedDateTimeISO(timeZone);
    } catch {
      throw new RecurrenceRuleError("invalid-time-zone", `${timeZone} isn't a time zone.`);
    }
    // A written start left behind after the start moved no longer resolves to it.
    const written = first.wallStart?.withCalendar("iso8601");
    fields =
      written !== undefined &&
      written
        .toZonedDateTime(timeZone, { disambiguation: "compatible" })
        .toInstant()
        .equals(first.start)
        ? written
        : zoned.toPlainDateTime();
    fraction = subsecond(zoned);
    start = Number((first.start.epochNanoseconds - BigInt(fraction)) / NANOSECONDS_PER_SECOND);
    wallStart = wallSeconds(fields);
  } else {
    fields = first.start;
    fraction = first.kind === "floating" ? subsecond(first.start) : 0;
    start = wallStart = wallSeconds(fields);
  }

  // Every kind converts for UNTIL; a date `coerceRecurrenceDate` left alone fails below.
  const until = rule.until && (coerceRecurrenceDate(rule.until, first, "until") ?? rule.until);

  const iso = fields.withCalendar("iso8601");
  const compiled = compileRule(rule, {
    allDay: first.kind === "all-day",
    day: iso.day,
    hour: iso instanceof Temporal.PlainDateTime ? iso.hour : 0,
    minute: iso instanceof Temporal.PlainDateTime ? iso.minute : 0,
    month: iso.month,
    second: iso instanceof Temporal.PlainDateTime ? iso.second : 0,
    weekday: weekday(floorDiv(wallStart, SECONDS_PER_DAY)),
  });

  const bound = (date: RecurrenceDate | undefined, name: string) =>
    date === undefined ? undefined : nanosecondsOf(date, first, name) - BigInt(fraction);
  const fromBound = bound(window.from, "window.from");
  const beforeBound = bound(window.before, "window.before");
  const untilBound = bound(until, "UNTIL");
  const from = fromBound === undefined ? undefined : ceilSeconds(fromBound);
  const before = beforeBound === undefined ? undefined : ceilSeconds(beforeBound);
  const last = untilBound === undefined ? undefined : floorSeconds(untilBound);

  // The latest wall time that can still resolve inside UNTIL and `before`: that of the last time
  // they allow, later by an offset change that a repeated time could resolve back across.
  let lastWall = Number.POSITIVE_INFINITY;
  for (const time of [last, before === undefined ? undefined : before - 1]) {
    if (time === undefined) continue;
    if (timeZone === undefined) {
      lastWall = Math.min(lastWall, time);
      continue;
    }
    const instant = Temporal.Instant.fromEpochMilliseconds(time * 1000);
    lastWall = Math.min(
      lastWall,
      wallSeconds(instant.toZonedDateTimeISO(timeZone)) + offsetChangeBefore(instant, timeZone),
    );
  }

  const toDate = (time: number): RecurrenceDate => {
    if (first.kind === "all-day") return toPlainDate(time);
    if (first.kind === "floating") return toPlainDateTime(time, fraction);
    return fraction === 0
      ? Temporal.Instant.fromEpochMilliseconds(time * 1000)
      : Temporal.Instant.fromEpochNanoseconds(
          BigInt(time) * NANOSECONDS_PER_SECOND + BigInt(fraction),
        );
  };

  if (before !== undefined && start >= before) return { dates: [], truncated: false };
  const dates: RecurrenceDate[] = [];
  if (from === undefined || start >= from) {
    dates.push(first.kind === "timed" ? first.start : toDate(start));
  }
  let latest = start;
  let produced = 1;
  if (compiled.count === 1) return { dates, truncated: false };

  /** Takes the next start in time order; false once UNTIL, `before` or COUNT ends the series. */
  const take = (time: number): boolean => {
    if (time <= latest) return true;
    if ((last !== undefined && time > last) || (before !== undefined && time >= before)) {
      return false;
    }
    latest = time;
    produced += 1;
    if (from === undefined || time >= from) dates.push(toDate(time));
    return compiled.count === undefined || produced < compiled.count;
  };

  // Without COUNT nothing before `from` matters, so start at the period that holds it. A gap time
  // up to one offset change earlier can move forward into the window.
  const origin = periodOf(compiled, wallStart);
  let period = origin;
  if (compiled.count === undefined && window.from !== undefined && from !== undefined) {
    const fromWall =
      timeZone === undefined
        ? from
        : wallSeconds((window.from as Temporal.Instant).toZonedDateTimeISO(timeZone)) -
          offsetChangeBefore(window.from as Temporal.Instant, timeZone);
    const target = periodOf(compiled, fromWall);
    if (target > origin) {
      period = origin + floorDiv(target - origin, compiled.interval) * compiled.interval;
    }
  }

  const candidates = new Candidates(compiled, origin, period);
  const clock = timeZone === undefined ? undefined : new WallClock(timeZone);
  // Gap times that moved forward, waiting until no later wall time can resolve before them.
  const waiting: { readonly time: number; readonly wall: number }[] = [];
  let steps = 0;

  for (;;) {
    const wall = candidates.next();
    if (wall === END) break;
    const nothing = wall === NOTHING;
    if ((nothing ? candidates.periodStart : wall) > lastWall) break;

    let time = wall;
    let moved = false;
    if (clock !== undefined && !nothing) {
      time = clock.resolve(wall);
      moved = clock.moved;
      while (
        waiting.length > 0 &&
        (waiting[0]!.wall <= wall || (!moved && waiting[0]!.time <= time))
      ) {
        if (!take(waiting.shift()!.time)) return { dates, truncated: false };
      }
    }
    if (
      !nothing &&
      !moved &&
      ((last !== undefined && time > last) || (before !== undefined && time >= before))
    ) {
      break;
    }

    if (steps >= maxIterations) return { dates, truncated: true };
    steps += 1;
    if (nothing) continue;
    if (moved) waiting.push({ time, wall: clock!.resolvedWall });
    else if (!take(time)) return { dates, truncated: false };
  }

  for (const { time } of waiting) if (!take(time)) break;
  return { dates, truncated: false };
}
