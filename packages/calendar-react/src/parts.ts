import type { EventId, ResourceId } from "@moltenship/calendar-core";
import {
  createElement,
  useCallback,
  useMemo,
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
  CalendarActionsContext,
  CalendarMetaContext,
  CalendarSourceContext,
  useActiveViewContext,
  useRootContext,
  type AnyCalendarState,
} from "./context";
import { useStateSelector } from "./state-binding";
import type { AnyCalendarView } from "./views";

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

export function Frame({ children, ref, ...props }: CalendarFrameProps) {
  const meta = useRootContext(CalendarMetaContext);
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

export function Toolbar({ children, ref, ...props }: CalendarToolbarProps) {
  const meta = useRootContext(CalendarMetaContext);
  const composedRef = useComposedRef(meta.refs.toolbar, ref);
  return createElement(
    "header",
    { ...props, "data-calendar-part": "toolbar", ref: composedRef },
    children,
  );
}

export function Viewport({ children, ref, ...props }: CalendarViewportProps) {
  const meta = useRootContext(CalendarMetaContext);
  const composedRef = useComposedRef(meta.refs.viewport, ref);
  return createElement(
    "div",
    { ...props, "data-calendar-part": "viewport", id: meta.ids.viewport, ref: composedRef },
    children,
  );
}

export function Title({ children, ref, ...props }: CalendarTitleProps) {
  const meta = useRootContext(CalendarMetaContext);
  const activeView = useActiveViewContext();
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
    const actions = useRootContext(CalendarActionsContext);
    const meta = useRootContext(CalendarMetaContext);
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

export const PreviousTrigger = createTrigger("previous-trigger", "navigatePrevious");
export const NextTrigger = createTrigger("next-trigger", "navigateNext");
export const TodayTrigger = createTrigger("today-trigger", "navigateToday");

export function ViewSwitcher({ getViewLabel, onChange, ref, ...props }: CalendarViewSwitcherProps) {
  const actions = useRootContext(CalendarActionsContext);
  const meta = useRootContext(CalendarMetaContext);
  const view = useStateSelector(useRootContext(CalendarSourceContext), selectView);
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

export function ActiveView({ fallback = null }: CalendarActiveViewProps) {
  const actions = useRootContext(CalendarActionsContext);
  const activeView = useActiveViewContext();
  if (activeView === null) return fallback;
  const { definition, environment, options, projection, range } = activeView;
  return createElement(definition.Renderer, { actions, environment, options, projection, range });
}

export function EventPart<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  children,
  eventId,
  fallback = null,
}: CalendarEventProps<TEvent, TEventId, TResourceId>) {
  const meta = useRootContext(CalendarMetaContext) as CalendarMeta<
    TEvent,
    unknown,
    AnyCalendarView,
    TEventId,
    TResourceId
  >;
  const normalized = meta.eventSnapshot.get(eventId);
  return normalized === undefined ? fallback : children({ event: normalized.event, normalized });
}
