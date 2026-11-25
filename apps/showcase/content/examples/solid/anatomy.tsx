// #region anatomy
import { For } from "solid-js";

import { seed, weekRules } from "./app";
import { TeamCalendar as Calendar, type TeamView } from "./team-calendar";

const viewLabels: Record<TeamView, string> = { list: "Agenda", month: "Month" };

export function TeamCalendarApp() {
  return (
    <Calendar.Root
      label="Team calendar"
      events={seed}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.PreviousTrigger aria-label="Previous period">‹</Calendar.PreviousTrigger>
          <Calendar.NextTrigger aria-label="Next period">›</Calendar.NextTrigger>
          <Calendar.Title />
          <Calendar.ViewSwitcher aria-label="View" getViewLabel={(name) => viewLabels[name]} />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView fallback={<p>This view isn't registered.</p>} />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion anatomy

// #region switcher
// Render it inside <Calendar.Root>, in place of Calendar.ViewSwitcher.
export function ViewButtons() {
  const actions = Calendar.useCalendarActions();
  const active = Calendar.useCalendarSelector((state) => state.view);

  return (
    <For each={Calendar.views}>
      {(view) => (
        <button
          type="button"
          aria-pressed={active() === view.name ? "true" : "false"}
          onClick={() => actions.setView(view.name)}
        >
          {viewLabels[view.name]}
        </button>
      )}
    </For>
  );
}
// #endregion switcher
