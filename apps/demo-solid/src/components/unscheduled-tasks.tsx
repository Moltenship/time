import { Button } from "@registry/calendar-ui/button";
import { cn } from "cn";
import { createUniqueId, For } from "solid-js";

import { getCalendarColor } from "@demo/calendars";
import type { DemoOccurrence } from "@demo/demo-model";
import type { DemoTask, DemoTaskList } from "@demo/tasks";
import { taskLength } from "@demo/tasks";
import { unschedule } from "@demo/unschedule";

import { Calendar } from "../calendar";
import { CalendarPlusIcon, GripVerticalIcon } from "../icons";
import { createTaskDrag, createUnscheduledDrop } from "../task-drag";

/**
 * Tasks not on the calendar yet, as in React. Drag one onto a time slot, a day or a person to
 * schedule it, or press its button to schedule it in the editor; drag a one-off event here to
 * unschedule it.
 */
export function UnscheduledTasks(props: {
  /**
   * Opens the event editor for a task. Focus goes back to `opener` when the editor is cancelled,
   * and to `list` once the task is saved away.
   */
  readonly onSchedule: (task: DemoTask, opener: HTMLElement, list: HTMLElement | null) => void;
  readonly taskList: DemoTaskList;
}) {
  const actions = Calendar.useCalendarActions();
  const headingId = createUniqueId();
  const hintId = createUniqueId();
  let list: HTMLUListElement | undefined;
  const over = createUnscheduledDrop(
    () => list,
    (occurrence: DemoOccurrence) => unschedule(actions, props.taskList, occurrence, "pointer"),
  );

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} class="px-2 pb-1 text-sm font-medium">
        Unscheduled
      </h2>
      <p id={hintId} class="px-2 pb-2 text-xs text-muted-foreground">
        Drag a task onto the calendar, or an event here to unschedule it.
      </p>
      <ul
        ref={(element) => (list = element)}
        aria-describedby={hintId}
        // Where focus goes back to after a task's editor saves it away.
        tabindex="-1"
        class={cn(
          "flex min-h-12 flex-col gap-1 rounded-lg p-1 transition-colors",
          over() && "bg-accent ring-2 ring-ring",
        )}
        data-over={over() || undefined}
      >
        <For each={props.taskList.tasks} keyed={(task) => task.id}>
          {(task) => (
            <TaskItem
              list={() => list}
              onSchedule={(opener) => props.onSchedule(task(), opener, list ?? null)}
              task={task()}
            />
          )}
        </For>
      </ul>
    </section>
  );
}

function TaskItem(props: {
  readonly list: () => HTMLElement | undefined;
  readonly onSchedule: (opener: HTMLElement) => void;
  readonly task: DemoTask;
}) {
  // A dropped task waits for its event to save, and an unscheduled one for its event's delete; it
  // can't be dragged or scheduled again meanwhile.
  const saving = Calendar.useCalendarPendingChanges((changes) =>
    [...changes.values()].some(
      ({ change }) =>
        (change.cause === "create" && change.event?.id === props.task.id) ||
        (change.cause === "delete" && change.eventId === props.task.id),
    ),
  );
  const drag = createTaskDrag(() => props.task, props.list, saving);
  return (
    <li class="flex items-center gap-1">
      <button
        {...drag.props}
        type="button"
        class="flex min-w-0 flex-1 cursor-grab items-start gap-1.5 rounded-md border-s-3 border-calendar-event-border bg-calendar-event py-1.5 ps-1.5 pe-2 text-start text-calendar-event-foreground transition-opacity hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-busy:opacity-50 data-dragging:opacity-60 data-over-calendar:opacity-30 dark:hover:brightness-110"
        data-color={getCalendarColor(props.task.calendarId)}
        aria-busy={saving() ? "true" : undefined}
        data-dragging={drag.dragging() || undefined}
        data-task-id={props.task.id}
        data-over-calendar={drag.overCalendar() || undefined}
      >
        <GripVerticalIcon class="mt-0.5 size-3.5 shrink-0 opacity-50" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm leading-snug font-medium">{props.task.title}</span>
          {/* Read as "Long run, 1 h": the name is the card's own text. */}
          <span class="sr-only">, </span>
          <span class="block text-xs">{taskLength(props.task.minutes)}</span>
        </span>
      </button>
      <Button
        aria-label={`Schedule ${props.task.title}`}
        disabled={saving()}
        onClick={(click) => props.onSchedule(click.currentTarget)}
        size="icon-sm"
        variant="ghost"
      >
        <CalendarPlusIcon />
      </Button>
    </li>
  );
}
