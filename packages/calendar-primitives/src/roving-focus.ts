import { sameFocus, type CalendarFocus } from "@moltenship/calendar-core";

import {
  DEFAULT_SNAP,
  type CalendarInteractionRuntime,
  type CalendarViewRuntime,
} from "./interaction";
import { createListeners } from "./listeners";
import type { AnyCalendarViewDefinition, CalendarActiveView } from "./views";

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

/** The tab stop as `resolve` found it, and how, so an element registering can keep it. */
interface Resolution extends ResolvedTabStop {
  /** On the focus's element, on the entry's, first in document order, or with no elements. */
  readonly by: "empty" | "entry" | "focus" | "order";
  readonly entry: CalendarFocus | null;
  /** Whether it landed in the target's own resource, which no later element beats. */
  readonly exact: boolean;
}

/**
 * Where focus enters the active view: its default entry (`"home"`), or its last target (`"end"`),
 * as focus does after paging back. `calendarViewEntry` gives a view's.
 */
export type CalendarRovingEntry = (command: "end" | "home") => CalendarFocus | null;

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
  /** Whether the element showing `target` across `days` dates is the tab stop. */
  readonly isTabStop: (target: CalendarFocus, days: number) => boolean;
  /**
   * Adds an element that shows `target` across `days` dates; returns the cleanup that removes it.
   * Elements a commit registers one by one are told about once, after it, in a microtask.
   */
  readonly register: (element: HTMLElement, target: CalendarFocus, days: number) => () => void;
  /** Tells `listener` when the tab stop may have moved. */
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Follows the root's focus and the active view's entry. Call it once the elements of a render
   * have registered, so DOM focus can move to one of them.
   */
  readonly update: (focus: CalendarFocus | null, getEntry: CalendarRovingEntry) => void;
}

/** Creates the roving focus of one rendered active view, entering it through `initialEntry`. */
export function createRovingFocusStore(initialEntry: CalendarRovingEntry): RovingFocusStore {
  const items = new Map<HTMLElement, RovingItem>();
  const listeners = createListeners();
  let focus: CalendarFocus | null = null;
  let getEntry = initialEntry;
  let entryCommand: "end" | "home" = "home";
  let resolved: Resolution | null = null;
  /**
   * DOM focus owed after the next update: to the tab stop, as keyboard navigation asks, or only
   * to the focused target once it renders, after the element holding DOM focus went away.
   */
  let owed: "focus" | "tab-stop" | null = null;
  /**
   * The last element let go while it held DOM focus. It can stay in the document, as a scrolling
   * view keeps days around the visible ones, and focus on it is still the view's to move.
   */
  let released: HTMLElement | null = null;

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

  function resolve(): Resolution {
    if (resolved !== null) return resolved;
    const entry = getEntry(entryCommand);
    // A view without navigation has no entry, so its focus has to stand in.
    if (items.size === 0) {
      return (resolved = { by: "empty", entry, exact: false, target: entry ?? focus });
    }
    const found = find(focus);
    if (found !== undefined) {
      return (resolved = {
        ...found,
        by: "focus",
        entry,
        exact: found.target === focus,
        isFocus: true,
      });
    }
    const entered = find(entry);
    if (entered !== undefined) {
      return (resolved = { ...entered, by: "entry", entry, exact: entered.target === entry });
    }
    const [element] = [...items.keys()].sort((left, right) =>
      left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return (resolved = {
      by: "order",
      element,
      entry,
      exact: false,
      target: element === undefined ? null : items.get(element)!.target,
    });
  }

  /**
   * Whether `item`, registering after every other element, can move the resolved tab stop. `find`
   * takes the first element that lands on its target, so a later one wins only by landing in the
   * target's own resource where the first didn't, or by landing on the focus when the tab stop
   * isn't on it. Elements register while a commit reads their tab stops, so keeping the tab stop
   * saves a pass over every element for each one.
   */
  function moves(item: RovingItem, { by, entry, exact }: Resolution): boolean {
    const lands = (target: CalendarFocus | null) =>
      target === null ? null : landOn(target, item.target, item.days);
    if (by === "focus") return !exact && lands(focus) === focus;
    if (by === "entry") return lands(focus) !== null || (!exact && lands(entry) === entry);
    // An element's place in the document is only known once it's in it.
    return true;
  }

  function changed() {
    resolved = null;
    listeners.notify();
  }

  let notifying = false;
  /**
   * `changed` for elements coming and going: a commit registers them one by one, hundreds in a
   * year of days, so their elements hear once, after it, rather than once per element.
   */
  function changedLater() {
    if (notifying) return;
    notifying = true;
    queueMicrotask(() => {
      notifying = false;
      changed();
    });
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
    const ours = itemAt(active) !== undefined || released?.contains(active) === true;
    if (active !== null && active !== document.body && !ours) return;
    released = null;
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
      // The elements registering next no longer clear the tab stop, so it would keep "home".
      resolved = null;
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
      const item = { days, target };
      const known = items.get(element);
      if (resolved !== null) {
        // An element registering again keeps its place among the others, so a new target there
        // can move the tab stop wherever it lands; the same target leaves it.
        const same = known !== undefined && known.days === days && sameFocus(known.target, target);
        if (known === undefined ? moves(item, resolved) : !same) resolved = null;
      }
      items.set(element, item);
      changedLater();
      // The focused target can come back without a calendar update, as when a view re-renders it.
      if (owed === "focus") retryOwedFocus();
      return () => {
        if (items.get(element)?.target !== target) return;
        // The focused element is leaving, as when a grabbed event moves between the all-day row
        // and the columns: focus whatever takes its place.
        if (element.contains(document.activeElement)) {
          owed ??= "focus";
          released = element;
        }
        items.delete(element);
        // Only the tab stop's own element leaving moves it: the first exact or compatible match,
        // and the first in the document, stay first when another goes. An element moved in the
        // document meanwhile is caught by the notice after the commit, which resolves again.
        if (resolved?.element === element) resolved = null;
        changedLater();
      };
    },
    subscribe: listeners.subscribe,
    update(nextFocus: CalendarFocus | null, nextEntry: CalendarRovingEntry) {
      focus = nextFocus;
      getEntry = nextEntry;
      if (nextFocus !== null) entryCommand = "home";
      changed();
      if (owed !== null) focusNow();
    },
  });
}

