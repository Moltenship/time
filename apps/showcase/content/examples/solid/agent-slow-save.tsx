// #region save
import { createSignal } from "solid-js";

import { applyChange, timedOnly, type MeetingChange } from "./agent-save";
import { seed, weekRules } from "./app";
import { Calendar } from "./calendar";

export interface SavedCalendarProps {
  /** Hears an agent's change whose save failed after the agent was told "saving". */
  readonly onAgentSaveFailed: (change: MeetingChange) => void;
  /** Your server call: resolves once the change is stored, or rejects. */
  readonly save: (change: MeetingChange) => Promise<void>;
}

export function SavedCalendar(props: SavedCalendarProps) {
  const [meetings, setMeetings] = createSignal(seed);

  return (
    <Calendar.Root
      // Its own name: a page with two calendars gives each one a label.
      label="Bookings"
      events={meetings()}
      // The calendar shows the change as pending until this promise settles, and the agent's
      // step returns it with `status: "saving"`.
      onEventChange={async (change, detail) => {
        await props.save(change);
        setMeetings((current) => applyChange(current, change, detail));
      }}
      // How every proposal ended, the agent's included. The agent reads the same from `getChange`.
      onEventChangeResult={(result, detail) => {
        if (detail.input !== "agent" || result.status !== "rejected") return;
        if (result.change !== undefined) props.onAgentSaveFailed(result.change);
      }}
      policies={[timedOnly]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion save
