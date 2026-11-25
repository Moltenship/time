// The Solid 2.0 adapter of the calendar kernel: a typed factory with its root, parts and read
// hooks, view definitions with a Solid renderer, and the hooks a view's interaction binds.
export { useCalendarAnnotations, useTimeGridAnnotations } from "./annotations";
export type { CalendarAnnotations } from "./annotations";
export { Announcer, useCalendarAnnouncer } from "./announcer";
export {
  useCalendarAvailability,
  useClosedDates,
  useTimeGridAvailability,
  useTimelineAvailability,
} from "./availability";
export { createCalendar } from "./calendar";
export {
  useBusyResources,
  useCalendarDraft,
  useCalendarDraftReporter,
  useDraftBusy,
} from "./draft";
export type {
  CalendarBusyResources,
  CalendarBusyResourcesOptions,
  CalendarDraftBusy,
} from "./draft";
export { useCalendarHistory } from "./history";
export type {
  CalendarHistory,
  CalendarHistoryAnnouncementBuilder,
  CalendarHistoryAnnouncementContext,
  CalendarHistoryCommandOptions,
  CalendarHistoryMessages,
  CalendarHistoryOptions,
} from "./history";
export { useCalendarHistoryShortcuts } from "./history-shortcuts";
export type {
  CalendarHistoryShortcutsOptions,
  CalendarHistoryShortcutsTarget,
} from "./history-shortcuts";
export { useCalendarInteraction, useCalendarKeyboard } from "./keyboard";
export type { CalendarKeyboardOptions } from "./keyboard";
export { useCalendarPointer } from "./pointer";
export { useAnchorDateRequests } from "./requests";
export { useResourceExpansion, useVisibleResources } from "./resources";
export type {
  CalendarResourceExpansion,
  CalendarResourceExpansionCause,
  CalendarResourceExpansionCommand,
} from "./resources";
export { useRovingFocus } from "./roving-focus";
export type { CalendarRovingFocusOptions, CalendarRovingFocusProps } from "./roving-focus";
export { useCalendarFocus, useCalendarSelection } from "./selectors";
export type { MaybeAccessor } from "./shared";
export { createStateSelector } from "./state-selector";
export { useResourceStatus } from "./status";
export type { CalendarResourceStatus } from "./status";
export { useNow } from "./use-now";
export type { UseNowOptions } from "./use-now";
export { defineCalendarView } from "./views";
export type {
  AnyCalendarView,
  CalendarView,
  CalendarViewInput,
  CalendarViewRendererProps,
} from "./views";
export type {
  CalendarActiveViewProps,
  CalendarAnnouncerProps,
  CalendarContextValue,
  CalendarEventProps,
  CalendarEventRenderValue,
  CalendarFactory,
  CalendarFrameProps,
  CalendarMeta,
  CalendarPartRefs,
  CalendarRootProps,
  CalendarTitleProps,
  CalendarToolbarProps,
  CalendarTriggerProps,
  CalendarViewSwitcherProps,
  CalendarViewportProps,
  CreateCalendarOptions,
} from "./types";
// The data attributes the pointer layer reads, so numeric IDs stay distinct; and its options.
export { eventIdAttributes, resourceIdAttributes } from "@moltenship/calendar-dnd";
export type { CalendarPointerOptions } from "@moltenship/calendar-dnd";
// The kernel's store and types, so an application needs no second import for them.
export { createCalendarStore, resolveViewOptions } from "@moltenship/calendar-primitives";
export type {
  CalendarActions,
  CalendarActiveView,
  CalendarAgentEvent,
  CalendarChangeReason,
  CalendarChangeSource,
  CalendarCommandOptions,
  CalendarControlledState,
  CalendarDiagnostic,
  CalendarPartIds,
  CalendarPublicState,
  CalendarRootStore,
  CalendarSemanticActions,
  CalendarStateChangeDetail,
  CalendarStateChangeHandler,
  CalendarStateChangeHandlers,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStateSlice,
  CalendarStateSource,
  CalendarStore,
  CalendarStoreOptions,
  CalendarViewActions,
  CalendarViewOptionsMap,
  CalendarVisibleRange,
} from "@moltenship/calendar-primitives";
