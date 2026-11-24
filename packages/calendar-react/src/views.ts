import type {
  CalendarEnvironmentBase,
  CalendarViewStrategy,
  EventId,
  EventSnapshot,
  ResourceId,
} from "@moltenship/calendar-core";
import type {
  CalendarActiveView as KernelActiveView,
  CalendarViewActions,
  CalendarViewDefinition,
  CalendarViewOptionsMap as KernelViewOptionsMap,
} from "@moltenship/calendar-primitives";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import type { ComponentType } from "react";

export { resolveViewOptions } from "@moltenship/calendar-primitives";
export type { CalendarViewActions };

export interface CalendarViewRendererProps<TProjection, TOptions> {
  /** Stable for the lifetime of the calendar root. */
  readonly actions: CalendarViewActions;
  readonly environment: CalendarEnvironmentBase;
  /** The events the projection was built from, pending changes included. */
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  /**
   * The root has no `onEventChange`, so it rejects every change: start no pointer gestures (pass
   * it as `useCalendarPointer`'s `disabled`) and draw no resize handles. Keyboard grabs stay off
   * on their own. `ActiveView` always passes it; a renderer used on its own is editable.
   */
  readonly isReadOnly?: boolean;
  /**
   * The dates the projection covers: `range`, plus the neighbouring dates a scrolling view keeps
   * ready (its strategy's `getLoadRange`). `ActiveView` always passes it; a renderer used on its
   * own falls back to `range`.
   */
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly projection: TProjection;
  /** The visible dates. */
  readonly range: PlainDateInterval;
}

/** A kernel view definition with the React component that renders its projection. */
export interface CalendarView<
  TName extends string = string,
  TProjection = unknown,
  TOptions = unknown,
  TEvent = unknown,
> extends CalendarViewDefinition<TName, TProjection, TOptions, TEvent> {
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
}

// oxlint-disable-next-line typescript/no-explicit-any -- views are heterogeneous in a calendar.
export type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;

interface CalendarViewInputBase<TName extends string, TProjection, TOptions, TEvent> {
  readonly name: TName;
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}

export type CalendarViewInput<
  TName extends string,
  TProjection,
  TOptions,
  TEvent,
> = CalendarViewInputBase<TName, TProjection, TOptions, TEvent> &
  (undefined extends TOptions
    ? { readonly defaultOptions?: TOptions }
    : { readonly defaultOptions: TOptions });

/** Options a root passes to its registered views, keyed by view name. */
export type CalendarViewOptionsMap<TViewDef extends AnyCalendarView> =
  KernelViewOptionsMap<TViewDef>;

/** The active view of a calendar with its visible range and memoized projection. */
export type CalendarActiveView<TViewDef extends AnyCalendarView> = KernelActiveView<TViewDef>;

export function defineCalendarView<
  const TName extends string,
  TProjection,
  TOptions = undefined,
  TEvent = unknown,
>(
  view: CalendarViewInput<TName, TProjection, TOptions, TEvent>,
): CalendarView<TName, TProjection, TOptions, TEvent> {
  return Object.freeze({
    defaultOptions: view.defaultOptions as TOptions,
    name: view.name,
    Renderer: view.Renderer,
    strategy: view.strategy,
  });
}
