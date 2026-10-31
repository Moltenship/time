import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import * as stylex from "@stylexjs/stylex";
import { CalendarPlusIcon, GripVerticalIcon } from "lucide-react";
import { useId, useRef } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";

import { getCalendarColor } from "../../calendars";
import type { DemoTask, DemoTaskList } from "../../tasks";
import { useUnschedule } from "../../unschedule";
import { taskLength, useTaskCard, useUnscheduledDrop } from "../../unscheduled";
import { StylexDemoCalendar } from "../calendar";
import { SectionHeading } from "./section";

const styles = stylex.create({
  card: {
    alignItems: "flex-start",
    appearance: "none",
    backgroundColor: {
      default: calendarVars["--calendar-event"],
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-event"]} 92%, ${calendarVars["--calendar-event-foreground"]})`,
    },
    borderBlockWidth: 0,
    borderInlineEndWidth: 0,
    borderInlineStartColor: calendarVars["--calendar-event-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    borderRadius: "calc(var(--radius) * 0.8)",
    color: calendarVars["--calendar-event-foreground"],
    cursor: "grab",
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    fontFamily: "inherit",
    gap: "0.375rem",
    minWidth: 0,
    opacity: {
      default: null,
      "[aria-busy=true]": 0.5,
      "[data-dragging]": 0.6,
      "[data-over-calendar]": 0.3,
    },
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": "1px" },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    paddingBlock: "0.375rem",
    paddingInlineEnd: "0.5rem",
    paddingInlineStart: "0.375rem",
    textAlign: "start",
    transitionDuration: "150ms",
    transitionProperty: "opacity",
  },
  grip: {
    flexShrink: 0,
    height: "0.875rem",
    marginTop: "0.125rem",
    opacity: 0.5,
    width: "0.875rem",
  },
  hint: {
    paddingBlockEnd: "0.5rem",
  },
  item: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
  },
  length: {
    display: "block",
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  list: {
    backgroundColor: { default: null, "[data-over]": calendarVars["--accent"] },
    borderRadius: "var(--radius)",
    boxShadow: { default: null, "[data-over]": `0 0 0 2px ${calendarVars["--ring"]}` },
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minHeight: "3rem",
    outlineStyle: "none",
    padding: "0.25rem",
    transitionDuration: "150ms",
    transitionProperty: "background-color",
  },
  text: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  title: {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.375,
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
      <SectionHeading id={headingId}>Unscheduled</SectionHeading>
      <Text as="p" display="block" id={hintId} type="supporting" xstyle={styles.hint}>
        Drag a task onto the calendar, or an event here to unschedule it.
      </Text>
      <ul
        ref={(node) => {
          ref(node);
          listRef.current = node;
        }}
        aria-describedby={hintId}
        // Where focus goes back to after a task's editor saves it away.
        tabIndex={-1}
        data-over={isDropTarget || undefined}
        {...stylex.props(styles.list)}
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
        type="button"
        data-color={color}
        aria-busy={saving || undefined}
        data-dragging={isDragSource || undefined}
        data-task-id={task.id}
        data-over-calendar={overCalendar || undefined}
        {...stylex.props(styles.card, eventColorStyles[color])}
      >
        <GripVerticalIcon aria-hidden {...stylex.props(styles.grip)} />
        <span {...stylex.props(styles.text)}>
          <span {...stylex.props(styles.title)}>{task.title}</span>
          {/* Read as "Long run, 1 h": the name is the card's own text. */}
          <VisuallyHidden>, </VisuallyHidden>
          <span {...stylex.props(styles.length)}>{taskLength(task.minutes)}</span>
        </span>
      </button>
      <IconButton
        icon={<Icon icon={CalendarPlusIcon} />}
        isDisabled={saving}
        label={`Schedule ${task.title}`}
        onClick={(click) => onSchedule(task, click.currentTarget as HTMLElement)}
        size="sm"
        variant="ghost"
      />
    </li>
  );
}
