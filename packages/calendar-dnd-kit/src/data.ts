import type { CalendarEventPlacement, EventId, ResourceId } from "@moltenship/calendar-core";
import type { CalendarDropSource } from "@moltenship/calendar-dnd";

const dropKey = "@moltenship/calendar-drop";
const eventKey = "@moltenship/calendar-event";
const regionKey = "@moltenship/calendar-view";

/**
 * The `type` of the draggable a calendar event becomes while it's dragged out of a view; list it
 * in a droppable's `accept` to take calendar events.
 */
export const calendarEventType = "moltenship-calendar-event";

/** A dnd-kit entity, or anything else with `data`, such as `operation.source`. */
type WithData = { readonly data?: unknown } | null | undefined;

/** What a calendar event carries while it's dragged out of a view. */
export interface CalendarEventDragData<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** The application's record. */
  readonly event: TEvent;
  readonly eventId: TEventId;
  /** Where the event is in the calendar. */
  readonly placement: CalendarEventPlacement<TResourceId>;
}

function field(entity: WithData, key: string): unknown {
  const data = entity?.data;
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Data that makes a draggable an item the calendar takes: spread it into `useDraggable`'s `data`,
 * beside your own. Dropped on a view, it proposes a create carrying `source.event`, `duration` long
 * over a time column or `days` long over day cells, or with `eventId` a move.
 */
export function calendarDropData<TEvent, TEventId extends EventId = EventId>(
  source: CalendarDropSource<TEvent, TEventId>,
): { readonly [dropKey]: CalendarDropSource<TEvent, TEventId> } {
  return { [dropKey]: source };
}

/** The calendar drop a draggable carries (`calendarDropData`), or `null` without one. */
export function calendarDropOf<TEvent = unknown, TEventId extends EventId = EventId>(
  source: WithData,
): CalendarDropSource<TEvent, TEventId> | null {
  const drop = field(source, dropKey);
  return typeof drop === "object" && drop !== null
    ? (drop as CalendarDropSource<TEvent, TEventId>)
    : null;
}

/**
 * The calendar event a draggable is, while one is dragged out of a view to a droppable of yours;
 * `null` for any other draggable. Read it in `onDragEnd` from `operation.source`.
 */
export function calendarEventOf<
  TEvent = unknown,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(source: WithData): CalendarEventDragData<TEvent, TEventId, TResourceId> | null {
  const event = field(source, eventKey);
  return typeof event === "object" && event !== null
    ? (event as CalendarEventDragData<TEvent, TEventId, TResourceId>)
    : null;
}

/** The data of the draggable a calendar event becomes while it's dragged out. */
export function calendarEventData(data: CalendarEventDragData): Readonly<Record<string, unknown>> {
  return { [eventKey]: data };
}

/** The data of a calendar view's droppable. */
export const calendarViewData: Readonly<Record<string, unknown>> = Object.freeze({
  [regionKey]: true,
});

/**
 * Whether a droppable is a calendar view's: the adapter handles drops there itself, so an
 * `onDragEnd` of yours can leave `operation.target` alone when this says so.
 */
export function isCalendarTarget(target: WithData): boolean {
  return field(target, regionKey) === true;
}
