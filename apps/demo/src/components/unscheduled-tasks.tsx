import { CalendarPlusIcon, GripVerticalIcon } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@registry/ui/button";
import { cn } from "cn";

import { DemoCalendar } from "../calendar";
import { getCalendarColor } from "../calendars";
import type { DemoTask, DemoTaskList } from "../tasks";
import { useUnschedule } from "../unschedule";
import { taskLength, useTaskCard, useUnscheduledDrop } from "../unscheduled";

export interface UnscheduledTasksProps {
  /**
   * Opens the event editor for a task, the way to schedule it without dragging. Focus goes back
   * to `opener` when the editor is cancelled, and to `list` once the task is saved away.
   */
  readonly onSchedule: (task: DemoTask, opener: HTMLElement, list: HTMLElement | null) => void;
  readonly taskList: DemoTaskList;
}

/**
 * Tasks not on the calendar yet. Drag one onto a time slot, a day or a person to schedule it, or
 * press its button to schedule it in the editor; drag a one-off event here to unschedule it.
 */
export function UnscheduledTasks({ onSchedule, taskList }: UnscheduledTasksProps) {
  const { tasks } = taskList;
  const onUnschedule = useUnschedule(DemoCalendar.useCalendarActions(), taskList);
  const headingId = useId();
  const hintId = useId();
  const { isDropTarget, listId, ref } = useUnscheduledDrop(onUnschedule);
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="px-2 pb-1 text-sm font-medium">
        Unscheduled
      </h2>
      <p id={hintId} className="px-2 pb-2 text-xs text-muted-foreground">
        Drag a task onto the calendar, or an event here to unschedule it.
      </p>
      <ul
        ref={(node) => {
          ref(node);
          listRef.current = node;
        }}
        aria-describedby={hintId}
        // Where focus goes back to after a task's editor saves it away.
        tabIndex={-1}
        className={cn(
          "flex min-h-12 flex-col gap-1 rounded-lg p-1 transition-colors",
          isDropTarget && "bg-accent ring-2 ring-ring",
        )}
        data-over={isDropTarget || undefined}
      >
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            id={`${task.id}${listId}`}
            onSchedule={(scheduled, opener) => onSchedule(scheduled, opener, listRef.current)}
            task={task}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskItem({
  id,
  onSchedule,
  task,
}: {
  readonly id: string;
  readonly onSchedule: (task: DemoTask, opener: HTMLElement) => void;
  readonly task: DemoTask;
}) {
  const { isDragSource, overCalendar, ref, saving } = useTaskCard(DemoCalendar, task, id);

  return (
    <li className="flex items-center gap-1">
      <button
        ref={ref}
        type="button"
        className="flex min-w-0 flex-1 cursor-grab items-start gap-1.5 rounded-md border-s-3 border-calendar-event-border bg-calendar-event py-1.5 ps-1.5 pe-2 text-start text-calendar-event-foreground transition-opacity hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-busy:opacity-50 data-dragging:opacity-60 data-over-calendar:opacity-30 dark:hover:brightness-110"
        data-color={getCalendarColor(task.calendarId)}
        aria-busy={saving || undefined}
        data-dragging={isDragSource || undefined}
        data-task-id={task.id}
        data-over-calendar={overCalendar || undefined}
      >
        <GripVerticalIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-50" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug font-medium">{task.title}</span>
          {/* Read as "Long run, 1 h": the name is the card's own text. */}
          <span className="sr-only">, </span>
          <span className="block text-xs">{taskLength(task.minutes)}</span>
        </span>
      </button>
      <Button
        aria-label={`Schedule ${task.title}`}
        disabled={saving}
        onClick={(click) => onSchedule(task, click.currentTarget)}
        size="icon-sm"
        variant="ghost"
      >
        <CalendarPlusIcon />
      </Button>
    </li>
  );
}
