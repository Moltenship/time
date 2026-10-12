export { coerceRecurrenceDate } from "./dates";
export type { CoerceRecurrenceDateOptions, RecurrenceDateRole } from "./dates";
export { occurrenceId, parseOccurrenceId, recurrenceKey } from "./occurrence-id";
export { DEFAULT_MAX_ITERATIONS, expandRecurrenceRule } from "./rule/expand";

// Series: expansion and adapters.
export {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
} from "./series";

// ICS bridge: parsed VEVENTs as masters, overrides and one-off events.
export { recurringEventsFromIcs } from "./ics";
export type {
  IcsRecurrenceIssue,
  IcsRecurrenceIssueCode,
  IcsRecurringEvents,
  IcsRecurringEventsOptions,
} from "./ics";

export type {
  EventRecurrence,
  OccurrenceExpander,
  OccurrenceExpanderOptions,
  OccurrenceExpansion,
  OccurrenceRange,
  OccurrenceRecurrence,
  RecurrenceAdapter,
  RecurrenceAdapters,
  RecurrenceDate,
  RecurrenceIssue,
  RecurrenceOccurrence,
  RecurrenceOverride,
  RecurrenceRule,
  RecurrenceRuleExpansion,
  RecurrenceRuleStart,
  RecurrenceRuleWindow,
  RecurringCalendarEvent,
} from "./types";
