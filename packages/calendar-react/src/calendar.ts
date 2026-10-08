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
  CalendarActionsContext,
  CalendarMetaContext,
  CalendarSourceContext,
  CalendarStateContext,
  useActiveViewContext,
  useRootContext,
  type CalendarStateSource,
} from "./context";
import {
  ActiveView,
  EventPart,
  Frame,
  NextTrigger,
  PreviousTrigger,
  Title,
  TodayTrigger,
  Toolbar,
  ViewSwitcher,
  Viewport,
} from "./parts";
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
    type Actions = CalendarSemanticActions<View, TSelection, TFocus, TResourceId>;

    const views = Object.freeze([...(options.views ?? [])]);
    const names = new Set<string>();
    for (const view of views) {
      if (names.has(view.name)) throw new TypeError(`calendar-duplicate-view-name:${view.name}`);
      names.add(view.name);
    }

    const Root = createCalendarRoot<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >({
      eventAdapter: options.eventAdapter,
      invalidEventPolicy: options.invalidEventPolicy,
      views,
    });

    // The package-level contexts are untyped; each factory narrows them to its own records.
    const useCalendarActions = () => useRootContext(CalendarActionsContext) as Actions;
    const useCalendarMeta = () => useRootContext(CalendarMetaContext) as Meta;
    const useCalendarState = () => useRootContext(CalendarStateContext) as State;

    return Object.freeze({
      ActiveView,
      Event: EventPart<TEvent, TEventId, TResourceId>,
      Frame,
      NextTrigger,
      PreviousTrigger,
      Root,
      Title,
      TodayTrigger,
      Toolbar,
      ViewSwitcher: ViewSwitcher as ComponentType<CalendarViewSwitcherProps<View>>,
      Viewport,
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
        const source = useRootContext(CalendarSourceContext) as CalendarStateSource<State>;
        return useStateSelector(source, selector, selectorOptions);
      },
      useCalendarState,
      useViewProjection: () => useActiveViewContext() as CalendarActiveView<TViewDef> | null,
      useVisibleRange: () => useActiveViewContext()?.range ?? null,
    });
  };
}
