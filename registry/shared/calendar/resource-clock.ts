import type { CalendarEnvironmentBase } from "@moltenship/calendar";

/** The formats of a resource's own clock, in the calendar's locale. */
export interface ResourceClock {
  readonly offset: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
  readonly timeZone: string;
}

/** A resource's clock; `null` for one without a time zone, or with one the browser doesn't know. */
export function resourceClock(
  locale: CalendarEnvironmentBase["locale"],
  timeZone: string | undefined,
): ResourceClock | null {
  if (timeZone === undefined) return null;
  try {
    return {
      offset: new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }),
      timeZone,
    };
  } catch {
    // An unknown time zone, which the root reports as a diagnostic.
    return null;
  }
}

/**
 * A resource's local time and UTC offset at `now`, "3:05 PM GMT+1", while its clock differs from
 * the display time zone's; `null` for a resource on the display clock.
 */
export function resourceTimeText(
  clock: ResourceClock,
  now: Temporal.Instant,
  displayTimeZone: string,
): string | null {
  const offsetIn = (zone: string) => now.toZonedDateTimeISO(zone).offsetNanoseconds;
  if (offsetIn(clock.timeZone) === offsetIn(displayTimeZone)) return null;
  const offset = clock.offset.formatToParts(now).find(({ type }) => type === "timeZoneName");
  return `${clock.time.format(now)} ${offset?.value ?? ""}`.trim();
}

/** What screen readers hear before the time: "local time", after a comma when it follows a name. */
export function localTimeWords(separator: boolean): string {
  return separator ? ", local time " : "local time ";
}
