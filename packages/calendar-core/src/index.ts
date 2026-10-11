export { isAnnotationId, isEventId, isResourceId } from "./ids";
export type { AnnotationId, CalendarEntityId, EventId, ResourceId } from "./ids";

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
export { eventDateRanges, splitEventsByDay } from "./projection/day-fragments";
export type { EventDayFragment, LocalDateRange } from "./projection/day-fragments";

export { layoutDayGridRow, limitDayGridLanes } from "./layout/day-grid";
export type { DayGridOverflow, DayGridRow, DayGridSegment } from "./layout/day-grid";

export {
  getMonthRange,
  getMonthTitle,
  navigateMonth,
  projectMonth,
  projectMonthWeeks,
} from "./views/month/month";
export {
  scrollingMonthAnchor,
  scrollingMonthOf,
  scrollingMonthStrategy,
} from "./views/month/scrolling";
export type { MonthDay, MonthProjection, MonthWeek } from "./views/month/month";

export { getListRange, getListTitle, navigateList, projectList } from "./views/list/list";
export type { ListDay, ListItem, ListProjection, ListViewOptions } from "./views/list/list";

export { createAnnotationSnapshot } from "./annotations/snapshot";
export { summarizeAnnotationMarks } from "./annotations/summary";
export type { AnnotationSourceSummary } from "./annotations/summary";
export { projectTimeGridAnnotations } from "./annotations/time-grid";
export type { TimeGridAnnotationGeometry, TimeGridAnnotationMark } from "./annotations/time-grid";
export type {
  AnnotationSnapshot,
  AnnotationSnapshotIssue,
  CalendarAnnotation,
  CalendarAnnotationSource,
} from "./annotations/types";

export { createAvailabilitySnapshot } from "./availability/snapshot";
export type { AvailabilitySnapshotInput } from "./availability/snapshot";
export {
  closedDates,
  projectTimeGridAvailability,
  projectTimelineAvailability,
} from "./availability/projection";
export type { ClosedDate } from "./availability/projection";
export type {
  AvailabilityException,
  AvailabilityHours,
  AvailabilityIssue,
  AvailabilityRule,
  AvailabilitySchedule,
  AvailabilitySnapshot,
  CalendarAvailability,
  ResourceAvailability,
} from "./availability/types";

export type { CalendarResource } from "./resources";
export { createResourceTree } from "./resources/tree";
export type { ResourceTree, ResourceTreeInput, ResourceTreeNode } from "./resources/tree";
export { groupByResource, showsInResource, visibleResources } from "./resources/visible";
export type { ResourceVisibilityOptions, VisibleResource } from "./resources/visible";
export type {
  CalendarDirection,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarNowSource,
  CalendarWeekRules,
  IsoDayOfWeek,
} from "./environment";

export { resolveViewInstantRange, resolveViewLoadRange } from "./views";
export type { CalendarViewProjectionInput, CalendarViewStrategy } from "./views";

export { navigateTimeGrid, timeGridRange, timeGridTitle } from "./views/time-grid/range";
export type { TimeGridSpan } from "./views/time-grid/range";
export { timeGridColumns } from "./views/time-grid/columns";
export type { TimeGridBand, TimeGridColumn } from "./views/time-grid/columns";
export { timedFragmentBox, timeGridDateTimeAt, timeGridPosition } from "./views/time-grid/geometry";
export type { TimeGridPointOptions, TimeGridPosition } from "./views/time-grid/geometry";
export { layoutTimeGrid } from "./views/time-grid/layout";
export type { TimeGridEventLayout } from "./views/time-grid/layout";
export {
  belongsInTimeGridAllDayRow,
  projectTimeGrid,
  timeGridStrategy,
} from "./views/time-grid/projection";
export { scrollingTimeGridStrategy } from "./views/time-grid/scrolling";
export type {
  TimeGridDay,
  TimeGridProjection,
  TimeGridProjectionInput,
} from "./views/time-grid/projection";
export type { TimedOverlapOptions } from "./layout/timed-overlap";
export {
  projectResourceColumns,
  resourceColumnsStrategy,
} from "./views/resource-columns/projection";
export type {
  ResourceColumn,
  ResourceColumnsProjection,
  ResourceColumnsProjectionInput,
} from "./views/resource-columns/projection";
export {
  navigateResourceTimeline,
  resourceTimelineRange,
  resourceTimelineTitle,
} from "./views/resource-timeline/range";
export type { ResourceTimelineSpan } from "./views/resource-timeline/range";
export { timelineExtent, timelinePosition } from "./views/resource-timeline/geometry";
export type { TimelineExtent } from "./views/resource-timeline/geometry";
export {
  projectResourceTimeline,
  resourceTimelineStrategy,
} from "./views/resource-timeline/projection";
export type {
  ResourceTimelineBar,
  ResourceTimelineDayRow,
  ResourceTimelineHourRow,
  ResourceTimelineOptions,
  ResourceTimelineProjection,
  ResourceTimelineProjectionInput,
} from "./views/resource-timeline/projection";

export { createEventTransactions } from "./transactions/event-transactions";
export type { EventTransactions } from "./transactions/event-transactions";
export { applyEventOverlay } from "./transactions/overlay";
export {
  createEventPlacement,
  eventPlacement,
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

export {
  createPlacementBetween,
  movePlacementToTarget,
  resizePlacementToTarget,
  slotDuration,
} from "./transactions/targets";
export type { CalendarInteractionOptions, CalendarInteractionTarget } from "./transactions/targets";

export { sameFocus } from "./navigation/focus";
export type {
  CalendarCellFocus,
  CalendarDayFocus,
  CalendarEventFocus,
  CalendarFocus,
  CalendarSelection,
  CalendarSlotFocus,
} from "./navigation/focus";
export { listSpatialNavigation } from "./navigation/list";
export { monthSpatialNavigation } from "./navigation/month";
export { timeGridSpatialNavigation } from "./navigation/time-grid";
export { resourceColumnsSpatialNavigation } from "./navigation/resource-columns";
export { resourceTimelineSpatialNavigation } from "./navigation/resource-timeline";
export { anchorShowingDate } from "./navigation/reveal";
export type {
  CalendarNavigationCommand,
  CalendarSpatialNavigation,
  CalendarSpatialNavigationInput,
} from "./navigation/types";

export {
  keyboardSessionProposal,
  moveKeyboardCursor,
  startKeyboardSession,
} from "./keyboard/session";
export type { CalendarKeyboardSession, CalendarKeyboardSessionStart } from "./keyboard/session";
export { formatPlacementRange } from "./keyboard/announcements";
export type {
  CalendarAnnouncementBuilder,
  CalendarAnnouncementContext,
  CalendarAnnouncementMessages,
  CalendarAnnouncer,
  CalendarInteractionCause,
  CalendarInteractionCheck,
  CalendarInteractionPhase,
  CalendarInteractionUpdate,
} from "./keyboard/announcements";

export { availabilityPolicy } from "./policies/availability";
export type { AvailabilityPolicyOptions } from "./policies/availability";
export { boundsPolicy } from "./policies/bounds";
export { minimumDurationPolicy } from "./policies/minimum-duration";
export { readOnlyPolicy } from "./policies/read-only";
export { readOnlyResourcesPolicy } from "./policies/read-only-resources";
export { snapPolicy } from "./policies/snap";
export type {
  CalendarPolicy,
  CalendarPolicyContext,
  CalendarPolicyDecision,
  CalendarPolicyResult,
} from "./policies/types";
