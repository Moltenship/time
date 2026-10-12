// #region expand
import type { CalendarVisibleRange, PlainDateInterval } from "@moltenship/calendar";
import { createOccurrenceExpander } from "@moltenship/calendar-recurrence";
import { useMemo, useState } from "react";

import { adapters, type TeamEvent } from "./recurrence-calendar";

/**
 * The occurrences of `events` on the dates the calendar asks for. Pass `occurrences` to `events`
 * on `Root`, and `onVisibleRangeChange` to the prop of that name.
 */
export function useOccurrences(
  events: readonly TeamEvent[],
  timeZone: string,
  // The dates the calendar opens on, so its first render isn't empty.
  initialRange: PlainDateInterval,
) {
  // One expander for as long as the calendar is mounted: it keeps its work for series that
  // didn't change, and returns the same occurrence objects for them.
  const [expander] = useState(() => createOccurrenceExpander(adapters));
  const [range, setRange] = useState(initialRange);
  const expansion = useMemo(
    () => expander.expand(events, { range, timeZone }),
    [expander, events, range, timeZone],
  );

  return {
    issues: expansion.issues,
    occurrences: expansion.occurrences,
    onVisibleRangeChange: ({ loadRange }: CalendarVisibleRange) => setRange(loadRange),
  };
}
// #endregion expand
