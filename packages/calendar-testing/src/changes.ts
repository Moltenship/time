import type {
  CalendarEvent,
  CalendarEventChange,
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar";

export interface ApplyChangeOptions<TEvent> {
  /**
   * The record a new event gets, from its change; its placement is applied over it. Defaults to
   * `{ id: "new-<n>", title: "New event", data: null }`, numbered by `sequence`.
   */
  readonly createEvent?: (
    change: Extract<CalendarEventChange<TEvent, EventId, ResourceId>, { cause: "create" }>,
    sequence: number,
  ) => TEvent;
}

/** Whether a record has the canonical event shape: a kind and ends of its own. */
export function isCanonicalEvent(record: unknown): record is CalendarEvent {
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
export function applyCanonicalChange<TEvent>(
  events: readonly TEvent[],
  change: CalendarEventChange<TEvent, EventId, ResourceId>,
  options: ApplyChangeOptions<TEvent> & { readonly sequence?: number } = {},
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
    const sequence = options.sequence ?? events.length + 1;
    const base =
      change.event ??
      options.createEvent?.(change, sequence) ??
      ({ data: null, id: `new-${sequence}`, title: "New event" } as TEvent);
    return [...events, placed(base, change.proposed)];
  }
  return events.map((event) =>
    (event as CalendarEvent).id === change.eventId ? placed(event, change.proposed) : event,
  );
}
