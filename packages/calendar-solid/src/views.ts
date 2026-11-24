import type {
  CalendarEnvironmentBase,
  CalendarViewStrategy,
  EventId,
  EventSnapshot,
  ResourceId,
} from "@moltenship/calendar-core";
import type { CalendarViewActions, CalendarViewDefinition } from "@moltenship/calendar-primitives";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import type { Component } from "solid-js";

/**
 * What `ActiveView` passes the active view's renderer. They are Solid props: getters that read the
 * calendar's current values, so read them where they are used, in JSX or a memo, and don't
 * destructure them.
 */
export interface CalendarViewRendererProps<TProjection, TOptions> {
  /** Stable for the lifetime of the calendar root. */
  readonly actions: CalendarViewActions;
  readonly environment: CalendarEnvironmentBase;
  /** The events the projection was built from, pending changes included. */
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  /** The root has no `onEventChange`, so it rejects every change. */
  readonly isReadOnly?: boolean;
  /** The dates the projection covers: `range`, plus what a scrolling view keeps ready. */
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly projection: TProjection;
  /** The visible dates. */
  readonly range: PlainDateInterval;
}

/** A kernel view definition with the Solid component that renders its projection. */
export interface CalendarView<
  TName extends string = string,
  TProjection = unknown,
  TOptions = unknown,
  TEvent = unknown,
> extends CalendarViewDefinition<TName, TProjection, TOptions, TEvent> {
  readonly Renderer: Component<CalendarViewRendererProps<TProjection, TOptions>>;
}

// oxlint-disable-next-line typescript/no-explicit-any -- views are heterogeneous in a calendar.
export type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;

interface CalendarViewInputBase<TName extends string, TProjection, TOptions, TEvent> {
  readonly name: TName;
  readonly Renderer: Component<CalendarViewRendererProps<TProjection, TOptions>>;
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

/**
 * Defines a view: a name, the core strategy that ranges, navigates and projects it, and the Solid
 * component that renders the projection. The same shape as `@moltenship/calendar-react`'s, with a
 * Solid `Renderer`.
 */
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
