import type { IcsDateValue, IcsEvent } from "../types";

// The wall time a value shows: a date at midnight, a UTC time in UTC.
function wallTimeOf(value: IcsDateValue): Temporal.PlainDateTime {
  switch (value.kind) {
    case "date":
      return value.date.toPlainDateTime();
    case "utc":
      return value.instant.toZonedDateTimeISO("UTC").toPlainDateTime();
    case "zoned":
      return value.zoned.toPlainDateTime();
    default:
      return value.wallTime;
  }
}

function instantOf(value: IcsDateValue): Temporal.Instant | undefined {
  if (value.kind === "utc") return value.instant;
  return value.kind === "zoned" ? value.zoned.toInstant() : undefined;
}

// `value` in the start's kind: the same instant where both have one, else the same wall time, read
// in the start's zone (or UTC).
function inKindOf(start: IcsDateValue, value: IcsDateValue): IcsDateValue {
  const sameZone =
    value.kind !== "zoned" ||
    (start.kind === "zoned" && value.zoned.timeZoneId === start.zoned.timeZoneId);
  if (value.kind === start.kind && sameZone) return value;
  const instant = instantOf(value);
  switch (start.kind) {
    case "date":
      return { date: wallTimeOf(value).toPlainDate(), kind: "date" };
    case "utc":
      return {
        instant: instant ?? wallTimeOf(value).toZonedDateTime("UTC").toInstant(),
        kind: "utc",
      };
    case "zoned": {
      const timeZone = start.zoned.timeZoneId;
      if (instant !== undefined) {
        const zoned = instant.toZonedDateTimeISO(timeZone);
        return { kind: "zoned", tzid: start.tzid, wallTime: zoned.toPlainDateTime(), zoned };
      }
      const wallTime = wallTimeOf(value);
      return {
        kind: "zoned",
        tzid: start.tzid,
        wallTime,
        zoned: wallTime.toZonedDateTime(timeZone),
      };
    }
    default:
      return { ...start, wallTime: wallTimeOf(value) };
  }
}

// The start plus a duration, in the start's kind.
function addDuration(start: IcsDateValue, duration: Temporal.Duration): IcsDateValue {
  switch (start.kind) {
    case "date": {
      const days = duration.round({
        largestUnit: "day",
        relativeTo: start.date,
        roundingMode: "expand",
        smallestUnit: "day",
      });
      return { date: start.date.add(days), kind: "date" };
    }
    case "utc":
      // Through a UTC ZonedDateTime, because an Instant takes no days.
      return {
        instant: start.instant.toZonedDateTimeISO("UTC").add(duration).toInstant(),
        kind: "utc",
      };
    case "zoned": {
      const zoned = start.zoned.add(duration);
      return { kind: "zoned", tzid: start.tzid, wallTime: zoned.toPlainDateTime(), zoned };
    }
    default:
      return { ...start, wallTime: start.wallTime.add(duration) };
  }
}

/**
 * The event's effective end: DTEND, else DTSTART + DURATION, else RFC 5545's default (the next day
 * for a date, the start itself for a date-time). Always the same kind as the start: a DTEND of
 * another kind is converted, keeping its instant where both have one, else its wall time.
 *
 * DURATION on a zoned start adds days as calendar days and hours as exact time (RFC 5545 §3.3.6).
 * On a date start it adds whole days: a time part, which RFC 5545 doesn't allow there, rounds up
 * to whole days, so the end covers it (`PT1H` ends the next day).
 */
export function getEventEnd(event: Pick<IcsEvent, "duration" | "end" | "start">): IcsDateValue {
  const { duration, end, start } = event;
  if (end !== undefined) return inKindOf(start, end);
  if (duration !== undefined) return addDuration(start, duration);
  return start.kind === "date" ? { date: start.date.add({ days: 1 }), kind: "date" } : start;
}
