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
 * `{ title }` or `{ start }`. A `start` is a date for an all-day event, a date and time for a
 * floating one, or a time for a timed one: exact, or a wall time on the calendar's time zone.
 */
export type EventQuery<TEventId extends EventId = EventId> =
  | string
  | number
  | { readonly id: TEventId }
  | { readonly title: string }
  | { readonly start: DateTimeInput | Temporal.PlainDate | Temporal.PlainDateTime };

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

/** ISO text without its bracketed annotations, such as `[America/Toronto]`. */
const withoutAnnotations = (text: string) => text.replace(/\[[^\]]*\]/gu, "");

function startsAt(
  event: NormalizedCalendarEvent<unknown, EventId, ResourceId>,
  start: DateTimeInput | Temporal.PlainDate | Temporal.PlainDateTime,
  timeZone: string,
): boolean {
  if (typeof start === "string") {
    const text = withoutAnnotations(start);
    if (!/[Tt ]/u.test(text)) {
      return event.kind === "all-day" && event.start.equals(toPlainDate(start));
    }
    if (event.kind === "floating") {
      return (
        !/[zZ+-]/u.test(text.split(/[Tt ]/u)[1] ?? "") &&
        event.start.equals(Temporal.PlainDateTime.from(start))
      );
    }
    return event.kind === "timed" && event.start.equals(toInstant(start, timeZone));
  }
  if (start instanceof Temporal.PlainDate) {
    return event.kind === "all-day" && event.start.equals(start);
  }
  if (start instanceof Temporal.PlainDateTime) {
    return event.kind === "floating" && event.start.equals(start);
  }
  return event.kind === "timed" && event.start.equals(toInstant(start, timeZone));
}

/** The events of `snapshot` a query names, as the calendar shows them, pending changes included. */
export function findEvents<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  snapshot: EventSnapshot<TEvent, TEventId, TResourceId>,
  query: EventQuery<TEventId>,
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
  query: EventQuery<TEventId>,
  timeZone: string,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> {
  const found = findEvents(snapshot, query, timeZone);
  if (found.length === 1) return found[0]!;
  const titles = snapshot.events.map(
    ({ id, title }) => `${JSON.stringify(title)} (${JSON.stringify(id)})`,
  );
  if (found.length === 0) {
    throw new CalendarQueryError(
      `No event matches ${describe(query)}. The calendar has ${titles.length === 0 ? "no events" : titles.join(", ")}.`,
    );
  }
  throw new CalendarQueryError(
    `${found.length} events match ${describe(query)}: ${found.map(({ id }) => JSON.stringify(id)).join(", ")}. Name one by its ID.`,
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

/** `[data-date]` elements for a date, in a resource. */
function dated(container: ParentNode, date: DateInput, resourceId: ResourceId | null | undefined) {
  const key = toPlainDate(date).toString();
  return [...container.querySelectorAll<HTMLElement>(`[data-date="${key}"]`)].filter((element) =>
    inResource(element, resourceId),
  );
}

/**
 * The cell for a day: a time grid's all-day cell (`data-all-day`), else a month's day, the first
 * `data-date` element that isn't a timeline's strip.
 */
export function dayCell(
  container: ParentNode,
  date: DateInput,
  resourceId?: ResourceId | null,
): HTMLElement | null {
  const cells = dated(container, date, resourceId);
  return (
    cells.find((cell) => cell.hasAttribute("data-all-day")) ??
    cells.find((cell) => cell.getAttribute("data-axis") !== "inline") ??
    null
  );
}

/**
 * The column holding a day's time: a `data-date` element without `data-all-day`, a timeline's
 * strip (`data-axis="inline"`) first. In a month, the day itself, which has no time to point at.
 */
export function timeColumn(
  container: ParentNode,
  date: DateInput,
  resourceId?: ResourceId | null,
): HTMLElement | null {
  const cells = dated(container, date, resourceId).filter(
    (cell) => !cell.hasAttribute("data-all-day"),
  );
  return cells.find((cell) => cell.getAttribute("data-axis") === "inline") ?? cells[0] ?? null;
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
