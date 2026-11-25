// #region source
import type { CalendarEventSource } from "@moltenship/calendar-solid";

import type { Booking } from "./bookings";

// A store outside Solid, such as the cache a websocket or a sync engine writes to.
let bookings: readonly Booking[] = [];
const listeners = new Set<() => void>();

export function setBookings(next: readonly Booking[]) {
  bookings = next;
  for (const listener of listeners) listener();
}

// At module scope, so the source stays the same object.
export const bookingSource: CalendarEventSource<Booking> = {
  getSnapshot: () => bookings,
  getServerSnapshot: () => bookings,
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
// #endregion source
