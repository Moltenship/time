// #region selection
import { createCalendar } from "@moltenship/calendar-solid";

import { eventAdapter, type Meeting } from "./calendar";

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
