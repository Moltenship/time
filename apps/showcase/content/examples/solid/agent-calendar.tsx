// #region calendar
import { createSignal } from "solid-js";

import { applyChange, timedOnly } from "./agent-save";
import { seed, weekRules } from "./app";
import { Calendar } from "./calendar";

export function AgentReadyCalendar() {
  const [meetings, setMeetings] = createSignal(seed);

  return (
    <Calendar.Root
      // The name an agent finds the calendar by. Without it, the title names the calendar, and
      // the title changes with every navigation.
      label="Team calendar"
      events={meetings()}
      // An agent's change arrives here like a drag does, and `detail.fields` has what the agent
      // sent beside the times, such as a title. Without a handler the calendar is read-only,
      // for agents too.
      onEventChange={(change, detail) => {
        setMeetings((current) => applyChange(current, change, detail));
      }}
      policies={[timedOnly]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
          <Calendar.Title />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion calendar
