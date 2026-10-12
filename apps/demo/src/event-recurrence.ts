import type { RecurrenceDate } from "@moltenship/calendar-recurrence";

import type { DemoOccurrence } from "./calendar";
import { describeRule } from "./repeat";

/** A series date's day in `timeZone`, where the series repeats. */
export function dateOf(date: RecurrenceDate, timeZone: string): Temporal.PlainDate {
  if (date instanceof Temporal.Instant) return date.toZonedDateTimeISO(timeZone).toPlainDate();
  return date instanceof Temporal.PlainDateTime ? date.toPlainDate() : date;
}

/**
 * How an occurrence repeats, in words: its series' rule, such as "Weekly on Monday", and whether
 * this occurrence was changed on its own. `undefined` for a one-off event.
 */
export function describeOccurrenceRecurrence(
  { recurrence }: DemoOccurrence,
  timeZone: string,
  locale: Intl.LocalesArgument,
): { readonly changed: boolean; readonly rule: string } | undefined {
  if (recurrence === undefined) return undefined;
  const { override, recurrenceId, series } = recurrence;
  const rule = series?.recurrence?.rule;
  const seriesTimeZone = (series?.kind === "timed" ? series.sourceTimeZone : undefined) ?? timeZone;
  return {
    changed: override !== undefined,
    rule:
      rule === undefined
        ? "Repeating event"
        : describeRule(rule, dateOf(recurrenceId, seriesTimeZone), seriesTimeZone, locale),
  };
}
