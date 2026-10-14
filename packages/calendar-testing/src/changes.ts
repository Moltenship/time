import type {
  CalendarEvent,
  CalendarEventChange,
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar";

export interface ApplyChangeOptions<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /**
   * The record a new event gets, from its change and the first `new-<n>` ID no event has; the
   * proposed placement is applied over it. Defaults to `{ id, title: "New event", data: null }`.
   */
  readonly createEvent?: (
    change: Extract<CalendarEventChange<TEvent, TEventId, TResourceId>, { cause: "create" }>,
    id: string,
  ) => TEvent;
}

/** Whether a record has the canonical event shape: a kind and ends of its own. */
function isCanonicalEvent(record: unknown): record is CalendarEvent {
  return (
    typeof record === "object" &&
    record !== null &&
    "id" in record &&
    "kind" in record &&
    "start" in record &&
    "end" in record
  );
}

function placed<TEvent>(event: TEvent, placement: CalendarEventPlacement): TEvent {
  const record = event as CalendarEvent & Record<string, unknown>;
  const { sourceTimeZone: _sourceTimeZone, ...rest } = record;
  const keepResources = record.resourceIds !== undefined || placement.resourceIds.length > 0;
  return Object.freeze({
    ...(placement.kind === "timed" ? record : rest),
    end: placement.end,
    kind: placement.kind,
    ...(keepResources ? { resourceIds: placement.resourceIds } : {}),
    ...(placement.kind === "timed" && placement.sourceTimeZone !== undefined
      ? { sourceTimeZone: placement.sourceTimeZone }
      : {}),
    start: placement.start,
  }) as TEvent;
}

/**
 * Applies a change `onEventChange` received to canonical events (`CalendarEvent`), as an app
 * that saves at once would: a move or resize takes the proposed placement, a delete drops the
 * event, and a create adds `createEvent`'s record placed where it was proposed, or the record the
 * change carries, as an undone delete does. Returns a new array.
 */
export function applyCanonicalChange<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  events: readonly TEvent[],
  change: CalendarEventChange<TEvent, TEventId, TResourceId>,
  options: ApplyChangeOptions<TEvent, TEventId, TResourceId> = {},
): readonly TEvent[] {
  const record = events.find((event) => !isCanonicalEvent(event));
  if (record !== undefined) {
    throw new TypeError(
      "applyCanonicalChange works on canonical CalendarEvent records; pass `applyChange` for your own event type.",
    );
  }
  if (change.cause === "delete") {
    return events.filter((event) => (event as CalendarEvent).id !== change.eventId);
  }
  if (change.cause === "create") {
    const taken = new Set(events.map((event) => (event as CalendarEvent).id));
    let sequence = 1;
    while (taken.has(`new-${sequence}`)) sequence += 1;
    const id = `new-${sequence}`;
    const base =
      change.event ??
      options.createEvent?.(change, id) ??
      ({ data: null, id, title: "New event" } as TEvent);
    return [...events, placed(base, change.proposed)];
  }
  return events.map((event) =>
    (event as CalendarEvent).id === change.eventId ? placed(event, change.proposed) : event,
  );
}
