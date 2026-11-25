import type { PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarInteractionRuntime } from "./interaction";

/**
 * Calls `listener` whenever something asks the root for an anchor date, until the returned
 * cleanup runs: Previous, Next, Today, keys paging past the view, or `setAnchorDate`, even a date
 * that is already the anchor. `range` is what the view on screen shows for that date (`null`
 * without one), so a view can tell a request for the range it has, as Today in this week, from
 * one that moves it.
 */
export function subscribeAnchorDateRequests(
  { rangeOf, requests }: Pick<CalendarInteractionRuntime, "rangeOf" | "requests">,
  listener: (date: Temporal.PlainDate, range: PlainDateInterval | null) => void,
): () => void {
  return requests((slice, value) => {
    if (slice !== "anchorDate") return;
    const date = value as Temporal.PlainDate;
    listener(date, rangeOf(date));
  });
}
