// #region first
import { expandRecurrenceRule, parseRecurrenceRule } from "@moltenship/calendar-recurrence";

/** The starts of a meeting that repeats by `rrule`, a rule as iCalendar writes it. */
export function startsOf(first: Temporal.ZonedDateTime, rrule: string): string[] {
  // Never throws: text without a usable rule gives no rule, and says why in `issues`.
  const { rule } = parseRecurrenceRule(rrule);
  if (rule === undefined) return [];

  const { dates } = expandRecurrenceRule(rule, {
    kind: "timed",
    start: first.toInstant(),
    end: first.add({ minutes: 30 }).toInstant(),
    // The series repeats on this zone's wall clock.
    sourceTimeZone: first.timeZoneId,
  });
  return dates.map((date) => date.toString());
}

export const mondays = startsOf(
  Temporal.ZonedDateTime.from("2026-10-19T09:00[Europe/Berlin]"),
  "FREQ=WEEKLY;BYDAY=MO;COUNT=3",
);
// #endregion first
