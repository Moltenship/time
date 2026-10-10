import { sameFocus, type CalendarFocus } from "@moltenship/calendar-core";
import {
  useCallback,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FocusEvent,
  type RefCallback,
} from "react";

import type { AnyCalendarState, CalendarStateSource } from "./context";
import { DEFAULT_SNAP, useInteractionRuntime, useViewRuntime } from "./interaction";
import { useStateSelector } from "./state-binding";
import type { AnyCalendarView, CalendarActiveView } from "./views";

interface RovingItem {
  readonly days: number;
  readonly target: CalendarFocus;
}

/** Whether `focus` is on an element that shows `target` across `days` dates. */
function focusLandsOn(focus: CalendarFocus, target: CalendarFocus, days: number): boolean {
  if (focus.kind === "event" && target.kind === "event") {
    const offset = target.date.until(focus.date).days;
    return (
      focus.eventId === target.eventId &&
      focus.resourceId === target.resourceId &&
      offset >= 0 &&
      offset < days
    );
  }
  return sameFocus(focus, target);
}

/**
 * `focus` as it lands on an element showing `target` across `days` dates, or `null` when it does
 * not. A resource on only one side matches, so focus carries over between views with and without
 * resources, and then takes the element's resource, keeping its date: one copy is the tab stop,
 * and keys act in the resource it shows.
 */
function landOn(focus: CalendarFocus, target: CalendarFocus, days: number): CalendarFocus | null {
  const { resourceId } = target;
  if (focus.resourceId === resourceId) return focusLandsOn(focus, target, days) ? focus : null;
  if (focus.resourceId !== undefined && resourceId !== undefined) return null;
  const landed = { ...focus, resourceId };
  return focusLandsOn(landed, target, days) ? landed : null;
}

interface ResolvedTabStop {
  readonly element?: HTMLElement;
  /** Whether `target` is the focus, landed on its element. */
  readonly isFocus?: boolean;
  readonly target: CalendarFocus | null;
}

/** Where focus enters the active view: its default entry (`"home"`) or its last target. */
export type RovingEntry = (command: "end" | "home") => CalendarFocus | null;

/**
 * The elements of the active view that can take focus. Exactly one is the tab stop: the focused
 * one, else the view's entry, else the first in document order, so the view stays reachable when
 * focus is on something it does not render. Before any element registers, as on the server and
 * while hydrating, the entry is the tab stop: whether the view renders the focus is only known
 * once its elements register.
 */
export interface RovingFocusStore {
  /** Enters the next range from its end, after paging back, until something takes focus. */
  readonly enterFromEnd: () => void;
  /** Moves DOM focus to the tab stop, now or after the next `update`. */
  readonly focusTabStop: (when: "now" | "after-update") => void;
  /** The focus a key pressed on `node` moves from. */
  readonly focusAt: (node: Node) => CalendarFocus | null;
  readonly isTabStop: (target: CalendarFocus, days: number) => boolean;
  readonly register: (element: HTMLElement, target: CalendarFocus, days: number) => () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly update: (focus: CalendarFocus | null, getEntry: RovingEntry) => void;
}

