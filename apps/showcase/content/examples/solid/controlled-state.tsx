import type { CalendarPublicState } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { seed, weekRules } from "./app";
import { Calendar } from "./calendar";

// #region hooks
const selectAnchorDate = (state: CalendarPublicState) => state.anchorDate;

function NextWeekButton() {
  const anchorDate = Calendar.useCalendarSelector(selectAnchorDate);
  const actions = Calendar.useCalendarActions();

  return (
    <button type="button" onClick={() => actions.setAnchorDate(anchorDate().add({ weeks: 1 }))}>
      Skip a week
    </button>
  );
}
// #endregion hooks

// #region uncontrolled
export function UncontrolledCalendar() {
  return (
    <Calendar.Root
      events={seed}
      defaultView="list"
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion uncontrolled

// #region app
export function ControlledCalendar() {
  const [anchorDate, setAnchorDate] = createSignal(Temporal.PlainDate.from("2026-10-08"));

  return (
    <>
      <input
        type="date"
        value={anchorDate().toString()}
        onInput={(event) => {
          if (event.currentTarget.value) {
            setAnchorDate(Temporal.PlainDate.from(event.currentTarget.value));
          }
        }}
      />
      <Calendar.Root
        events={seed}
        anchorDate={anchorDate()}
        onAnchorDateChange={(date) => setAnchorDate(date)}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
        <Calendar.NextTrigger>Next</Calendar.NextTrigger>
        <NextWeekButton />
        <Calendar.ActiveView />
      </Calendar.Root>
    </>
  );
}
// #endregion app

// #region event
export function NextButton() {
  const actions = Calendar.useCalendarActions();

  return (
    <button type="button" onClick={(event) => actions.navigateNext({ event })}>
      Next
    </button>
  );
}
// #endregion event
