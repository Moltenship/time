"use client";

import type { CalendarPublicState } from "@moltenship/calendar";
import { useState } from "react";

import { Calendar, meetings, weekRules } from "./quick-start";

// #region hooks
const selectAnchorDate = (state: CalendarPublicState) => state.anchorDate;

function NextWeekButton() {
  const anchorDate = Calendar.useCalendarSelector(selectAnchorDate);
  const actions = Calendar.useCalendarActions();

  return (
    <button type="button" onClick={() => actions.setAnchorDate(anchorDate.add({ weeks: 1 }))}>
      Skip a week
    </button>
  );
}
// #endregion hooks

// #region app
export function ControlledCalendar() {
  const [anchorDate, setAnchorDate] = useState(() => Temporal.PlainDate.from("2026-10-08"));

  return (
    <>
      <input
        type="date"
        value={anchorDate.toString()}
        onChange={(event) => {
          if (event.currentTarget.value) {
            setAnchorDate(Temporal.PlainDate.from(event.currentTarget.value));
          }
        }}
      />
      <Calendar.Root
        events={meetings}
        anchorDate={anchorDate}
        onAnchorDateChange={setAnchorDate}
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
