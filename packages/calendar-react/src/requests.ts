import { useInsertionEffect, useLayoutEffect, useRef } from "react";

import { useInteractionRuntime } from "./interaction";

/**
 * Calls `listener` whenever something asks the calendar for an anchor date: Previous, Next,
 * Today, keys paging past the view, or `setAnchorDate`, even a date that is already the anchor.
 * A view whose scroll position can run ahead of the anchor, as a scrolling view's does while a
 * controlled anchor catches up, uses it to show the anchor again when asked.
 */
export function useAnchorDateRequests(listener: (date: Temporal.PlainDate) => void): void {
  const { requests } = useInteractionRuntime();
  const latest = useRef(listener);
  useInsertionEffect(() => {
    latest.current = listener;
  });
  useLayoutEffect(
    () =>
      requests((slice, value) => {
        if (slice === "anchorDate") latest.current(value as Temporal.PlainDate);
      }),
    [requests],
  );
}
