import {
  eventIdOf,
  resourceIdOf,
  type EventId,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";

import { toInstant, toPlainDate, type DateInput, type DateTimeInput } from "./environment";

/**
 * Names an event: its ID or title as text (an ID wins), its ID as a number, or `{ id }`,
 * `{ title }` or `{ start }`. A `start` is a date for all-day events, or a time: exact, or a wall
 * time on the calendar's time zone.
 */
export type EventQuery =
  | string
  | number
  | { readonly id: EventId }
  | { readonly title: string }
  | { readonly start: DateTimeInput | Temporal.PlainDate };

/** A day, or a slot when `time` is given, in a resource when the view has them. */
export interface CellQuery<TResourceId extends ResourceId = ResourceId> {
  readonly date: DateInput;
  /** The slot's start on the display time zone's wall clock, such as `"09:30"`. */
  readonly time?: Temporal.PlainTime | string;
  /** The resource the cell is in; `null` for the unassigned row. */
  readonly resourceId?: TResourceId | null;
}

/** Thrown when a query finds nothing, or more than one thing where it needs one. */
export class CalendarQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarQueryError";
  }
}

/** Text with the thin and no-break spaces `Intl` output uses made plain, and trimmed. */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/gu, " ").trim();
}

function describe(query: EventQuery): string {
  if (typeof query === "string" || typeof query === "number") return JSON.stringify(query);
  if ("id" in query) return `{ id: ${JSON.stringify(query.id)} }`;
  if ("title" in query) return `{ title: ${JSON.stringify(query.title)} }`;
  return `{ start: ${String(query.start)} }`;
}

function startsAt(
  event: NormalizedCalendarEvent<unknown, EventId, ResourceId>,
  start: DateTimeInput | Temporal.PlainDate,
  timeZone: string,
): boolean {
  const text = typeof start === "string" ? start : undefined;
  const dateOnly =
    (text !== undefined && !/[Tt ]/u.test(text)) ||
    (typeof start === "object" && !("toInstant" in start) && !("epochNanoseconds" in start));
  if (dateOnly) {
    return event.kind === "all-day" && event.start.equals(toPlainDate(start as DateInput));
  }
  return event.kind === "timed" && event.start.equals(toInstant(start as DateTimeInput, timeZone));
}

/** The events of `snapshot` a query names, as the calendar shows them, pending changes included. */
export function findEvents<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  snapshot: EventSnapshot<TEvent, TEventId, TResourceId>,
  query: EventQuery,
  timeZone: string,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
  const events = snapshot.events.map((event) => snapshot.get(event.id) ?? event);
  if (typeof query === "number") return events.filter(({ id }) => id === query);
  if (typeof query === "string") {
    const byId = events.filter(({ id }) => id === query);
    return byId.length > 0 ? byId : events.filter(({ title }) => title === query);
  }
  if ("id" in query) return events.filter(({ id }) => id === query.id);
  if ("title" in query) return events.filter(({ title }) => title === query.title);
  return events.filter((event) =>
    startsAt(event as NormalizedCalendarEvent<unknown, EventId, ResourceId>, query.start, timeZone),
  );
}

/** The one event a query names; throws when it names none or several. */
export function findEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  snapshot: EventSnapshot<TEvent, TEventId, TResourceId>,
  query: EventQuery,
  timeZone: string,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> {
  const found = findEvents(snapshot, query, timeZone);
  if (found.length === 1) return found[0]!;
  const titles = snapshot.events.map(({ id, title }) => `${JSON.stringify(title)} (${String(id)})`);
  if (found.length === 0) {
    throw new CalendarQueryError(
      `No event matches ${describe(query)}. The calendar has ${titles.length === 0 ? "no events" : titles.join(", ")}.`,
    );
  }
  throw new CalendarQueryError(
    `${found.length} events match ${describe(query)}: ${found.map(({ id }) => String(id)).join(", ")}. Name one by its ID.`,
  );
}

/** Elements showing an event, in document order; a drag's floating copy isn't one of them. */
export function eventElements(container: ParentNode, id: EventId): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-event-id]")].filter(
    (element) => eventIdOf(element) === id && element.closest("[data-calendar-ghost]") === null,
  );
}

/** Whether an element sits in a resource: always, when none is asked for. */
export function inResource(element: Element, resourceId: ResourceId | null | undefined): boolean {
  return resourceId === undefined || resourceIdOf(element) === resourceId;
}

/** `[data-date]` elements for a date, outermost first, in a resource. */
function dated(container: ParentNode, date: DateInput, resourceId: ResourceId | null | undefined) {
  const key = toPlainDate(date).toString();
  return [...container.querySelectorAll<HTMLElement>(`[data-date="${key}"]`)].filter((element) =>
    inResource(element, resourceId),
  );
}

/**
 * The cell for a day: a time grid's all-day cell, or a month's day. Views mark them for the
 * pointer layer with `data-date`, the all-day row also with `data-all-day`.
 */
export function dayCell(
  container: ParentNode,
  date: DateInput,
  resourceId?: ResourceId | null,
): HTMLElement | null {
  const cells = dated(container, date, resourceId);
  return (
    cells.find((cell) => cell.hasAttribute("data-all-day")) ??
    (container.querySelector("[data-all-day]") === null
      ? (cells.find((cell) => !cell.hasAttribute("data-axis")) ?? null)
      : null)
  );
}

/**
 * The column holding a day's time, in a time grid or along a timeline's row (`data-axis="inline"`):
 * a `data-date` element without `data-all-day`, in a view that has an all-day row or an inline
 * axis.
 */
export function timeColumn(
  container: ParentNode,
  date: DateInput,
  resourceId?: ResourceId | null,
): HTMLElement | null {
  const cells = dated(container, date, resourceId).filter(
    (cell) => !cell.hasAttribute("data-all-day"),
  );
  const inline = cells.find((cell) => cell.getAttribute("data-axis") === "inline");
  if (inline !== undefined) return inline;
  return container.querySelector("[data-all-day]") === null ? null : (cells[0] ?? null);
}

/** Elements carrying a resource's `resourceIdAttributes`, in document order. */
export function resourceElements(
  container: ParentNode,
  resourceId: ResourceId | null,
): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-resource-id]")].filter(
    (element) => resourceIdOf(element) === resourceId,
  );
}