/** The active view's entry points, from its spatial navigation with no focus. */
export function calendarViewEntry(
  view: CalendarActiveView<AnyCalendarViewDefinition> | null,
): CalendarRovingEntry {
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
 * The focus plumbing of one rendered active view: `getView` reads the latest active view, and the
 * roving store starts from the view `getView` returns now, so server markup gets its tab stop.
 * Keep the store on the root's focus with `roving.update(focus, calendarViewEntry(view))` after
 * the view's elements register.
 */
export function createCalendarViewRuntime(
  getView: () => CalendarActiveView<AnyCalendarViewDefinition> | null,
): CalendarViewRuntime {
  return Object.freeze({ getView, roving: createRovingFocusStore(calendarViewEntry(getView())) });
}

/**
 * A key for a focus target that changes exactly when the target does, for an integration that
 * registers an element again when its target changes. `1` and `"1"` are distinct IDs, and `null`
 * (unassigned) differs from no resource.
 */
export function calendarFocusKey(target: CalendarFocus): string {
  const { resourceId } = target;
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

/**
 * What an element showing `target` across `days` dates does when it takes DOM focus itself (call
 * it only when the focus event's target is that element): it becomes the calendar's focus. Focus
 * already on it stays as it is, keeping an event's date within the element. `event`, the focus
 * event, reaches the state handlers, so they hear the click or key that moved focus.
 */
export function focusRovingTarget(
  { actions, read }: Pick<CalendarInteractionRuntime, "actions" | "read">,
  target: CalendarFocus,
  days: number,
  event: Event,
): void {
  const focus = read().focus as CalendarFocus | null;
  const landed = focus === null ? null : landOn(focus, target, days);
  if (landed === null || landed !== focus) {
    actions.setFocus(landed ?? target, { event, reason: "focus-change" });
  }
}
