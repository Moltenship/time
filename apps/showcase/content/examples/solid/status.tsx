// #region status
import { Calendar } from "./calendar";

// Render it inside <Calendar.Root>.
export function Status() {
  const state = Calendar.useCalendarState();
  const range = Calendar.useVisibleRange();
  const view = Calendar.useCalendarSelector((current) => current.view);
  const saving = Calendar.useCalendarPendingChanges((changes) => changes.size > 0);
  const actions = Calendar.useCalendarActions();

  return (
    <p>
      {view()} from {range()?.start.toString()}, anchored on {state().anchorDate.toString()}
      {saving() ? ", saving" : ""}
      <button type="button" onClick={() => actions.navigateToday()}>
        Today
      </button>
    </p>
  );
}
// #endregion status

// #region event
export function StandupLine() {
  return (
    <Calendar.Event eventId="standup" fallback={<p>Not found</p>}>
      {(entry) => (
        <p>
          {entry().event.title} starts at {entry().normalized.start.toString()}
        </p>
      )}
    </Calendar.Event>
  );
}
// #endregion event
