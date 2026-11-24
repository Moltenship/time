// The Solid 2.0 adapter of the calendar kernel: a typed factory with its root, structural parts
// and read hooks, and view definitions with a Solid renderer.
export { createCalendar } from "./calendar";
export { createStateSelector } from "./state-selector";
export { defineCalendarView } from "./views";
export type {
  AnyCalendarView,
  CalendarView,
  CalendarViewInput,
  CalendarViewRendererProps,
} from "./views";
export type {
  CalendarActiveViewProps,
  CalendarContextValue,
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
