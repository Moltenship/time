import type {
  CalendarFocus,
  CalendarPendingChanges,
  CalendarSelection,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  createCalendarPrimitive,
  type CalendarPublicState,
  type CalendarStateSelector,
  type CalendarStateSelectorOptions,
  type CalendarStateSource,
} from "@moltenship/calendar-primitives";
import type { Accessor } from "solid-js";

import { Announcer } from "./announcer";
import { createCalendarParts } from "./parts";
import { createCalendarRoot, type CalendarRootValue } from "./root";
import { createRootContext } from "./root-context";
import { createStateSelector } from "./state-selector";
import type { CalendarFactory, CreateCalendarOptions } from "./types";
import type { AnyCalendarView } from "./views";

/** `useCalendarPendingChanges` without a selector: the map itself. */
const allChanges = <T>(changes: T) => changes;

/**
 * Creates a typed calendar, as `@moltenship/calendar-react`'s factory does. The first call fixes
 * the application's record types; the second infers the view-name union and identifier types from
 * `views` and `eventAdapter`. Its root, parts and hooks share a context no other factory reads, so
 * a calendar inside another reads its own.
 *
 * ```ts
 * const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [monthView, listView] });
 * ```
 */
export function createCalendar<
  TEvent,
  TResource = unknown,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
>(): <
  TViewDef extends AnyCalendarView<TEvent> = never,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>,
) => CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
  return function createTypedCalendar<
    TViewDef extends AnyCalendarView<TEvent> = never,
    TEventId extends EventId = EventId,
    TResourceId extends ResourceId = ResourceId,
  >(
    options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>,
  ): CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
    type Factory = CalendarFactory<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >;
    type State = CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
    type PendingChanges = CalendarPendingChanges<TEvent, TEventId, TResourceId>;

    const views = Object.freeze([...(options.views ?? [])]);
    const names = new Set<string>();
    for (const view of views) {
      if (names.has(view.name)) throw new TypeError(`calendar-duplicate-view-name:${view.name}`);
      names.add(view.name);
    }

    const root = createRootContext<CalendarRootValue>("calendar-root");
    // One primitive per factory: its agent surface checks view names against these views.
    const primitive = createCalendarPrimitive<TViewDef, TSelection, TFocus, TResourceId>({ views });
    const { EventPart, ...parts } = createCalendarParts(root);
    const Root = createCalendarRoot<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >(
      {
        eventAdapter: options.eventAdapter,
        invalidEventPolicy: options.invalidEventPolicy,
        primitive,
        views,
      },
      root,
    );

    // The context is untyped so the parts can be shared; this factory narrows it to its records.
    const useCalendarActions = () =>
      root.use().actions as unknown as ReturnType<Factory["useCalendarActions"]>;
    const useCalendarMeta = () =>
      root.use().meta as unknown as ReturnType<Factory["useCalendarMeta"]>;
    const useCalendarState = () => root.use().state as unknown as Accessor<State>;

    function useCalendarPendingChanges(): Accessor<PendingChanges>;
    function useCalendarPendingChanges<TSelected>(
      selector: CalendarStateSelector<PendingChanges, TSelected>,
      selectorOptions?: CalendarStateSelectorOptions<TSelected>,
    ): Accessor<TSelected>;
    function useCalendarPendingChanges<TSelected>(
      selector?: CalendarStateSelector<PendingChanges, TSelected>,
      selectorOptions?: CalendarStateSelectorOptions<TSelected>,
    ): Accessor<TSelected> {
      return createStateSelector(
        root.use().runtime.pendingChanges as unknown as CalendarStateSource<PendingChanges>,
        selector ?? (allChanges as CalendarStateSelector<PendingChanges, TSelected>),
        selectorOptions,
      );
    }

    const factory: Factory = {
      ...parts,
      Announcer,
      Event: EventPart as unknown as Factory["Event"],
      Root,
      ViewSwitcher: parts.ViewSwitcher as Factory["ViewSwitcher"],
      views,
      useCalendar() {
        const { actions, meta, state } = root.use();
        return Object.freeze({
          actions: actions as unknown as ReturnType<Factory["useCalendarActions"]>,
          get meta() {
            return meta() as unknown as ReturnType<ReturnType<Factory["useCalendarMeta"]>>;
          },
          get state() {
            return state() as unknown as State;
          },
        });
      },
      useCalendarActions,
      useCalendarMeta,
      useCalendarPendingChanges,
      useCalendarSelector<TSelected>(
        selector: CalendarStateSelector<State, TSelected>,
        selectorOptions?: CalendarStateSelectorOptions<TSelected>,
      ) {
        const { source } = root.use();
        return createStateSelector(
          source as unknown as Accessor<CalendarStateSource<State>>,
          selector,
          selectorOptions,
        );
      },
      useCalendarState,
      useViewProjection: () =>
        root.use().view as unknown as ReturnType<Factory["useViewProjection"]>,
      useVisibleRange: () => root.use().visibleRange,
    };
    return Object.freeze(factory);
  };
}
