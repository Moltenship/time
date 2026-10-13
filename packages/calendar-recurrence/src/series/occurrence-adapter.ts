import type {
  CalendarEventInterval,
  EventAdapter,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

import type { RecurrenceOccurrence } from "../types";

// Shared by every adapter, so one made for each render starts warm: objects' identity numbers, and
// occurrences' interval keys. An occurrence's interval never changes, so its key is worth keeping;
// revisions are read live.
const identities = new WeakMap<object, number>();
const intervalKeys = new WeakMap<object, string>();
let nextIdentity = 0;

function intervalKey(interval: CalendarEventInterval): string {
  // Instants as epoch nanoseconds: ISO text cost a third of the snapshot.
  if (interval.kind === "timed") {
    const { end, sourceTimeZone = "", start } = interval;
    return `timed:${start.epochNanoseconds}/${end.epochNanoseconds}:${sourceTimeZone}`;
  }
  return `${interval.kind}:${String(interval.start)}/${String(interval.end)}`;
}

/**
 * Hands occurrences to the calendar as events: their IDs and intervals, and the title, resources,
 * read-only and busy state of the event they show, through `eventAdapter`.
 *
 * The revision combines the revisions of the occurrence's event and series with its interval, so
 * the snapshot and pending changes see a change to the master, an override, or a THISANDFUTURE
 * move. Without `eventAdapter.getRevision`, an event's revision is its object identity, which is
 * what the expander reuses work by: replace events rather than changing them.
 */
export function createOccurrenceAdapter<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>,
): EventAdapter<RecurrenceOccurrence<TEvent, TEventId>, TEventId | string, TResourceId> {
  type Occurrence = RecurrenceOccurrence<TEvent, TEventId>;

  function revisionOf(event: TEvent): string | number {
    if (eventAdapter.getRevision !== undefined) return eventAdapter.getRevision(event);
    if ((typeof event !== "object" || event === null) && typeof event !== "function") {
      return `${typeof event}:${String(event)}`;
    }
    let identity = identities.get(event);
    if (identity === undefined) {
      identity = nextIdentity++;
      identities.set(event, identity);
    }
    return identity;
  }

  const isBusy = eventAdapter.isBusy?.bind(eventAdapter);
  const isReadOnly = eventAdapter.isReadOnly?.bind(eventAdapter);
  return {
    getId: (occurrence) => occurrence.id,
    getInterval: (occurrence) => occurrence.interval,
    getResourceIds: (occurrence) => eventAdapter.getResourceIds(occurrence.event),
    getRevision(occurrence) {
      let key = intervalKeys.get(occurrence);
      if (key === undefined) {
        key = intervalKey(occurrence.interval);
        intervalKeys.set(occurrence, key);
      }
      const series = occurrence.recurrence?.series;
      return JSON.stringify([
        revisionOf(occurrence.event),
        series === undefined || series === occurrence.event ? null : revisionOf(series),
        key,
      ]);
    },
    getTitle: (occurrence) => eventAdapter.getTitle(occurrence.event),
    ...(isBusy === undefined
      ? {}
      : { isBusy: (occurrence: Occurrence) => isBusy(occurrence.event) }),
    ...(isReadOnly === undefined
      ? {}
      : { isReadOnly: (occurrence: Occurrence) => isReadOnly(occurrence.event) }),
  };
}
