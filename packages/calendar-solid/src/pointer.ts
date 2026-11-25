import type { EventId, ResourceId } from "@moltenship/calendar-core";
import { isServer } from "@solidjs/web";
import { createMemo, createRenderEffect, onCleanup, untrack } from "solid-js";

import { attachCalendarPointer, type CalendarPointerOptions } from "@moltenship/calendar-dnd";

import { access, type MaybeAccessor } from "./shared";

/**
 * Pointer move, resize, and create for a view region; see `attachCalendarPointer` for the data
 * attributes the view renders. Returns a ref for the region element: `<div ref={pointer}>`, or
 * `ref={[keyboard, pointer]}` beside `useCalendarKeyboard`. `options`, an object or an accessor
 * of one, is read when a gesture starts, and `columns` again as it moves, so changing them never
 * re-attaches listeners, and dragging never updates Solid. `disabled` is the exception: a
 * disabled region doesn't listen for touch moves, so a read-only calendar's swipes never wait for
 * its listener, and changing it attaches the listeners again. Everything is detached with the
 * owner, a drag in progress included.
 */
export function useCalendarPointer<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  options: MaybeAccessor<CalendarPointerOptions<TEvent, TEventId, TResourceId>>,
): (element: HTMLElement) => void {
  const read = () => untrack(() => access(options));
  const disabled = createMemo(() => access(options).disabled === true);

  let element: HTMLElement | undefined;
  let attachedDisabled: boolean | undefined;
  let detach: (() => void) | undefined;
  const attach = () => {
    detach?.();
    attachedDisabled = untrack(disabled);
    detach = element === undefined ? undefined : attachCalendarPointer(element, read);
  };
  createRenderEffect(disabled, (next) => {
    if (!isServer && element !== undefined && next !== attachedDisabled) attach();
  });
  if (!isServer) {
    onCleanup(() => {
      detach?.();
      detach = undefined;
    });
  }

  return (node: HTMLElement) => {
    element = node;
    attach();
  };
}
