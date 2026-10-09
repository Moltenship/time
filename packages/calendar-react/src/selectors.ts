import type { CalendarFocus, CalendarSelection } from "@moltenship/calendar-core";

import type { AnyCalendarState } from "./context";
import { useInteractionRuntime } from "./interaction";
import { useStateSelector } from "./state-binding";
import type { CalendarStateSelectorOptions } from "./types";

/**
 * Selects from the calendar's focus for a view's item, such as whether a slot cursor sits on this
 * column. A component re-renders only when its result changes.
 */
export function useCalendarFocus<TSelected>(
  selector: (focus: CalendarFocus | null) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected {
  return useStateSelector(
    useInteractionRuntime().source,
    (state: AnyCalendarState) => selector(state.focus as CalendarFocus | null),
    options,
  );
}

/**
 * Selects from the calendar's selection, as `useCalendarFocus` does from its focus:
 * `useCalendarSelection((selection) => selection?.kind === "event" && selection.eventId === id)`.
 */
export function useCalendarSelection<TSelected>(
  selector: (selection: CalendarSelection | null) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected {
  return useStateSelector(
    useInteractionRuntime().source,
    (state: AnyCalendarState) => selector(state.selection as CalendarSelection | null),
    options,
  );
}
