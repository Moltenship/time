import type { CalendarFocus, CalendarSelection } from "@moltenship/calendar-core";
import type {
  AnyCalendarState,
  CalendarStateSelectorOptions,
} from "@moltenship/calendar-primitives";
import type { Accessor } from "solid-js";

import { useShared } from "./shared";
import { createStateSelector } from "./state-selector";

/**
 * Selects from the calendar's focus for a view's item, such as whether a slot cursor sits on this
 * column, as an accessor; whatever reads it updates only when its result changes. Works inside
 * any calendar's root.
 */
export function useCalendarFocus<TSelected>(
  selector: (focus: CalendarFocus | null) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): Accessor<TSelected> {
  const { interaction } = useShared();
  return createStateSelector(
    () => interaction().source,
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
): Accessor<TSelected> {
  const { interaction } = useShared();
  return createStateSelector(
    () => interaction().source,
    (state: AnyCalendarState) => selector(state.selection as CalendarSelection | null),
    options,
  );
}
