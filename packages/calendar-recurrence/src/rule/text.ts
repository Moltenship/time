import {
  decodeIcsValue,
  encodeIcsValue,
  type IcsDateValue,
  type IcsIssueCode,
  type IcsRecurrenceRule,
  type IcsValueWarning,
} from "@moltenship/ics";

import { recurrenceDateOf } from "../internal/dates";
import type { RecurrenceDate, RecurrenceRule } from "../types";

/** A problem `parseRecurrenceRule` found. Errors leave no rule; warnings keep a best-effort one. */
export interface RecurrenceRuleTextIssue {
  /** The code `@moltenship/ics` reports it under, such as `invalid-value` or `unsupported`. */
  readonly code: IcsIssueCode;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface RecurrenceRuleTextResult {
  readonly issues: readonly RecurrenceRuleTextIssue[];
  /** Absent when the text holds no usable rule, such as one without FREQ. */
  readonly rule?: RecurrenceRule;
}

/** `RRULE:`, with any parameters, and the space some writers leave after the colon. */
const RRULE_PREFIX = /^RRULE(?:;[^:]*)?:\s*/i;

function quote(text: string): string {
  return JSON.stringify(text.length > 48 ? `${text.slice(0, 45)}...` : text);
}

function failed(code: IcsIssueCode, message: string): RecurrenceRuleTextResult {
  return { issues: [{ code, message, severity: "error" }] };
}

function warning({ code, message }: IcsValueWarning): RecurrenceRuleTextIssue {
  return { code, message, severity: "warning" };
}

/**
 * Reads an RRULE, as a RECUR value (`FREQ=WEEKLY;BYDAY=MO`) or a content line
 * (`RRULE:FREQ=WEEKLY;BYDAY=MO`, as the Google Calendar API gives it, parameters allowed). Never throws: text without a
 * usable rule gives an error and no rule, and parts read leniently, such as an invalid BYDAY that
 * is dropped, give warnings.
 */
export function parseRecurrenceRule(text: string): RecurrenceRuleTextResult {
  const trimmed = text.trim();
  const value = trimmed.replace(RRULE_PREFIX, "");
  // A RECUR value never holds a colon, so one means another property, such as EXDATE or RDATE.
  if (value.includes(":")) {
    return failed(
      "invalid-value",
      `${quote(trimmed)} isn't an RRULE; expected one such as FREQ=WEEKLY or RRULE:FREQ=WEEKLY`,
    );
  }

  const decoded = decodeIcsValue("RECUR", value);
  if (!decoded.ok) return failed("invalid-value", decoded.message);
  const result = recurrenceRuleFromIcs(decoded.value);
  return { ...result, issues: [...(decoded.warnings ?? []).map(warning), ...result.issues] };
}

/**
 * The RECUR value of a rule, without the `RRULE:` prefix, parts in RFC 5545's order. An `Instant`
 * UNTIL is written in UTC. iCalendar has no fractional seconds, so UNTIL is rounded down to the
 * second; as UNTIL is inclusive, every whole-second occurrence stays. Throws a `RangeError` for an
 * UNTIL outside the years 0 to 9999.
 */
export function formatRecurrenceRule(rule: RecurrenceRule): string {
  return encodeIcsValue("RECUR", recurrenceRuleToIcs(rule));
}

// iCalendar dates are Gregorian, and the encoder writes the fields of the date's own calendar.
function recurrenceDateToIcs(date: RecurrenceDate): IcsDateValue {
  if (date instanceof Temporal.PlainDate) {
    return { date: date.withCalendar("iso8601"), kind: "date" };
  }
  if (date instanceof Temporal.PlainDateTime) {
    return { kind: "floating", wallTime: date.withCalendar("iso8601") };
  }
  return { instant: date, kind: "utc" };
}

/**
 * A rule from `@moltenship/ics`, such as `IcsEvent.recurrenceRule`, with UNTIL as a Temporal value:
 * a DATE as a `PlainDate`, a UTC or zoned DATE-TIME as an `Instant` and a floating one as a
 * `PlainDateTime`. An UNTIL whose TZID resolved to no time zone is an error, since dropping it
 * would make the series endless. COUNT with UNTIL, which some feeds write, is kept; the series ends
 * at whichever comes first.
 */
export function recurrenceRuleFromIcs(rule: IcsRecurrenceRule): RecurrenceRuleTextResult {
  const { until, ...rest } = rule;
  if (until === undefined) return { issues: [], rule: rest };
  if (until.kind === "unresolved") {
    return failed(
      "unknown-time-zone",
      `UNTIL's TZID ${quote(until.tzid)} resolves to no time zone, so the rule's end is unknown`,
    );
  }
  return { issues: [], rule: { ...rest, until: recurrenceDateOf(until) } };
}

/** A rule as `@moltenship/ics` writes it: UNTIL as a DATE, a UTC DATE-TIME or a floating one. */
export function recurrenceRuleToIcs(rule: RecurrenceRule): IcsRecurrenceRule {
  const { until, ...rest } = rule;
  return until === undefined ? rest : { ...rest, until: recurrenceDateToIcs(until) };
}