export function createRovingFocusStore(initialEntry: RovingEntry): RovingFocusStore {
  const items = new Map<HTMLElement, RovingItem>();
  const listeners = new Set<() => void>();
  let focus: CalendarFocus | null = null;
  let getEntry = initialEntry;
  let entryCommand: "end" | "home" = "home";
  let resolved: ResolvedTabStop | null = null;
  /**
   * DOM focus owed after the next update: to the tab stop, as keyboard navigation asks, or only
   * to the focused target once it renders, after the element holding DOM focus went away.
   */
  let owed: "focus" | "tab-stop" | null = null;

  function find(
    target: CalendarFocus | null,
  ): { readonly element: HTMLElement; readonly target: CalendarFocus } | undefined {
    if (target === null) return undefined;
    let compatible: { readonly element: HTMLElement; readonly target: CalendarFocus } | undefined;
    for (const [element, item] of items) {
      const landed = landOn(target, item.target, item.days);
      // An element in the focus's own resource wins over one that only matches across views.
      if (landed === target) return { element, target };
      if (landed !== null) compatible ??= { element, target: landed };
    }
    return compatible;
  }

  function resolve(): ResolvedTabStop {
    if (resolved !== null) return resolved;
    const entry = getEntry(entryCommand);
    // A view without navigation has no entry, so its focus has to stand in.
    if (items.size === 0) return (resolved = { target: entry ?? focus });
    const found = find(focus);
    if (found !== undefined) return (resolved = { ...found, isFocus: true });
    const entered = find(entry);
    if (entered !== undefined) return (resolved = entered);
    const [element] = [...items.keys()].sort((left, right) =>
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return (resolved = {
      element,
      target: element === undefined ? null : items.get(element)!.target,
    });
  }

  function changed() {
    resolved = null;
    for (const listener of listeners) listener();
  }

  function itemAt(node: Node | null): RovingItem | undefined {
    for (let current = node; current !== null; current = current.parentNode) {
      const item = items.get(current as HTMLElement);
      if (item !== undefined) return item;
    }
    return undefined;
  }

  /** Focuses the tab stop unless focus has moved elsewhere on the page in the meantime. */
  function focusNow() {
    const { element, isFocus = false } = resolve();
    // Owed only to the focus, which has not rendered yet.
    if (owed === "focus" && !isFocus) return;
    owed = null;
    const active = document.activeElement;
    if (element === undefined || element === active) return;
    if (active !== null && active !== document.body && itemAt(active) === undefined) return;
    element.focus();
  }

  let retrying = false;
  /**
   * Retries owed focus once the commit that registered an element is done. By then this commit's
   * focus has reached the store, so a newer focus wins over the element that came back.
   */
  function retryOwedFocus() {
    if (retrying) return;
    retrying = true;
    queueMicrotask(() => {
      retrying = false;
      if (owed === "focus") focusNow();
    });
  }

  return Object.freeze({
    enterFromEnd() {
      entryCommand = "end";
    },
    focusAt(node: Node) {
      const item = itemAt(node);
      if (item === undefined) return focus;
      return (focus === null ? null : landOn(focus, item.target, item.days)) ?? item.target;
    },
    focusTabStop(when: "now" | "after-update") {
      owed = "tab-stop";
      if (when === "now") focusNow();
    },
    isTabStop(target: CalendarFocus, days: number) {
      const stop = resolve().target;
      return stop !== null && focusLandsOn(stop, target, days);
    },
    register(element: HTMLElement, target: CalendarFocus, days: number) {
      items.set(element, { days, target });
      changed();
      // The focused target can come back without a calendar update, as when a view re-renders it.
      if (owed === "focus") retryOwedFocus();
      return () => {
        if (items.get(element)?.target !== target) return;
        // The focused element is leaving, as when a grabbed event moves between the all-day row
        // and the columns: focus whatever takes its place.
        if (element.contains(document.activeElement)) owed ??= "focus";
        items.delete(element);
        changed();
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(nextFocus: CalendarFocus | null, nextEntry: RovingEntry) {
      focus = nextFocus;
      getEntry = nextEntry;
      if (nextFocus !== null) entryCommand = "home";
      changed();
      if (owed !== null) focusNow();
    },
  });
}

const selectFocus = (state: AnyCalendarState) => state.focus as CalendarFocus | null;

/** The active view's entry points, from its navigation with no focus. */
export function viewEntry(view: CalendarActiveView<AnyCalendarView> | null): RovingEntry {
  return (command) => {
    if (view === null) return null;
    const { definition, environment, options, projection, range } = view;
    const result = definition.strategy.getSpatialNavigation?.({
      command,
      environment,
      focus: null,
      options,
      projection,
      range,
      snap: DEFAULT_SNAP,
    });
    return result != null && "focus" in result ? result.focus : null;
  };
}

/**
 * Keeps the active view's roving store on the root's focus. Rendered after the view, so the
 * elements of a commit are registered before focus moves to one of them.
 */
export function RovingFocusSync({
  roving,
  source,
  view,
}: {
  readonly roving: RovingFocusStore;
  readonly source: CalendarStateSource<AnyCalendarState>;
  readonly view: CalendarActiveView<AnyCalendarView>;
}) {
  const focus = useStateSelector(source, selectFocus);
  const entry = useMemo(() => viewEntry(view), [view]);
  useLayoutEffect(() => roving.update(focus, entry), [entry, focus, roving]);
  return null;
}

function focusKey(target: CalendarFocus): string {
  const { resourceId } = target;
  // `1` and `"1"` are distinct IDs, and `null` (unassigned) differs from no resource.
  const resource =
    resourceId === undefined
      ? ""
      : resourceId === null
        ? "|unassigned"
        : `|${typeof resourceId}:${resourceId}`;
  switch (target.kind) {
    case "day":
      return `day:${target.date.toString()}${resource}`;
    case "slot":
      return `slot:${target.date.toString()}T${target.time.toString()}${resource}`;
    case "event":
      return `event:${typeof target.eventId}:${target.eventId}@${target.date.toString()}${resource}`;
  }
}

export interface CalendarRovingFocusOptions {
  /** Dates an event element shows from `target.date`, such as a month segment's span. */
  readonly days?: number;
}

export interface CalendarRovingFocusProps {
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly ref: RefCallback<HTMLElement>;
  readonly tabIndex: 0 | -1;
}

/**
 * Props for one focusable element of a view: a day cell, a slot, or an event. The view's one tab
 * stop gets `tabIndex={0}`; focusing an element makes it the calendar's focus, and keyboard
 * navigation moves DOM focus to the new target, even when it renders in a new place. Only the
 * elements whose tab stop changes re-render.
 */
export function useRovingFocus(
  target: CalendarFocus,
  { days = 1 }: CalendarRovingFocusOptions = {},
): CalendarRovingFocusProps {
  const { actions, read } = useInteractionRuntime();
  const { roving } = useViewRuntime();
  const latest = useRef(target);
  useInsertionEffect(() => {
    latest.current = target;
  });
  const isTabStop = () => roving.isTabStop(target, days);
  const tabStop = useSyncExternalStore(roving.subscribe, isTabStop, isTabStop);
  const key = focusKey(target);

  const ref = useCallback(
    (element: HTMLElement | null) =>
      element === null ? undefined : roving.register(element, latest.current, days),
    // The key changes exactly when the target does.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [days, key, roving],
  );
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      const focus = read().focus as CalendarFocus | null;
      const landed = focus === null ? null : landOn(focus, latest.current, days);
      // Focus already on this element stays as it is, keeping an event's date within the element.
      if (landed === null || landed !== focus) actions.setFocus(landed ?? latest.current);
    },
    [actions, days, read],
  );

  return { onFocus, ref, tabIndex: tabStop ? 0 : -1 };
}
