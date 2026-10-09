import type { EventId } from "../ids";

/** A whole day: a month cell, or the cell for a date in a time grid's all-day row. */
export interface CalendarDayFocus {
  readonly date: Temporal.PlainDate;
  readonly kind: "day";
}

/** A time-grid slot, starting at `time` on the display time zone's wall clock of `date`. */
export interface CalendarSlotFocus {
  readonly date: Temporal.PlainDate;
  readonly kind: "slot";
  readonly time: Temporal.PlainTime;
}

/**
 * An event, on one of the dates it covers. The date picks the element that shows it there (a
 * month row's segment, a time-grid fragment, an agenda item) and where navigation continues.
 */
export interface CalendarEventFocus<TEventId extends EventId = EventId> {
  readonly date: Temporal.PlainDate;
  readonly eventId: TEventId;
  readonly kind: "event";
}

/** A cell an event can be created in or dropped on. */
export type CalendarCellFocus = CalendarDayFocus | CalendarSlotFocus;

/** Where keyboard focus is in a built-in view. Custom views may use their own focus type. */
export type CalendarFocus<TEventId extends EventId = EventId> =
  | CalendarCellFocus
  | CalendarEventFocus<TEventId>;

/** What the built-in views mark as selected: an event on every date it covers, or a cell. */
export type CalendarSelection<TEventId extends EventId = EventId> =
  | CalendarCellFocus
  | { readonly eventId: TEventId; readonly kind: "event" };

export function sameFocus(left: CalendarFocus | null, right: CalendarFocus | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind || !left.date.equals(right.date)) return false;
  if (left.kind === "slot") return left.time.equals((right as CalendarSlotFocus).time);
  return left.kind === "day" || left.eventId === (right as CalendarEventFocus).eventId;
}
