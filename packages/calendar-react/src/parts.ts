import type { EventId, ResourceId } from "@moltenship/calendar-core";
import {
  createElement,
  useCallback,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
} from "react";

import type {
  CalendarActiveViewProps,
  CalendarEventProps,
  CalendarFrameProps,
  CalendarMeta,
  CalendarTitleProps,
  CalendarToolbarProps,
  CalendarTriggerProps,
  CalendarViewSwitcherProps,
  CalendarViewportProps,
} from "./calendar-types";
import {
  useActiveViewContext,
  useRootContext,
  type AnyCalendarState,
  type CalendarContexts,
} from "./context";
import { CalendarViewRuntimeContext, useInteractionRuntime } from "./interaction";
import { createRovingFocusStore, RovingFocusSync, viewEntry } from "./roving-focus";
import { useStateSelector } from "./state-binding";
import type { AnyCalendarView, CalendarActiveView } from "./views";

const selectView = (state: AnyCalendarState) => state.view;

function useComposedRef<T>(internalRef: RefObject<T | null>, externalRef: Ref<T> | undefined) {
  return useCallback(
    (node: T | null) => {
      internalRef.current = node;
      const externalCleanup = typeof externalRef === "function" ? externalRef(node) : undefined;
      if (externalRef !== null && externalRef !== undefined && typeof externalRef !== "function") {
        externalRef.current = node;
      }
      if (node === null) return undefined;

      return () => {
        internalRef.current = null;
        if (typeof externalRef === "function") {
          if (typeof externalCleanup === "function") externalCleanup();
          else externalRef(null);
        } else if (externalRef !== null && externalRef !== undefined) {
          externalRef.current = null;
        }
      };
    },
    [externalRef, internalRef],
  );
}

/** Builds the compound parts that read one factory's root. */
export function createCalendarParts(contexts: CalendarContexts) {
  function Frame({ children, ref, ...props }: CalendarFrameProps) {
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.frame, ref);
    return createElement(
      "section",
      {
        "aria-labelledby": meta.ids.title,
        ...props,
        "data-calendar-instance": meta.instanceId,
        "data-calendar-part": "frame",
        id: meta.ids.frame,
        ref: composedRef,
      },
      children,
    );
  }

  function Toolbar({ children, ref, ...props }: CalendarToolbarProps) {
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.toolbar, ref);
    return createElement(
      "header",
      { ...props, "data-calendar-part": "toolbar", ref: composedRef },
      children,
    );
  }

  function Viewport({ children, ref, ...props }: CalendarViewportProps) {
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.viewport, ref);
    return createElement(
      "div",
      { ...props, "data-calendar-part": "viewport", id: meta.ids.viewport, ref: composedRef },
      children,
    );
  }

  function Title({ children, ref, ...props }: CalendarTitleProps) {
    const meta = useRootContext(contexts.meta);
    const activeView = useActiveViewContext(contexts.view);
    const composedRef = useComposedRef(meta.refs.title, ref);
    const title = useMemo(
      () =>
        activeView?.definition.strategy.getTitle(
          activeView.range,
          activeView.environment,
          activeView.options,
        ) ?? "",
      [activeView],
    );
    return createElement(
      "span",
      { ...props, "data-calendar-part": "title", id: meta.ids.title, ref: composedRef },
      children ?? title,
    );
  }

  function createTrigger(
    part: string,
    command: "navigateNext" | "navigatePrevious" | "navigateToday",
  ) {
    return function Trigger({
      children,
      disabled,
      ref,
      type = "button",
      ...props
    }: CalendarTriggerProps) {
      const actions = useRootContext(contexts.actions);
      const meta = useRootContext(contexts.meta);
      const requiresView = command !== "navigateToday";
      return createElement(
        "button",
        {
          ...props,
          "aria-controls": props["aria-controls"] ?? meta.ids.viewport,
          "data-calendar-part": part,
          disabled: disabled ?? (requiresView && meta.activeView === undefined),
          onClick: (event: MouseEvent<HTMLButtonElement>) => {
            props.onClick?.(event);
            if (!event.defaultPrevented) actions[command]();
          },
          ref,
          type,
        },
        children,
      );
    };
  }

  const PreviousTrigger = createTrigger("previous-trigger", "navigatePrevious");
  const NextTrigger = createTrigger("next-trigger", "navigateNext");
  const TodayTrigger = createTrigger("today-trigger", "navigateToday");

  function ViewSwitcher({ getViewLabel, onChange, ref, ...props }: CalendarViewSwitcherProps) {
    const actions = useRootContext(contexts.actions);
    const meta = useRootContext(contexts.meta);
    const view = useStateSelector(useRootContext(contexts.source), selectView);
    return createElement(
      "select",
      {
        ...props,
        "data-calendar-part": "view-switcher",
        onChange: (event: ChangeEvent<HTMLSelectElement>) => {
          onChange?.(event);
          const next = event.currentTarget.value;
          if (!event.defaultPrevented && meta.views.some((candidate) => candidate.name === next)) {
            actions.setView(next);
          }
        },
        ref,
        value: view,
      },
      meta.views.map(({ name }) =>
        createElement("option", { key: name, value: name }, getViewLabel(name)),
      ),
    );
  }

  function ActiveView({ fallback = null }: CalendarActiveViewProps) {
    const actions = useRootContext(contexts.actions);
    const activeView = useActiveViewContext(contexts.view);
    const { source } = useInteractionRuntime();
    const latest = useRef<CalendarActiveView<AnyCalendarView> | null>(activeView);
    useInsertionEffect(() => {
      latest.current = activeView;
    });
    // Starting from the view's entry gives server markup its tab stop.
    const [roving] = useState(() => createRovingFocusStore(viewEntry(activeView)));
    const runtime = useMemo(
      () => Object.freeze({ getView: () => latest.current, roving }),
      [roving],
    );
    if (activeView === null) return fallback;

    const { definition, environment, events, options, projection, range } = activeView;
    return createElement(
      CalendarViewRuntimeContext,
      { value: runtime },
      createElement(definition.Renderer, {
        actions,
        environment,
        events,
        options,
        projection,
        range,
      }),
      createElement(RovingFocusSync, { roving, source, view: activeView }),
    );
  }

  function EventPart<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
    children,
    eventId,
    fallback = null,
  }: CalendarEventProps<TEvent, TEventId, TResourceId>) {
    const meta = useRootContext(contexts.meta) as CalendarMeta<
      TEvent,
      unknown,
      AnyCalendarView,
      TEventId,
      TResourceId
    >;
    const normalized = meta.eventSnapshot.get(eventId);
    return normalized === undefined ? fallback : children({ event: normalized.event, normalized });
  }

  return Object.freeze({
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
  });
}
