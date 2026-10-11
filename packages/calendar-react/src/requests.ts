import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import { useInsertionEffect, useLayoutEffect, useRef } from "react";

import { useInteractionRuntime } from "./interaction";

/**
 * Calls `listener` whenever something asks the calendar for an anchor date: Previous, Next,
 * Today, keys paging past the view, or `setAnchorDate`, even a date that is already the anchor.
 * `range` is what the view on screen shows for that date, so a view can tell a request for the
 * range it has, as Today in this week, from one that moves it. A view whose scroll position can
 * run ahead of the anchor, as a scrolling view's does while a controlled anchor catches up, uses
 * it to show its range again when asked.
 */
export function useAnchorDateRequests(
  listener: (date: Temporal.PlainDate, range: PlainDateInterval | null) => void,
): void {
  const { rangeOf, requests } = useInteractionRuntime();
  const latest = useRef(listener);
  useInsertionEffect(() => {
    latest.current = listener;
  });
  useLayoutEffect(
    () =>
      requests((slice, value) => {
        if (slice !== "anchorDate") return;
        const date = value as Temporal.PlainDate;
        latest.current(date, rangeOf(date));
      }),
    [rangeOf, requests],
  );
}
