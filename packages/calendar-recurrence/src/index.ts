export { coerceRecurrenceDate } from "./dates";
export type { CoerceRecurrenceDateOptions, RecurrenceDateRole } from "./dates";
export { RecurrenceRuleError } from "./errors";
export type { RecurrenceRuleErrorCode } from "./errors";
export { occurrenceId, parseOccurrenceId, recurrenceKey } from "./occurrence-id";
export { DEFAULT_MAX_ITERATIONS, expandRecurrenceRule } from "./rule/expand";
export {
  formatRecurrenceRule,
  parseRecurrenceRule,
  recurrenceRuleFromIcs,
  recurrenceRuleToIcs,
} from "./rule/text";
export type { RecurrenceRuleTextIssue, RecurrenceRuleTextResult } from "./rule/text";

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
  RecurrencePeriod,
  RecurrenceRule,
  RecurrenceRuleExpansion,
  RecurrenceRuleStart,
  RecurrenceRuleWindow,
  RecurringCalendarEvent,
} from "./types";

// Series edits (#49)
export {
  applyRecurrenceEdit,
  isRecurringChange,
  recurrenceEditScopes,
  recurrenceOverrideEdit,
  resolveRecurrenceEdit,
} from "./edits";
export type {
  ApplyRecurrenceEditOptions,
  RecurrenceEdit,
  RecurrenceEditRejection,
  RecurrenceEditRejectionReason,
  RecurrenceEditScope,
  RecurrenceEventEdit,
  RecurrenceKeyShift,
  RecurrenceNewSeries,
  RecurrenceOccurrenceChange,
  RecurrenceOrdinalShift,
  RecurrenceOverrideRekey,
  RecurrenceOverrideWrite,
  RecurrenceOverridesRule,
  RecurrenceSeriesEdit,
  RecurrenceSeriesWrite,
  RecurringOccurrenceChange,
  ResolveRecurrenceEditOptions,
} from "./edits";
