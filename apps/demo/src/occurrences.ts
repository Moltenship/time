import type { CalendarVisibleRange } from "@moltenship/calendar";
import { createOccurrenceExpander } from "@moltenship/calendar-recurrence";
import { useCallback, useMemo, useState } from "react";

import { demoAdapters, type DemoEvent } from "./demo-model";
import { around, covering } from "./load-range";

/**
 * The calendar's items: `events` with each series expanded into its occurrences over the dates
 * the calendar loads, as `onVisibleRangeChange` reports them. Pass `onVisibleRangeChange` to
 * `Root`. Expansion reuses earlier work for events that are the same objects, and the result is
 * memoized, so a re-render that changes neither events nor dates hands the calendar the same list.
 */
export function useOccurrences(
  events: readonly DemoEvent[],
  timeZone: string,
  anchorDate: Temporal.PlainDate,
) {
  // Timed series carry the zone they repeat in; the display zone covers any that don't.
  const expander = useMemo(
    () => createOccurrenceExpander(demoAdapters, { defaultTimeZone: timeZone }),
    [timeZone],
  );
  const [loadRange, setLoadRange] = useState(() => around(anchorDate));
  const onVisibleRangeChange = useCallback(
    (visible: CalendarVisibleRange) =>
      setLoadRange((current) => covering(current, visible.loadRange)),
    [],
  );
  const expansion = useMemo(
    () => expander.expand(events, { range: loadRange, timeZone }),
    [events, expander, loadRange, timeZone],
  );
  return { issues: expansion.issues, occurrences: expansion.occurrences, onVisibleRangeChange };
}
