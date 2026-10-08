"use client";

// #region adapter
import { createCalendar, defineEventAdapter, type CalendarDiagnostic } from "@moltenship/calendar";

interface Booking {
  readonly id: `booking-${number}`;
  readonly roomIds: readonly `room-${number}`[];
  readonly summary: string;
  readonly startsAt: Temporal.Instant;
  readonly endsAt: Temporal.Instant;
  readonly updatedAt: string;
  readonly locked: boolean;
}

interface Room {
  readonly id: `room-${number}`;
  readonly name: string;
}

const bookingAdapter = defineEventAdapter<Booking>()({
  getId: (booking) => booking.id,
  getTitle: (booking) => booking.summary,
  getInterval: (booking) => ({ kind: "timed", start: booking.startsAt, end: booking.endsAt }),
  getResourceIds: (booking) => booking.roomIds,
  getRevision: (booking) => booking.updatedAt,
  isReadOnly: (booking) => booking.locked,
});

export const BookingCalendar = createCalendar<Booking, Room>()({ eventAdapter: bookingAdapter });
// #endregion adapter

// #region diagnostics
export function reportDiagnostics(
  diagnostics: readonly CalendarDiagnostic<Booking, Booking["id"]>[],
) {
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === "invalid-event") {
      console.warn(`Skipped event #${diagnostic.issue.index}: ${diagnostic.issue.code}`);
    }
  }
}

// #endregion diagnostics
