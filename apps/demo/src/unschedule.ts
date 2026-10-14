import type { CalendarInputMethod } from "@moltenship/calendar";
import { useCallback } from "react";

import { DemoCalendar, type DemoOccurrence } from "./calendar";
import { taskFromOccurrence, type DemoTaskList } from "./tasks";

/**
 * Takes an event off the calendar and back into the unscheduled tasks. The delete goes through
 * `onEventChange`, so it saves, shows pending and can be undone like any other; the task shows at
 * once, and goes again if the delete doesn't save. An undone unschedule brings the event back,
 * which takes its task away again.
 */
export function useUnschedule({
  addTask,
  removeTask,
}: Pick<DemoTaskList, "addTask" | "removeTask">): (
  occurrence: DemoOccurrence,
  input?: CalendarInputMethod,
) => void {
  const actions = DemoCalendar.useCalendarActions();
  return useCallback(
    (occurrence, input = "api") => {
      const task = taskFromOccurrence(occurrence);
      if (task === null) return;
      addTask(task);
      void actions
        .proposeEventChange({ cause: "delete", eventId: occurrence.id }, { input })
        .then((result) => {
          if (result.status === "rejected") removeTask(task.id);
        });
    },
    [actions, addTask, removeTask],
  );
}
