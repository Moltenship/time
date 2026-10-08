export { isEventId, isResourceId } from "./ids";
export type { CalendarEntityId, EventId, ResourceId } from "./ids";

export {
  createCanonicalEventAdapter,
  defineEventAdapter,
  validateCalendarEvent,
  validateCalendarEventInterval,
} from "./events";
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
} from "./events";

export { createEventSnapshot, createEventSnapshotCache } from "./snapshots/event-snapshot";
export { InvalidCalendarEventSnapshotError } from "./snapshots/types";
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
} from "./snapshots/types";

export { queryVisibleEvents, visibleInstantRange } from "./projection/visible-events";
export { splitEventsByDay } from "./projection/day-fragments";
export type { EventDayFragment } from "./projection/day-fragments";

export { layoutDayGridRow, limitDayGridLanes } from "./layout/day-grid";
export type { DayGridOverflow, DayGridRow, DayGridSegment } from "./layout/day-grid";

export { getMonthRange, getMonthTitle, navigateMonth, projectMonth } from "./views/month/month";
export type {
  MonthDay,
  MonthProjection,
  MonthProjectionInput,
  MonthWeek,
} from "./views/month/month";

export { getListRange, getListTitle, navigateList, projectList } from "./views/list/list";
export type {
  ListDay,
  ListItem,
  ListProjection,
  ListProjectionInput,
  ListViewOptions,
} from "./views/list/list";

export type { CalendarResource } from "./resources";
export type {
  CalendarDirection,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarNowSource,
  CalendarWeekRules,
  IsoDayOfWeek,
} from "./environment";

export type {
  CalendarViewDefinition,
  CalendarViewStrategy,
  ViewNavigationDirection,
} from "./views";

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
} from "./transactions";
