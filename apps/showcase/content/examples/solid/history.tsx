// #region history
import { createEventHistory } from "@moltenship/calendar-core";
import { useCalendarHistory, useCalendarHistoryShortcuts } from "@moltenship/calendar-solid";

import { Calendar, type Meeting } from "./calendar";

// One per calendar. Pass `onEventChangeResult={(result, detail) => changes.record(result, detail)}`
// to Root.
export const changes = createEventHistory<Meeting, string, string>();

// Render it inside <Calendar.Root>.
export function HistoryButtons() {
  const controls = useCalendarHistory(changes);
  const meta = Calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(controls, () => ({ scope: meta().refs.frame }));
  return (
    <>
      <button type="button" disabled={!controls().canUndo} onClick={() => void controls().undo()}>
        Undo
      </button>
      <button type="button" disabled={!controls().canRedo} onClick={() => void controls().redo()}>
        Redo
      </button>
    </>
  );
}
// #endregion history
