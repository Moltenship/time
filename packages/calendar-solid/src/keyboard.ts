import type { CalendarInteractionCheck, CalendarKeyboardSession } from "@moltenship/calendar-core";
import {
  createCalendarKeyboard,
  type CalendarKeyboardOptions,
  type CalendarStateSelectorOptions,
  type KeyboardGrab,
} from "@moltenship/calendar-primitives";
import { isServer } from "@solidjs/web";
import { createMemo, onCleanup, untrack, type Accessor } from "solid-js";

import {
  access,
  useInteractionNow,
  useShared,
  viewRuntimeContext,
  type MaybeAccessor,
} from "./shared";
import { createStateSelector } from "./state-selector";

export type { CalendarKeyboardOptions };

/**
 * Keyboard navigation and keyboard move, resize, and create for a view. Returns a ref for the
 * element around its focusable cells and events (see `useRovingFocus`): `<div ref={keyboard}>`,
 * or `ref={[keyboard, pointer]}` beside `useCalendarPointer`.
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
 * The ref listens for `keydown` and `focusout` on the element itself, not through Solid's
 * delegation to the document, so Escape's stopped propagation keeps it from the handlers around
 * the view. A delegated `onKeyDown` inside the view therefore runs after the calendar has taken
 * its key; an element that takes a key for itself listens natively, from a ref, and calls
 * `preventDefault()`, which the calendar respects. `options` is read whenever a key arrives. Every phase is announced through the root's
 * `Announcer`, and a view that unmounts mid-gesture leaves nothing grabbed.
 */
export function useCalendarKeyboard(
  options: MaybeAccessor<CalendarKeyboardOptions> = {},
): (element: HTMLElement) => void {
  const { interaction, resources } = useShared();
  const view = viewRuntimeContext.use();
  const keyboard = createMemo(() =>
    createCalendarKeyboard(
      interaction(),
      view,
      () => untrack(() => access(options)),
      () => untrack(resources),
    ),
  );
  // The store, not the controller: a new controller, as when a controlled slice changes the
  // runtime, keeps the gesture going.
  const session = useInteractionNow().keyboard;

  let detach: (() => void) | undefined;
  if (!isServer) {
    onCleanup(() => {
      detach?.();
      session.set(null);
    });
  }
  return (element: HTMLElement) => {
    detach?.();
    const keyDown = (event: KeyboardEvent) => untrack(keyboard).keyDown(event);
    const focusOut = (event: FocusEvent) => untrack(keyboard).focusOut(event, element);
    element.addEventListener("keydown", keyDown);
    element.addEventListener("focusout", focusOut);
    detach = () => {
      element.removeEventListener("keydown", keyDown);
      element.removeEventListener("focusout", focusOut);
    };
  };
}

const selectSession = (session: CalendarKeyboardSession | null) => session;

/**
 * The keyboard gesture in progress, or `null` while idle, as an accessor. Pass a selector to
 * update only when its result changes, such as whether a cell is inside a create's range. The
 * selector also gets what the root's policies say about committing the gesture now, to show an
 * invalid preview.
 */
export function useCalendarInteraction(): Accessor<CalendarKeyboardSession | null>;
export function useCalendarInteraction<TSelected>(
  selector: (session: CalendarKeyboardSession | null, check: CalendarInteractionCheck) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): Accessor<TSelected>;
export function useCalendarInteraction<TSelected>(
  selector: (
    session: CalendarKeyboardSession | null,
    check: CalendarInteractionCheck,
  ) => TSelected = selectSession as never,
  options?: CalendarStateSelectorOptions<TSelected>,
): Accessor<TSelected> {
  return createStateSelector(
    useInteractionNow().keyboard.grabs,
    (grab: KeyboardGrab | null) => selector(grab?.session ?? null, grab?.check ?? null),
    options,
  );
}
