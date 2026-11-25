// #region root
import { seed, weekRules } from "./app";
import { TeamCalendar } from "./team-calendar";

export function ListOnlyForAgents() {
  return (
    <TeamCalendar.Root
      label="Team calendar"
      events={seed}
      onViewChange={(view, detail) => {
        // A person can still open the month view.
        if (detail.source === "agent" && view === "month") detail.cancel();
      }}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <TeamCalendar.Frame>
        <TeamCalendar.Toolbar>
          <TeamCalendar.Title />
          <TeamCalendar.ViewSwitcher
            aria-label="View"
            getViewLabel={(view) => (view === "list" ? "Agenda" : "Month")}
          />
        </TeamCalendar.Toolbar>
        <TeamCalendar.Viewport>
          <TeamCalendar.ActiveView />
        </TeamCalendar.Viewport>
      </TeamCalendar.Frame>
    </TeamCalendar.Root>
  );
}
// #endregion root
