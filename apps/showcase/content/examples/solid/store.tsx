// #region store
import { createCalendarStore, createStateSelector } from "@moltenship/calendar-solid";

import type { View } from "./calendar";

export const store = createCalendarStore<View>({
  defaultView: "list",
  defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
  defaultTimeZone: "Europe/Berlin",
});

// An accessor of one value, for a component outside <Calendar.Root store={store}>.
export function AnchorDate() {
  const anchorDate = createStateSelector(store, (state) => state.anchorDate, {
    isEqual: (a, b) => a.equals(b),
  });
  return <time>{anchorDate().toString()}</time>;
}
// #endregion store
