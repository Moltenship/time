import type { CalendarFocus } from "@moltenship/calendar-core";
import {
  calendarFocusKey,
  calendarViewEntry,
  focusRovingTarget,
  type RovingFocusStore,
} from "@moltenship/calendar-primitives";
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
import { useInteractionRuntime, useViewRuntime } from "./interaction";
import { useStateSelector } from "./state-binding";
import type { AnyCalendarView, CalendarActiveView } from "./views";

const selectFocus = (state: AnyCalendarState) => state.focus as CalendarFocus | null;

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
  const entry = useMemo(() => calendarViewEntry(view), [view]);
  useLayoutEffect(() => roving.update(focus, entry), [entry, focus, roving]);
  return null;
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
  const key = calendarFocusKey(target);

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
      focusRovingTarget({ actions, read }, latest.current, days, event.nativeEvent);
    },
    [actions, days, read],
  );

  return { onFocus, ref, tabIndex: tabStop ? 0 : -1 };
}
