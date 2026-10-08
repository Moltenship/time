"use client";

import { createCalendar } from "@moltenship/calendar";

import { eventAdapter, type Meeting } from "./calendar";

// #region selection
type Selection = { readonly eventId: string } | { readonly date: Temporal.PlainDate };

const Calendar = createCalendar<Meeting, never, Selection>()({ eventAdapter });

export function SelectStandup() {
  const actions = Calendar.useCalendarActions();

  return (
    <button type="button" onClick={() => actions.setSelection({ eventId: "standup" })}>
      Select standup
    </button>
  );
}
// #endregion selection
