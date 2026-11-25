import type { CalendarInteractionCheck, CalendarKeyboardSession } from "@moltenship/calendar-core";
import {
  createCalendarKeyboard,
  type CalendarKeyboardOptions,
} from "@moltenship/calendar-primitives";
import {
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { useInteractionRuntime, useViewRuntime } from "./interaction";
import { CalendarResourcesContext } from "./resources";
import { useStateSelector } from "./state-binding";
import type { CalendarStateSelectorOptions } from "./types";

export type { CalendarKeyboardOptions };

/** Handlers for the element that holds a view's focusable cells and events. */
export interface CalendarKeyboardHandlers {
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Keyboard navigation and keyboard move, resize, and create for a view; spread the handlers on
 * the element around its focusable cells and events (see `useRovingFocus`).
 *
 * - Arrow keys, Home, End, Page Up, and Page Down move focus through the view's
 *   `getSpatialNavigation`, navigating the view when focus leaves it. Enter moves into a cell's
 *   events and Escape back out.
 * - Space grabs the focused event to move it, or the focused cell to create an event there;
 *   Shift+Space grabs an event's end to resize it, and again switches to its start. Navigation
 *   keys then step the gesture, Enter or Space commits it through `proposeEventChange`, and
 *   Escape, Tab, or leaving the view cancels it. On a root without `onEventChange`, Space grabs
 *   nothing.
 *
 * Every phase is announced through the root's `Announcer`.
 */
export function useCalendarKeyboard(
  options: CalendarKeyboardOptions = {},
): CalendarKeyboardHandlers {
  const interaction = useInteractionRuntime();
  const view = useViewRuntime();
  const resources = useContext(CalendarResourcesContext);
  const latest = useRef({ options, resources });
  useInsertionEffect(() => {
    latest.current = { options, resources };
  });
  const keyboard = useMemo(
    () =>
      createCalendarKeyboard(
        interaction,
        view,
        () => latest.current.options,
        () => latest.current.resources,
      ),
    [interaction, view],
  );
  // A view that unmounts mid-gesture leaves nothing grabbed. The store, not the controller: a
  // new controller, as when a controlled slice changes the runtime, keeps the gesture going.
  const { keyboard: session } = interaction;
  useEffect(() => () => session.set(null), [session]);
  return useMemo(
    () =>
      Object.freeze({
        // React's events wrap the DOM's: prevented and stopped through the wrapper, React's own
        // handlers further out see it.
        onBlur: (event: FocusEvent<HTMLElement>) =>
          keyboard.focusOut(event.nativeEvent, event.currentTarget),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) =>
          keyboard.keyDown(event.nativeEvent, event),
      }),
    [keyboard],
  );
}

const selectSession = (session: CalendarKeyboardSession | null) => session;

/**
 * The keyboard gesture in progress, or `null` while idle. Pass a selector to re-render only when
 * its result changes, such as whether a cell is inside a create's range. The selector also gets
 * what the root's policies say about committing the gesture now, to show an invalid preview.
 */
export function useCalendarInteraction(): CalendarKeyboardSession | null;
export function useCalendarInteraction<TSelected>(
  selector: (session: CalendarKeyboardSession | null, check: CalendarInteractionCheck) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected;
export function useCalendarInteraction<TSelected>(
  selector: (
    session: CalendarKeyboardSession | null,
    check: CalendarInteractionCheck,
  ) => TSelected = selectSession as never,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected {
  return useStateSelector(
    useInteractionRuntime().keyboard.grabs,
    (grab) => selector(grab?.session ?? null, grab?.check ?? null),
    options,
  );
}
