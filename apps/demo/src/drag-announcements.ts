import { Accessibility } from "@dnd-kit/dom";
import { calendarEventOf, isCalendarTarget } from "@moltenship/calendar-dnd-kit";

import type { DemoOccurrence } from "./calendar";
import type { DemoTask } from "./tasks";

/** A draggable or droppable, as dnd-kit's announcements see it. */
interface Entity {
  readonly data?: unknown;
  readonly id: string | number;
}

interface Announced {
  readonly operation: { readonly source: Entity | null; readonly target: Entity | null };
}

/** The task a sidebar draggable carries, which names it. */
function taskOf(source: Entity | null): DemoTask | undefined {
  const data = source?.data;
  return typeof data === "object" && data !== null
    ? (data as { readonly task?: DemoTask }).task
    : undefined;
}

function eventTitle(source: Entity | null): string | undefined {
  return calendarEventOf<DemoOccurrence>(source)?.event.event.title;
}

/**
 * What dnd-kit says about tasks and events dragged between the sidebar and the calendar. Its
 * defaults name things by ID. Over the calendar the calendar's own announcer speaks, from its
 * messages, so dnd-kit stays quiet there.
 */
const announcements = {
  dragstart: ({ operation }: Announced) => {
    const task = taskOf(operation.source);
    return task === undefined ? undefined : `Picked up ${task.title}.`;
  },
  dragover: ({ operation }: Announced) => {
    if (operation.target === null || isCalendarTarget(operation.target)) return undefined;
    return eventTitle(operation.source) === undefined ? undefined : "Over the unscheduled tasks.";
  },
  dragend: ({ canceled, operation }: Announced & { readonly canceled: boolean }) => {
    const task = taskOf(operation.source);
    if (task !== undefined) {
      if (canceled) return `Cancelled. ${task.title} is still unscheduled.`;
      return operation.target === null ? `${task.title} is still unscheduled.` : undefined;
    }
    const title = eventTitle(operation.source);
    // The calendar announces a drop in it, and a cancel.
    return title === undefined || canceled ? undefined : `${title} is unscheduled.`;
  },
};

/** dnd-kit's default plugins, with the demo's announcements. Pass to `DragDropProvider`'s `plugins`. */
export function withDragAnnouncements<TPlugin>(defaults: readonly TPlugin[]) {
  return [
    ...defaults.filter((plugin) => plugin !== (Accessibility as unknown)),
    Accessibility.configure({ announcements }),
  ];
}
