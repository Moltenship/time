// No "use client" here: core and Temporal utilities stay callable from Server Components, while
// the React bindings and pointer interactions keep their own client boundaries.
export * from "@moltenship/calendar-core";
export * from "@moltenship/calendar-temporal";
export {
  attachCalendarPointer,
  eventIdAttributes,
  eventIdOf,
  useCalendarPointer,
} from "@moltenship/calendar-dnd";
export type { CalendarPointerOptions } from "@moltenship/calendar-dnd";
export {
  createCalendar,
  createCalendarStore,
  defineCalendarView,
  useNow,
} from "@moltenship/calendar-react";
export type {
  AnyCalendarView,
  CalendarActions,
  CalendarActiveView,
  CalendarActiveViewProps,
  CalendarContextValue,
  CalendarControlledState,
  CalendarDiagnostic,
  CalendarEventProps,
  CalendarEventRenderValue,
  CalendarFactory,
  CalendarFrameProps,
  CalendarMeta,
  CalendarPartIds,
  CalendarPartRefs,
  CalendarPublicState,
  CalendarRootProps,
  CalendarSemanticActions,
  CalendarStateChangeDetail,
  CalendarStateChangeHandler,
  CalendarStateChangeHandlers,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStateSlice,
  CalendarStore,
  CalendarStoreOptions,
  CalendarTitleProps,
  CalendarToolbarProps,
  CalendarTriggerProps,
  CalendarView,
  CalendarViewActions,
  CalendarViewInput,
  CalendarViewOptionsMap,
  CalendarViewRendererProps,
  CalendarViewSwitcherProps,
  CalendarViewportProps,
  CreateCalendarOptions,
  UseNowOptions,
} from "@moltenship/calendar-react";
