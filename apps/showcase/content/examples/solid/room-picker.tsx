// #region picker
import { useBusyResources, type CalendarEventInterval } from "@moltenship/calendar-solid";
import { For } from "solid-js";

import { resources } from "./schedule-resources";

const rooms = resources.filter((resource) => resource.data.kind === "room");

export function RoomPicker(props: { interval: CalendarEventInterval; eventId?: string }) {
  // Accessors, so the answer follows the props.
  const busy = useBusyResources(
    () => props.interval,
    () => ({ exclude: props.eventId }),
  );
  const bookings = (roomId: string) => busy().get(roomId) ?? [];

  return (
    <ul>
      <For each={rooms}>
        {(room) => (
          <li data-busy={bookings(room.id).length > 0 ? "" : undefined}>
            {room.title}
            {bookings(room.id).length > 0
              ? `, busy: ${bookings(room.id)
                  .map((event) => event.title)
                  .join(", ")}`
              : ", available"}
          </li>
        )}
      </For>
    </ul>
  );
}
// #endregion picker
