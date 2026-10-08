/** Stable absolute identity for maps, caches, and render models. */
export function instantKey(instant: Temporal.Instant): string {
  return `instant:${instant.epochNanoseconds}`;
}

/** Stable calendar-date identity; ISO dates have no calendar annotation. */
export function plainDateKey(date: Temporal.PlainDate): string {
  return `date:${date.toString()}`;
}

/** Stable local date-time identity with nanosecond precision. */
export function plainDateTimeKey(dateTime: Temporal.PlainDateTime): string {
  return `date-time:${dateTime.toString({ smallestUnit: "nanosecond" })}`;
}

/**
 * Validates an identifier and normalizes its case. Aliases such as `Asia/Calcutta` and
 * `Asia/Kolkata` deliberately stay distinct: engines disagree on which one is primary, and keys
 * must not change between a server and a browser.
 */
function timeZoneIdentifier(timeZone: string): string {
  return new globalThis.Temporal.ZonedDateTime(0n, timeZone).timeZoneId;
}

export function zonedDayKeyForTimeZoneId(date: Temporal.PlainDate, timeZoneId: string): string {
  return `${plainDateKey(date)}|time-zone:${timeZoneId}`;
}

export function zonedWallTimeKeyForTimeZoneId(
  dateTime: Temporal.PlainDateTime,
  timeZoneId: string,
): string {
  return `${plainDateTimeKey(dateTime)}|time-zone:${timeZoneId}`;
}

/** Stable identity for one nominal date in one explicit timezone. */
export function zonedDayKey(date: Temporal.PlainDate, timeZone: string): string {
  return zonedDayKeyForTimeZoneId(date, timeZoneIdentifier(timeZone));
}

/** Stable wall-coordinate identity. It deliberately does not identify a fold occurrence. */
export function zonedWallTimeKey(dateTime: Temporal.PlainDateTime, timeZone: string): string {
  return zonedWallTimeKeyForTimeZoneId(dateTime, timeZoneIdentifier(timeZone));
}
