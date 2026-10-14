"use client";

// #region calendar
import { createCalendar, defineEventAdapter, type CalendarEventChange } from "@moltenship/calendar";
import {
  CalendarDndKit,
  calendarDropData,
  calendarEventOf,
  calendarEventType,
  isCalendarTarget,
} from "@moltenship/calendar-dnd-kit";
import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider, useDragDropMonitor, useDraggable, useDroppable } from "@dnd-kit/react";
import { useCallback, useMemo, useState } from "react";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

export interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly title: string;
}

export interface Task {
  readonly id: string;
  readonly minutes: number;
  readonly title: string;
}

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getInterval: ({ end, start }) => ({ end, kind: "timed", start }),
    getResourceIds: () => [],
    getTitle: (meeting) => meeting.title,
  }),
  views: [createWeekView<Meeting>()],
});

export type MeetingChange = CalendarEventChange<Meeting, string, string>;

/** Meetings have times: the all-day row takes no drop, and its preview says so. */
function timedOnly({ proposed }: Pick<MeetingChange, "proposed">) {
  return proposed !== null && proposed.kind !== "timed"
    ? ({ reason: "timed-only", type: "reject" } as const)
    : ({ type: "accept" } as const);
}
const policies = [timedOnly];
// #endregion calendar

// #region task
/** The meeting a task becomes, under the task's ID. The drop decides when it is. */
export function meetingFromTask(task: Task): Meeting {
  const start = Temporal.Instant.fromEpochMilliseconds(0);
  return { end: start.add({ minutes: task.minutes }), id: task.id, start, title: task.title };
}

function TaskCard({ task }: { readonly task: Task }) {
  const data = useMemo(
    () => ({
      task,
      ...calendarDropData({
        duration: { minutes: task.minutes },
        event: meetingFromTask(task),
        title: task.title,
      }),
    }),
    [task],
  );
  const { ref } = useDraggable({ data, id: task.id });
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className="w-full cursor-grab rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1.5 text-start text-sm text-calendar-event-foreground"
      >
        <span className="block font-medium">{task.title}</span>
        <span className="sr-only">, </span>
        <span className="block text-xs">{task.minutes} min</span>
      </button>
    </li>
  );
}
// #endregion task

// #region backlog
/** The tasks, and a drop zone that takes meetings back off the calendar. */
function Backlog({
  onUnscheduled,
  tasks,
}: {
  readonly onUnscheduled: (task: Task) => void;
  readonly tasks: readonly Task[];
}) {
  const actions = Calendar.useCalendarActions();
  const { isDropTarget, ref } = useDroppable({ accept: calendarEventType, id: "backlog" });
  useDragDropMonitor(
    useMemo(
      () => ({
        onDragEnd: ({ canceled, operation }) => {
          const dragged = calendarEventOf<Meeting, string>(operation.source);
          if (canceled || dragged === null || operation.target?.id !== "backlog") return;
          const { end, id, start, title } = dragged.event;
          // Through the calendar, so policies run and the meeting hides while it saves.
          void actions
            .proposeEventChange({ cause: "delete", eventId: id }, { input: "pointer" })
            .then((result) => {
              if (result.status !== "committed") return;
              onUnscheduled({ id, minutes: start.until(end).total({ unit: "minutes" }), title });
            });
        },
      }),
      [actions, onUnscheduled],
    ),
  );
  return (
    <ul
      ref={ref}
      aria-label="Backlog"
      className="flex min-h-24 flex-col gap-1.5 rounded-lg p-1.5 data-over:bg-accent data-over:ring-2 data-over:ring-ring"
      data-over={isDropTarget || undefined}
    >
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </ul>
  );
}
// #endregion backlog

// #region announcements
type Entity = { readonly data?: unknown; readonly id: string | number } | null;
type Announced = { readonly operation: { readonly source: Entity; readonly target: Entity } };

const taskOf = (source: Entity) => (source?.data as { task?: Task } | undefined)?.task;
const meetingOf = (source: Entity) => calendarEventOf<Meeting>(source)?.event;

/**
 * What dnd-kit says, by name rather than its default IDs. Over the week, and for meetings until
 * they reach the backlog, the calendar's own Announcer speaks instead.
 */
const announcements = {
  dragstart: ({ operation }: Announced) => {
    const task = taskOf(operation.source);
    return task && `Picked up ${task.title}.`;
  },
  dragover: ({ operation }: Announced) =>
    operation.target === null || isCalendarTarget(operation.target)
      ? undefined
      : meetingOf(operation.source) && "Over the backlog.",
  dragend: ({ canceled, operation }: Announced & { readonly canceled: boolean }) => {
    const task = taskOf(operation.source);
    if (task)
      return canceled || operation.target === null
        ? `${task.title} stays in the backlog.`
        : undefined;
    const meeting = meetingOf(operation.source);
    return meeting === undefined || canceled
      ? undefined
      : `${meeting.title} is back in the backlog.`;
  },
};

/** dnd-kit's default plugins, with these announcements. */
function plugins<TPlugin>(defaults: readonly TPlugin[]) {
  return [
    ...defaults.filter((plugin) => plugin !== (Accessibility as unknown)),
    Accessibility.configure({ announcements }),
  ];
}
// #endregion announcements

// #region root
const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

export interface BacklogCalendarProps {
  readonly anchorDate: Temporal.PlainDate;
  readonly initialMeetings: readonly Meeting[];
  readonly initialTasks: readonly Task[];
  readonly timeZone: string;
}

export function BacklogCalendar({
  anchorDate,
  initialMeetings,
  initialTasks,
  timeZone,
}: BacklogCalendarProps) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [tasks, setTasks] = useState(initialTasks);

  const save = useCallback((change: MeetingChange) => {
    if (change.cause === "delete") {
      setMeetings((current) => current.filter(({ id }) => id !== change.eventId));
      return;
    }
    const { proposed } = change;
    if (proposed.kind !== "timed") return;
    const { end, start } = proposed;
    if (change.cause === "create") {
      // A range dragged out in the week has no record; only dropped tasks carry one.
      const dropped = change.event;
      if (dropped === null) return;
      setMeetings((current) => [...current, { ...dropped, end, start }]);
      setTasks((current) => current.filter(({ id }) => id !== dropped.id));
      return;
    }
    setMeetings((current) =>
      current.map((meeting) =>
        meeting.id === change.eventId ? { ...meeting, end, start } : meeting,
      ),
    );
  }, []);
  const unscheduled = useCallback((task: Task) => setTasks((current) => [task, ...current]), []);

  return (
    <Calendar.Root
      defaultAnchorDate={anchorDate}
      defaultView="week"
      events={meetings}
      locale="en-US"
      onEventChange={save}
      policies={policies}
      timeZone={timeZone}
      weekRules={weekRules}
    >
      {/* One provider around the backlog and the calendar; CalendarDndKit connects them. */}
      <DragDropProvider plugins={plugins}>
        <CalendarDndKit />
        <Calendar.Frame className="flex h-full min-h-0">
          <aside className="flex w-44 shrink-0 flex-col gap-2 overflow-y-auto border-e p-2">
            <h2 className="px-1 text-sm font-medium">Backlog</h2>
            <Backlog onUnscheduled={unscheduled} tasks={tasks} />
          </aside>
          <Calendar.Viewport className="min-h-0 min-w-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
          <Calendar.Announcer messages={calendarAnnouncements} />
        </Calendar.Frame>
      </DragDropProvider>
    </Calendar.Root>
  );
}
// #endregion root
