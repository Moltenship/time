import type { EventId, ResourceId } from "@moltenship/calendar-core";
import { useMemo, type ComponentType } from "react";

import type {
  CalendarContextValue,
  CalendarFactory,
  CalendarMeta,
  CalendarSemanticActions,
  CalendarViewSwitcherProps,
  CreateCalendarOptions,
} from "./calendar-types";
import {
  createCalendarContexts,
  useActiveViewContext,
  useRootContext,
  type CalendarStateSource,
} from "./context";
import { createCalendarParts } from "./parts";
import { createCalendarRoot } from "./root";
import { useStateSelector } from "./state-binding";
import type {
  CalendarPublicState,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
} from "./types";
import type { AnyCalendarView, CalendarActiveView } from "./views";

/**
 * Creates a typed calendar. The first call fixes the application's record types; the second infers
 * the view-name union and identifier types from `views` and `eventAdapter`.
 *
 * ```ts
 * const Calendar = createCalendar<Meeting, Room>()({ eventAdapter, views: [monthView] });
 * ```
 */
export function createCalendar<
  TEvent,
  TResource = unknown,
  TSelection = string,
  TFocus = string,
>() {
  return function createTypedCalendar<
    TViewDef extends AnyCalendarView<TEvent> = never,
    TEventId extends EventId = EventId,
    TResourceId extends ResourceId = ResourceId,
  >(
    options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>,
  ): CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
    type View = TViewDef["name"];
    type State = CalendarPublicState<View, TSelection, TFocus, TResourceId>;
    type Meta = CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
    type Actions = CalendarSemanticActions<View, TSelection, TFocus, TResourceId, TEvent, TEventId>;

    const views = Object.freeze([...(options.views ?? [])]);
    const names = new Set<string>();
    for (const view of views) {
      if (names.has(view.name)) throw new TypeError(`calendar-duplicate-view-name:${view.name}`);
      names.add(view.name);
    }

    const contexts = createCalendarContexts();
    const { EventPart, ViewSwitcher, ...parts } = createCalendarParts(contexts);
    const Root = createCalendarRoot<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >(
      { eventAdapter: options.eventAdapter, invalidEventPolicy: options.invalidEventPolicy, views },
      contexts,
    );

    // The contexts are untyped so parts can be shared; this factory narrows them to its records.
    const useCalendarActions = () => useRootContext(contexts.actions) as Actions;
    const useCalendarMeta = () => useRootContext(contexts.meta) as Meta;
    const useCalendarState = () => useRootContext(contexts.state) as State;

    return Object.freeze({
      ...parts,
      Event: EventPart<TEvent, TEventId, TResourceId>,
      Root,
      ViewSwitcher: ViewSwitcher as ComponentType<CalendarViewSwitcherProps<View>>,
      views,
      useCalendar() {
        const actions = useCalendarActions();
        const meta = useCalendarMeta();
        const state = useCalendarState();
        return useMemo<
          CalendarContextValue<
            TEvent,
            TResource,
            TViewDef,
            TSelection,
            TFocus,
            TEventId,
            TResourceId
          >
        >(() => Object.freeze({ actions, meta, state }), [actions, meta, state]);
      },
      useCalendarActions,
      useCalendarMeta,
      useCalendarSelector<TSelected>(
        selector: CalendarStateSelector<State, TSelected>,
        selectorOptions?: CalendarStateSelectorOptions<TSelected>,
      ) {
        const source = useRootContext(contexts.source) as CalendarStateSource<State>;
        return useStateSelector(source, selector, selectorOptions);
      },
      useCalendarState,
      useViewProjection: () =>
        useActiveViewContext(contexts.view) as CalendarActiveView<TViewDef> | null,
      useVisibleRange: () => useActiveViewContext(contexts.view)?.range ?? null,
    });
  };
}
