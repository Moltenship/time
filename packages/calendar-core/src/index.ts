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

export { resolveViewInstantRange } from "./views";
export type { CalendarViewProjectionInput, CalendarViewStrategy } from "./views";

export { navigateTimeGrid, timeGridRange, timeGridTitle } from "./views/time-grid/range";
export type { TimeGridSpan } from "./views/time-grid/range";
export { timeGridColumns } from "./views/time-grid/columns";
export type { TimeGridBand, TimeGridColumn } from "./views/time-grid/columns";
export { timedFragmentBox, timeGridDateTimeAt, timeGridPosition } from "./views/time-grid/geometry";
export type { TimeGridPointOptions, TimeGridPosition } from "./views/time-grid/geometry";
export { layoutTimeGrid } from "./views/time-grid/layout";
export type { TimeGridEventLayout } from "./views/time-grid/layout";
export type { TimedOverlapOptions } from "./layout/timed-overlap";

export { createEventTransactions } from "./transactions/event-transactions";
export type { EventTransactions } from "./transactions/event-transactions";
export { applyEventOverlay } from "./transactions/overlay";
export {
  createEventPlacement,
  moveEventPlacement,
  resizeEventPlacement,
  toAllDayPlacement,
  toTimedPlacement,
} from "./transactions/placement";
export type {
  CalendarChangeCause,
  CalendarEventChange,
  CalendarEventChangeHandler,
  CalendarEventCreateChange,
  CalendarEventDeleteChange,
  CalendarEventPlacement,
  CalendarEventPlacementInput,
  CalendarEventProposal,
  CalendarEventUpdateChange,
  CalendarPendingPlacements,
  CalendarTransactionContext,
  CalendarTransactionResult,
} from "./transactions/types";
export type { CalendarWallClockDelta } from "./transactions/wall-clock";

export { boundsPolicy } from "./policies/bounds";
export { minimumDurationPolicy } from "./policies/minimum-duration";
export { readOnlyPolicy } from "./policies/read-only";
export { snapPolicy } from "./policies/snap";
export type {
  CalendarPolicy,
  CalendarPolicyContext,
  CalendarPolicyDecision,
} from "./policies/types";
