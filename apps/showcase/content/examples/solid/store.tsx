// #region store
import { createCalendarStore, createStateSelector } from "@moltenship/calendar-solid";

import { seed, weekRules } from "./app";
import { Calendar, type View } from "./calendar";

export const store = createCalendarStore<View>({
  defaultView: "list",
  defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
  defaultTimeZone: "Europe/Berlin",
});

store.actions.setAnchorDate(Temporal.PlainDate.from("2026-10-15"));
console.log(store.getSnapshot().anchorDate.toString()); // 2026-10-15
// #endregion store

// #region selector
export function AnchorDate() {
  const anchorDate = createStateSelector(store, (state) => state.anchorDate, {
    isEqual: (a, b) => a.equals(b),
  });
  return <time>{anchorDate().toString()}</time>;
}
// #endregion selector

// #region root
function JumpToHolidays() {
  return (
    <button
      type="button"
      onClick={() => store.actions.setAnchorDate(Temporal.PlainDate.from("2026-12-24"))}
    >
      Holidays
    </button>
  );
}

export function Page() {
  return (
    <>
      <JumpToHolidays />
      <Calendar.Root
        store={store}
        events={seed}
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.ActiveView />
      </Calendar.Root>
    </>
  );
}
// #endregion root
