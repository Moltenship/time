import {
  createContext,
  Fragment,
  useContext,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { createCalendarRuntimeStore } from "./store";
import type {
  CalendarActions,
  CalendarContextValue,
  CalendarFactory,
  CalendarMeta,
  CalendarPublicState,
  CalendarRootProps,
  CalendarViewComponent,
  CreateCalendarOptions,
  StateChangeDetail,
} from "./types";

function changeDetail(previous: string, controlled: boolean): StateChangeDetail {
  return Object.freeze({ source: "action", previous, controlled });
}

export function createCalendar<TEvent, TResource>(
  options: CreateCalendarOptions<TEvent, TResource> = {},
): CalendarFactory<TEvent, TResource> {
  const views: Readonly<Record<string, CalendarViewComponent<TEvent, TResource>>> =
    options.views ?? Object.freeze({});
  const availableViews = Object.freeze(Object.keys(views));
  const CalendarContext = createContext<CalendarContextValue<TEvent, TResource> | null>(null);

  function useCalendar() {
    const calendar = useContext(CalendarContext);
    if (calendar === null) {
      throw new Error("Calendar compound components must be rendered inside Calendar.Root.");
    }
    return calendar;
  }

  function Root({
    children,
    events,
    resources,
    view,
    defaultView = availableViews[0] ?? "month",
    onViewChange,
    anchorDate,
    defaultAnchorDate = "1970-01-01",
    onAnchorDateChange,
    onEventInspect,
    onResourceInspect,
  }: CalendarRootProps<TEvent, TResource>) {
    const instanceId = useId();
    const storeRef = useRef<ReturnType<typeof createCalendarRuntimeStore> | null>(null);

    if (storeRef.current === null) {
      storeRef.current = createCalendarRuntimeStore({
        defaultView,
        defaultAnchorDate,
      });
    }

    const store = storeRef.current;
    const reader = useMemo(
      () => store.createSnapshotReader({ view, anchorDate }),
      [store, view, anchorDate],
    );
    const state = useSyncExternalStore(
      store.subscribe,
      reader.getSnapshot,
      reader.getServerSnapshot,
    );

    const actions = useMemo<CalendarActions<TEvent, TResource>>(
      () => ({
        setView(next) {
          const previous = reader.getSnapshot().view;
          if (next === previous) {
            return;
          }

          const controlled = view !== undefined;
          if (!controlled) {
            store.setUncontrolledView(next);
          }
          onViewChange?.(next, changeDetail(previous, controlled));
        },
        setAnchorDate(next) {
          const previous = reader.getSnapshot().anchorDate;
          if (next === previous) {
            return;
          }

          const controlled = anchorDate !== undefined;
          if (!controlled) {
            store.setUncontrolledAnchorDate(next);
          }
          onAnchorDateChange?.(next, changeDetail(previous, controlled));
        },
        inspectEvent(event) {
          onEventInspect?.(event);
        },
        inspectResource(resource) {
          onResourceInspect?.(resource);
        },
      }),
      [
        anchorDate,
        onAnchorDateChange,
        onEventInspect,
        onResourceInspect,
        onViewChange,
        reader,
        store,
        view,
      ],
    );

    const meta = useMemo<CalendarMeta<TEvent, TResource>>(
      () =>
        Object.freeze({
          instanceId,
          events,
          resources,
          availableViews,
        }),
      [events, instanceId, resources],
    );
    const calendar = useMemo<CalendarContextValue<TEvent, TResource>>(
      () => Object.freeze({ state, actions, meta }),
      [actions, meta, state],
    );

    return <CalendarContext value={calendar}>{children}</CalendarContext>;
  }

  function Frame({ children }: { readonly children?: React.ReactNode }) {
    const { meta } = useCalendar();
    return (
      <section data-calendar-instance={meta.instanceId} data-calendar-part="frame">
        {children}
      </section>
    );
  }

  function Toolbar({ children }: { readonly children?: React.ReactNode }) {
    return <header data-calendar-part="toolbar">{children}</header>;
  }

  function Viewport({ children }: { readonly children?: React.ReactNode }) {
    return <main data-calendar-part="viewport">{children}</main>;
  }

  function Title() {
    const { state } = useCalendar();
    return <span data-calendar-part="title">{state.view}</span>;
  }

  function CustomView({ view: View }: { readonly view: CalendarViewComponent<TEvent, TResource> }) {
    const calendar = useCalendar();
    return <View calendar={calendar} />;
  }

  function ActiveView() {
    const calendar = useCalendar();
    const View = views[calendar.state.view];
    return View === undefined ? null : <View calendar={calendar} />;
  }

  function Event({
    eventIndex,
    resourceIndex,
    children,
  }: {
    readonly eventIndex: number;
    readonly resourceIndex?: number;
    readonly children: (value: {
      readonly event: TEvent;
      readonly resource: TResource | undefined;
      readonly state: CalendarPublicState;
      readonly actions: CalendarActions<TEvent, TResource>;
    }) => React.ReactNode;
  }) {
    const calendar = useCalendar();
    const event = calendar.meta.events[eventIndex];
    if (event === undefined) {
      return null;
    }

    const resource =
      resourceIndex === undefined ? undefined : calendar.meta.resources[resourceIndex];
    return (
      <Fragment>
        {children({
          event,
          resource,
          state: calendar.state,
          actions: calendar.actions,
        })}
      </Fragment>
    );
  }

  function defineView(view: CalendarViewComponent<TEvent, TResource>) {
    return view;
  }

  return Object.freeze({
    Root,
    Frame,
    Toolbar,
    Viewport,
    Title,
    ActiveView,
    CustomView,
    Event,
    defineView,
    useCalendar,
  });
}
