import type { EventId, ResourceId } from "@moltenship/calendar-core";
import { useCallback, useInsertionEffect, useRef, type RefCallback } from "react";

import { attachCalendarPointer, type CalendarPointerOptions } from "./attach-calendar-pointer";

/**
 * Pointer move, resize, and create for a view region; see `attachCalendarPointer` for the data
 * attributes the view renders. Returns a ref for the region element. Options are read when a
 * gesture starts, and `columns` again as it moves, so changing them never re-attaches listeners,
 * and dragging never re-renders. `disabled` is the exception: a disabled region doesn't listen for
 * touch moves, so a read-only calendar's swipes never wait for its listener, and changing it
 * attaches the listeners again.
 */
export function useCalendarPointer<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(options: CalendarPointerOptions<TEvent, TEventId, TResourceId>): RefCallback<HTMLElement> {
  const latest = useRef(options);
  useInsertionEffect(() => {
    latest.current = options;
  });

  const disabled = options.disabled === true;
  return useCallback(
    (element: HTMLElement | null) =>
      element === null ? undefined : attachCalendarPointer(element, () => latest.current),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- re-attaches when it changes.
    [disabled],
  );
}
