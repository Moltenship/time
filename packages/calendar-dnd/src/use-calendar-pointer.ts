import type { EventId, ResourceId } from "@moltenship/calendar-core";
import { useCallback, useLayoutEffect, useRef, type RefCallback } from "react";

import { attachCalendarPointer, type CalendarPointerOptions } from "./attach-calendar-pointer";

/**
 * Pointer move, resize, and create for a view region; see `attachCalendarPointer` for the data
 * attributes the view renders. Returns a ref for the region element. Options are read when a
 * gesture starts, so changing them never re-attaches listeners, and dragging never re-renders.
 */
export function useCalendarPointer<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(options: CalendarPointerOptions<TEvent, TEventId, TResourceId>): RefCallback<HTMLElement> {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  return useCallback(
    (element: HTMLElement | null) =>
      element === null ? undefined : attachCalendarPointer(element, () => latest.current),
    [],
  );
}
