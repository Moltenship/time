import type { CalendarFocus } from "@moltenship/calendar-core";
import {
  calendarFocusKey,
  calendarViewEntry,
  focusRovingTarget,
  type AnyCalendarState,
  type CalendarActiveView,
  type CalendarStateSource,
  type RovingFocusStore,
} from "@moltenship/calendar-primitives";
import { isServer } from "@solidjs/web";
import {
  createEffect,
  createMemo,
  createRenderEffect,
  isHydrating,
  onCleanup,
  onSettled,
  untrack,
  type Accessor,
} from "solid-js";

import { access, useShared, viewRuntimeContext, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";
import type { AnyCalendarView } from "./views";

const selectFocus = (state: AnyCalendarState) => state.focus as CalendarFocus | null;
const nothing = () => null;

/**
 * Keeps the active view's roving store on the root's focus and the view's entry. A user effect,
 * so it runs once the view's elements of a flush are in the document and registered, and DOM
 * focus can move to one of them, as React's layout effect after the view does.
 */
export function syncRovingFocus(
  roving: RovingFocusStore,
  source: Accessor<CalendarStateSource<AnyCalendarState>>,
  view: Accessor<CalendarActiveView<AnyCalendarView> | null>,
): void {
  const focus = createStateSelector(source, selectFocus);
  createEffect(
    () => ({ focus: focus(), view: view() }),
    (next) => {
      roving.update(next.focus, calendarViewEntry(next.view));
    },
  );
}

export interface CalendarRovingFocusOptions {
  /** Dates an event element shows from `target.date`, such as a month segment's span. */
  readonly days?: number;
}

/** Spread on the element, or pass each: `<button {...roving}>`. `tabindex` is a getter. */
export interface CalendarRovingFocusProps {
  readonly onFocus: (event: FocusEvent) => void;
  readonly ref: (element: HTMLElement) => void;
  readonly tabindex: 0 | -1;
}

/**
 * Props for one focusable element of a view: a day cell, a slot, or an event. The view's one tab
 * stop gets `tabindex={0}`; focusing an element makes it the calendar's focus, and keyboard
 * navigation moves DOM focus to the new target, even when it renders in a new place. Only the
 * elements whose tab stop changes update. `target` and `options` may be accessors, as a keyed
 * `For` item's are; the element registers again when its target changes.
 *
 * The element stays registered until the hook's owner is disposed, as Solid never calls a ref
 * with `null`: render it for as long as the component lives, and put `Show` around the component
 * rather than around the element.
 */
export function useRovingFocus(
  target: MaybeAccessor<CalendarFocus>,
  options: MaybeAccessor<CalendarRovingFocusOptions> = {},
): CalendarRovingFocusProps {
  const { interaction } = useShared();
  const { roving } = viewRuntimeContext.use();
  // A new projection hands the same target as a new object: it counts as new only when its key
  // changes, so the tab stop isn't read again in a flush that hasn't moved it.
  const targetOf = createMemo(() => access(target), {
    equals: (left, right) => calendarFocusKey(left) === calendarFocusKey(right),
  });
  const daysOf = createMemo(() => access(options).days ?? 1);
  // Read each time the roving store says the tab stop may have moved, and when the target does.
  const tabStop = createStateSelector({ getSnapshot: nothing, subscribe: roving.subscribe }, () =>
    roving.isTabStop(targetOf(), daysOf()),
  );
  const key = createMemo(() => `${calendarFocusKey(targetOf())}#${daysOf()}`);

  let element: HTMLElement | undefined;
  let release: (() => void) | undefined;
  const register = () => {
    release?.();
    release =
      element === undefined
        ? undefined
        : roving.register(element, untrack(targetOf), untrack(daysOf));
  };
  // A new target registers the element again. Its first run comes before the element exists.
  createRenderEffect(key, () => {
    if (!isServer && release !== undefined) register();
  });
  // While hydrating, the element registers once the tree settles: before any element registers,
  // the view's entry is the tab stop, as on the server, so hydration reads what the server
  // rendered. Called on the server too, where it never runs, to keep hydration's ids aligned.
  onSettled(() => {
    if (release === undefined) register();
  });
  if (!isServer) onCleanup(() => release?.());
  return {
    onFocus(event: FocusEvent) {
      if (event.target !== event.currentTarget) return;
      focusRovingTarget(untrack(interaction), untrack(targetOf), untrack(daysOf), event);
    },
    ref(node: HTMLElement) {
      element = node;
      // Registered at once, so the view's effect that moves DOM focus finds it; a new element for
      // the same target, as when the part around it renders it again, takes its place.
      if (release !== undefined || !isHydrating()) register();
    },
    get tabindex() {
      return tabStop() ? 0 : -1;
    },
  };
}
