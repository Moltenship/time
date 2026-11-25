import type { EventId, ResourceId } from "@moltenship/calendar-core";
import { createCalendarViewRuntime } from "@moltenship/calendar-primitives";
import { usePart, type PartProps } from "@ui-sdk/react/primitive";
import {
  createElement,
  useCallback,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import { RovingFocusSync } from "./roving-focus";
import { useStateSelector } from "./state-binding";
import type { AnyCalendarView, CalendarActiveView } from "./views";

const selectView = (state: AnyCalendarState) => state.view;

/**
 * The elements of the copies of a part still mounted, by the root's ref they share. An application
 * may render two copies of a part: the ref holds the latest one, and a copy that unmounts gives it
 * back to the other instead of emptying it.
 */
const mountedByRef = new WeakMap<RefObject<unknown>, unknown[]>();

function useComposedRef<T>(internalRef: RefObject<T | null>, externalRef: Ref<T> | undefined) {
  return useCallback(
    (node: T | null) => {
      if (node !== null) {
        const mounted = mountedByRef.get(internalRef) ?? [];
        mountedByRef.set(internalRef, mounted);
        mounted.push(node);
        internalRef.current = node;
      }
      const externalCleanup = typeof externalRef === "function" ? externalRef(node) : undefined;
      if (externalRef !== null && externalRef !== undefined && typeof externalRef !== "function") {
        externalRef.current = node;
      }
      if (node === null) return undefined;

      return () => {
        const mounted = mountedByRef.get(internalRef) ?? [];
        const index = mounted.lastIndexOf(node);
        if (index !== -1) mounted.splice(index, 1);
        internalRef.current = (mounted.at(-1) as T | undefined) ?? null;
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
    const handle = useRootContext(contexts.handle);
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.frame, ref);
    // A name of its own outlasts navigation; the title names the visible dates.
    const name =
      meta.label === undefined
        ? { "aria-labelledby": meta.ids.title }
        : { "aria-label": meta.label };
    const elementProps = {
      ...name,
      ...props,
      children,
      "data-calendar-instance": meta.instanceId,
      "data-calendar-part": "frame",
      id: meta.ids.frame,
      ref: composedRef,
    };
    // The frame is the primitive's root slot, so an agent finds the calendar here, by that name.
    return usePart(handle, "root", {}, elementProps as PartProps<"section">, "section");
  }

  function Toolbar({ children, ref, ...props }: CalendarToolbarProps) {
    const handle = useRootContext(contexts.handle);
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.toolbar, ref);
    return usePart(
      handle,
      "toolbar",
      {},
      {
        ...props,
        children,
        "data-calendar-part": "toolbar",
        ref: composedRef,
      } as PartProps<"header">,
      "header",
    );
  }

  function Viewport({ children, ref, ...props }: CalendarViewportProps) {
    const handle = useRootContext(contexts.handle);
    const meta = useRootContext(contexts.meta);
    const composedRef = useComposedRef(meta.refs.viewport, ref);
    return usePart(
      handle,
      "viewport",
      {},
      {
        ...props,
        children,
        "data-calendar-part": "viewport",
        id: meta.ids.viewport,
        ref: composedRef,
      } as PartProps<"div">,
      "div",
    );
  }

  function Title({ children, ref, ...props }: CalendarTitleProps) {
    const handle = useRootContext(contexts.handle);
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
    return usePart(
      handle,
      "title",
      {},
      {
        ...props,
        children: children ?? title,
        "data-calendar-part": "title",
        id: meta.ids.title,
        ref: composedRef,
      } as PartProps<"span">,
      "span",
    );
  }

  function createTrigger(
    part: "previous-trigger" | "next-trigger" | "today-trigger",
    requiresView: boolean,
  ) {
    return function Trigger({
      children,
      disabled,
      type = "button",
      ...props
    }: CalendarTriggerProps) {
      const handle = useRootContext(contexts.handle);
      const meta = useRootContext(contexts.meta);
      // The slot's press runs the command after the element's own `onClick`, unless that one
      // calls `preventDefault()`.
      const elementProps = {
        ...props,
        "aria-controls": props["aria-controls"] ?? meta.ids.viewport,
        children,
        "data-calendar-part": part,
        disabled: disabled ?? (requiresView && meta.activeView === undefined),
        type,
      };
      return usePart(handle, part, {}, elementProps as PartProps<"button">, "button");
    };
  }

  const PreviousTrigger = createTrigger("previous-trigger", true);
  const NextTrigger = createTrigger("next-trigger", true);
  const TodayTrigger = createTrigger("today-trigger", false);

  function ViewSwitcher({ getViewLabel, onChange, ...props }: CalendarViewSwitcherProps) {
    const handle = useRootContext(contexts.handle);
    const meta = useRootContext(contexts.meta);
    const view = useStateSelector(useRootContext(contexts.source), selectView);
    const elementProps = {
      ...props,
      children: meta.views.map(({ name }) =>
        createElement("option", { key: name, value: name }, getViewLabel(name)),
      ),
      "data-calendar-part": "view-switcher",
      // React delegates `onChange`, so the element's own handler runs here first and may call
      // `preventDefault()`; a value no registered view has changes nothing.
      onChange: (event: ChangeEvent<HTMLSelectElement>) => {
        onChange?.(event);
        if (event.defaultPrevented) return;
        handle.api.selectView(event.currentTarget.value, {
          event: event.nativeEvent,
          reason: "input-change",
        });
      },
      value: view,
    };
    return usePart(handle, "view-switcher", {}, elementProps as PartProps<"select">, "select");
  }

  function ActiveView({ fallback = null }: CalendarActiveViewProps) {
    const actions = useRootContext(contexts.actions);
    const activeView = useActiveViewContext(contexts.view);
    const { isReadOnly, source } = useInteractionRuntime();
    const latest = useRef<CalendarActiveView<AnyCalendarView> | null>(activeView);
    useInsertionEffect(() => {
      latest.current = activeView;
    });
    // Starting from the view's entry gives server markup its tab stop.
    const [runtime] = useState(() => createCalendarViewRuntime(() => latest.current));
    if (activeView === null) return fallback;

    const { definition, environment, events, loadRange, options, projection, range } = activeView;
    return createElement(
      CalendarViewRuntimeContext,
      { value: runtime },
      createElement(definition.Renderer, {
        actions,
        environment,
        events,
        isReadOnly,
        loadRange,
        options,
        projection,
        range,
      }),
      createElement(RovingFocusSync, { roving: runtime.roving, source, view: activeView }),
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
