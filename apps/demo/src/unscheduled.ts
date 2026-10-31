import { calendarDropData, calendarEventOf, isCalendarTarget } from "@moltenship/calendar-dnd-kit";
import { useDragDropMonitor, useDraggable, useDragOperation, useDroppable } from "@dnd-kit/react";
import { useId, useMemo } from "react";

import type { DemoCalendarHooks, DemoOccurrence } from "./demo-model";
import { taskFromOccurrence, taskOccurrence, type DemoTask } from "./tasks";

/** A task's length, as its card shows it. */
export function taskLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Only an event that can become a task again: a timed one-off. */
function takesEvent(source: { readonly data?: unknown }): boolean {
  const dragged = calendarEventOf<DemoOccurrence>(source);
  return dragged !== null && taskFromOccurrence(dragged.event) !== null;
}

/** The unscheduled list as a place to drag one-off events to, which unschedules them. */
export function useUnscheduledDrop(
  onUnschedule: (occurrence: DemoOccurrence, input: "pointer") => void,
) {
  // The sidebar renders twice, beside the calendar and in the phone's sheet, so the list's
  // droppable and its tasks' draggables get IDs of their own in each.
  const listId = useId();
  const dropId = `unscheduled${listId}`;
  const { isDropTarget, ref } = useDroppable({ accept: takesEvent, id: dropId });
  useDragDropMonitor(
    useMemo(
      () => ({
        onDragEnd: ({ canceled, operation }) => {
          if (canceled || operation.target?.id !== dropId) return;
          const dragged = calendarEventOf<DemoOccurrence>(operation.source);
          if (dragged !== null) onUnschedule(dragged.event, "pointer");
        },
      }),
      [dropId, onUnschedule],
    ),
  );
  return { isDropTarget, listId, ref };
}

/** A task's card as something to drag onto the calendar. */
export function useTaskCard(
  calendar: Pick<DemoCalendarHooks, "useCalendarPendingChanges">,
  task: DemoTask,
  id: string,
) {
  // What the calendar makes of the task when it's dropped there: an event under the task's ID,
  // as long as the task takes, named after it.
  const data = useMemo(
    () => ({
      task,
      ...calendarDropData({
        duration: { minutes: task.minutes },
        event: taskOccurrence(task),
        title: task.title,
      }),
    }),
    [task],
  );
  // A dropped task waits for its event to save, and an unscheduled one for its event's delete; it
  // can't be dragged or scheduled again meanwhile.
  const saving = calendar.useCalendarPendingChanges((changes) =>
    [...changes.values()].some(
      ({ change }) =>
        (change.cause === "create" && change.event?.id === task.id) ||
        (change.cause === "delete" && change.eventId === task.id),
    ),
  );
  const { isDragSource, ref } = useDraggable({ data, disabled: saving, id });
  // Over the calendar the card fades, so the slots it would take show through.
  const { target } = useDragOperation();
  const overCalendar = isDragSource && isCalendarTarget(target);
  return { isDragSource, overCalendar, ref, saving };
}
