import * as stylex from "@stylexjs/stylex";
import { CalendarPlusIcon, GripVerticalIcon } from "lucide-react";
import { useId, useRef } from "react";

import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import { Button } from "@registry/stylex-calendar-ui/button";

import { getCalendarColor } from "../../calendars";
import type { DemoTask, DemoTaskList } from "../../tasks";
import { taskLength, useTaskCard, useUnschedule, useUnscheduledDrop } from "../../unscheduled";
import { StylexDemoCalendar } from "../calendar";
import { visuallyHidden } from "../ui/visually-hidden";
import { sectionStyles } from "./section";

const styles = stylex.create({
  hint: {
    color: "var(--muted-foreground)",
    fontSize: "0.75rem",
    lineHeight: "calc(1 / 0.75)",
    paddingBottom: "0.5rem",
    paddingInline: "0.5rem",
  },
  list: {
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minHeight: "3rem",
    padding: "0.25rem",
    transitionDuration: "150ms",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  dropTarget: {
    backgroundColor: "var(--accent)",
    boxShadow: "0 0 0 2px var(--ring)",
  },
  item: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
  },
  // `brightness()` takes no `light-dark()`, so the hover dims in both schemes; the main demo's
  // brightens in dark.
  task: {
    alignItems: "flex-start",
    backgroundColor: "var(--calendar-event)",
    borderInlineStartColor: "var(--calendar-event-border)",
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    borderRadius: "calc(var(--radius) * 0.8)",
    color: "var(--calendar-event-foreground)",
    cursor: "grab",
    display: "flex",
    filter: { default: null, ":hover": "brightness(0.97)" },
    flexGrow: 1,
    flexShrink: 1,
    gap: "0.375rem",
    minWidth: 0,
    opacity: {
      default: null,
      "[aria-busy=true]": 0.5,
      "[data-dragging]": 0.6,
      "[data-over-calendar]": 0.3,
    },
    outlineColor: { default: null, ":focus-visible": "var(--ring)" },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    paddingBlock: "0.375rem",
    paddingInlineEnd: "0.5rem",
    paddingInlineStart: "0.375rem",
    textAlign: "start",
    transitionDuration: "150ms",
    transitionProperty: "opacity",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  grip: {
    flexShrink: 0,
    height: "0.875rem",
    marginTop: "0.125rem",
    opacity: 0.5,
    width: "0.875rem",
  },
  text: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.375,
  },
  length: {
    display: "block",
    fontSize: "0.75rem",
    lineHeight: "calc(1 / 0.75)",
  },
});

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
  const onUnschedule = useUnschedule(StylexDemoCalendar.useCalendarActions(), taskList);
  const headingId = useId();
  const hintId = useId();
  const { isDropTarget, listId, ref } = useUnscheduledDrop(onUnschedule);
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} {...stylex.props(sectionStyles.heading)}>
        Unscheduled
      </h2>
      <p id={hintId} {...stylex.props(styles.hint)}>
        Drag a task onto the calendar, or an event here to unschedule it.
      </p>
      <ul
        ref={(node) => {
          ref(node);
          listRef.current = node;
        }}
        aria-describedby={hintId}
        data-over={isDropTarget || undefined}
        // Where focus goes back to after a task's editor saves it away.
        tabIndex={-1}
        {...stylex.props(styles.list, isDropTarget && styles.dropTarget)}
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
  const { isDragSource, overCalendar, ref, saving } = useTaskCard(StylexDemoCalendar, task, id);
  const color = getCalendarColor(task.calendarId);

  return (
    <li {...stylex.props(styles.item)}>
      <button
        ref={ref}
        aria-busy={saving || undefined}
        data-color={color}
        data-dragging={isDragSource || undefined}
        data-over-calendar={overCalendar || undefined}
        data-task-id={task.id}
        type="button"
        {...stylex.props(styles.task, eventColorStyles[color])}
      >
        <GripVerticalIcon aria-hidden {...stylex.props(styles.grip)} />
        <span {...stylex.props(styles.text)}>
          <span {...stylex.props(styles.title)}>{task.title}</span>
          {/* Read as "Long run, 1 h": the name is the card's own text. */}
          <span {...stylex.props(visuallyHidden.text)}>, </span>
          <span {...stylex.props(styles.length)}>{taskLength(task.minutes)}</span>
        </span>
      </button>
      <Button
        aria-label={`Schedule ${task.title}`}
        disabled={saving}
        onClick={(click) => onSchedule(task, click.currentTarget)}
        size="icon-sm"
        variant="ghost"
      >
        <CalendarPlusIcon aria-hidden />
      </Button>
    </li>
  );
}
