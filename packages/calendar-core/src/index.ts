export { isEventId, isResourceId } from "./ids.ts";
export type { CalendarEntityId, EventId, ResourceId } from "./ids.ts";

export {
  createCanonicalEventAdapter,
  defineEventAdapter,
  validateCalendarEvent,
  validateCalendarEventInterval,
} from "./events.ts";
export type {
  AllDayCalendarEvent,
  AllDayCalendarEventInterval,
  CalendarEvent,
  CalendarEventBase,
  CalendarEventContractValidation,
  CalendarEventInterval,
  CalendarEventIntervalComparators,
  CalendarEventIntervalOf,
  CalendarEventValidationIssue,
  EventAdapter,
  FloatingCalendarEvent,
  FloatingCalendarEventInterval,
  TimedCalendarEvent,
  TimedCalendarEventInterval,
  ValidatedCalendarEvent,
  ValidatedCalendarEventInterval,
} from "./events.ts";

export { createEventSnapshot, createEventSnapshotCache } from "./snapshots/event-snapshot.ts";
export { InvalidCalendarEventSnapshotError } from "./snapshots/types.ts";
export type {
  CalendarEventInput,
  CalendarEventSource,
  EventAdapterAccessor,
  EventSnapshot,
  EventSnapshotCache,
  EventSnapshotIssue,
  EventSnapshotOptions,
  EventSnapshotQueryCacheStatistics,
  EventSnapshotQueryOptions,
  InvalidCalendarEventPolicy,
  NormalizedAllDayCalendarEvent,
  NormalizedCalendarEvent,
  NormalizedFloatingCalendarEvent,
  NormalizedTimedCalendarEvent,
} from "./snapshots/types.ts";

export type { CalendarResource } from "./resources.ts";
export type {
  CalendarDirection,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarNowSource,
  CalendarWeekRules,
  IsoDayOfWeek,
} from "./environment.ts";

export type {
  CalendarViewDefinition,
  CalendarViewStrategy,
  ViewNavigationDirection,
} from "./views.ts";

export type {
  CalendarChangeCause,
  CalendarEventChange,
  CalendarEventChangeHandler,
  CalendarEventChangeProposal,
  CalendarEventPlacement,
  CalendarPolicy,
  CalendarPolicyContext,
  CalendarTransactionState,
  CalendarTransactionStateChange,
  CalendarValidationIssue,
  CalendarValidationResult,
  NonEmptyReadonlyArray,
} from "./transactions.ts";
