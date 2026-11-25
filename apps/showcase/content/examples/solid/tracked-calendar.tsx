// #region tracked
import { seed, weekRules } from "./app";
import { TeamCalendar as Calendar } from "./team-calendar";

/** Records how the calendar is navigated, and keeps the month view for people. */
export function TrackedCalendar(props: { readonly track: (entry: string) => void }) {
  return (
    <Calendar.Root
      label="Team calendar"
      events={seed}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      onAnchorDateChange={(date, detail) => {
        // "next-press by mouse to 2026-10-15", "imperative by agent to 2026-11-02"
        props.track(`${detail.reason} by ${detail.source} to ${date.toString()}`);
      }}
      onViewChange={(view, detail) => {
        if (view === "month" && detail.source === "agent") detail.cancel();
      }}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
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
// #endregion tracked
