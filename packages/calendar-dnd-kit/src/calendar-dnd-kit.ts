import { useDragDropManager } from "@dnd-kit/react";
import { useEffect } from "react";

import { connectCalendarDragDrop } from "./connect";

/**
 * Connects the calendar views on the page to the dnd-kit `DragDropProvider` it's rendered in, so
 * draggables carrying `calendarDropData` drop into them and calendar events drag out to your
 * droppables. Render one inside the provider, anywhere; it renders nothing, and a second one
 * shares the first's connection. Outside a provider, dnd-kit hands it a default manager that no
 * droppable of yours is on. See `connectCalendarDragDrop`.
 */
export function CalendarDndKit(): null {
  const manager = useDragDropManager();
  useEffect(() => (manager === null ? undefined : connectCalendarDragDrop(manager)), [manager]);
  return null;
}
