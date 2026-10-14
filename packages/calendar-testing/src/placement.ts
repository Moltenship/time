import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar";

/** Where an event shows, as text that compares with `===` and `toEqual`. */
export interface EventPlacementSummary<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly id: TEventId;
  readonly title: string;
  readonly kind: "timed" | "all-day" | "floating";
  /** ISO text: an instant for a timed event, a date for an all-day one, a date and time for a floating one. */
  readonly start: string;
  readonly end: string;
  /** `start/end`. */
  readonly range: string;
  /**
   * The ends on the display time zone's wall clock to the minute, such as
   * `2026-10-08T11:00/2026-10-08T12:00`; the same as `range` for all-day and floating events.
   */
  readonly wallRange: string;
  readonly resourceIds: readonly TResourceId[];
  /** Whether it shows a change that isn't saved and in the events yet. */
  readonly isPending: boolean;
}

function wall(instant: Temporal.Instant, timeZone: string): string {
  return instant
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

/** Summarizes where a normalized event shows. */
export function summarizePlacement<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>,
  timeZone: string,
): EventPlacementSummary<TEventId, TResourceId> {
  const start = event.start.toString();
  const end = event.end.toString();
  const range = `${start}/${end}`;
  return Object.freeze({
    end,
    id: event.id,
    isPending: event.isPending === true,
    kind: event.kind,
    range,
    resourceIds: event.resourceIds,
    start,
    title: event.title,
    wallRange:
      event.kind === "timed"
        ? `${wall(event.start, timeZone)}/${wall(event.end, timeZone)}`
        : range,
  });
}
