import type { CalendarInputMethod } from "@moltenship/calendar";
import { useCallback } from "react";

import { DemoCalendar, type DemoOccurrence } from "./calendar";
import { taskFromOccurrence, type DemoTaskList } from "./tasks";

/** Events being unscheduled, whose deletes the undo history leaves out. */
const unscheduling = new Set<string>();

/**
 * Whether a delete takes an event back to the unscheduled tasks. The history leaves those out:
 * redoing one would delete the event without bringing its task back, and "Deleted" would be the
 * wrong word for it.
 */
export function isUnscheduling(eventId: string): boolean {
  return unscheduling.has(eventId);
}

/**
 * Takes an event off the calendar and back into the unscheduled tasks. The delete goes through
 * `onEventChange`, so it saves and shows pending like any other; the task shows at once, and goes
 * again if the delete doesn't save, unless the demo's data was reset meanwhile.
 */
export function useUnschedule({
  addTask,
  removeTask,
  resets,
}: Pick<DemoTaskList, "addTask" | "removeTask" | "resets">): (
  occurrence: DemoOccurrence,
  input?: CalendarInputMethod,
) => void {
  const actions = DemoCalendar.useCalendarActions();
  return useCallback(
    (occurrence, input = "api") => {
      const task = taskFromOccurrence(occurrence);
      if (task === null) return;
      const resetsAtStart = resets.current;
      addTask(task);
      unscheduling.add(occurrence.id);
      void actions
        .proposeEventChange({ cause: "delete", eventId: occurrence.id }, { input })
        .then((result) => {
          if (result.status === "rejected" && resets.current === resetsAtStart) {
            removeTask(task.id);
          }
        })
        .finally(() => unscheduling.delete(occurrence.id));
    },
    [actions, addTask, removeTask, resets],
  );
}
