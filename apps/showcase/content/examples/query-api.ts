// #region types
import type { CalendarEventColor } from "@/components/calendar/event-colors";

/** An event as the API sends it: JSON, with ISO strings for its times. */
export interface ApiEvent {
  readonly id: string;
  readonly title: string;
  readonly color: CalendarEventColor;
  /** Dates such as `2026-10-12` when `allDay`, otherwise instants such as `2026-10-12T07:30:00Z`. */
  readonly start: string;
  /** Exclusive, as the calendar's ends are. */
  readonly end: string;
  readonly allDay: boolean;
  /** Goes up with every saved change. */
  readonly version: number;
}

/** The dates one query loads, from `start` up to `end`, in a time zone. */
export interface EventsWindow {
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
}

export interface EventsApi {
  /** The events that overlap the window, also those that start before it or end after it. */
  listEvents(dates: EventsWindow, signal?: AbortSignal): Promise<ApiEvent[]>;
  createEvent(event: ApiEvent): Promise<ApiEvent>;
  updateEvent(event: ApiEvent): Promise<ApiEvent>;
  deleteEvent(id: string): Promise<void>;
}
// #endregion types

// #region overlaps
/**
 * Whether an event overlaps the window. Timed events are compared as instants, between the
 * window's first and last midnight in its time zone; all-day events as dates.
 */
export function overlapsWindow(event: ApiEvent, { end, start, timeZone }: EventsWindow): boolean {
  if (event.allDay) {
    return (
      Temporal.PlainDate.compare(event.start, end) < 0 &&
      Temporal.PlainDate.compare(start, event.end) < 0
    );
  }
  const from = Temporal.PlainDate.from(start).toZonedDateTime(timeZone).toInstant();
  const to = Temporal.PlainDate.from(end).toZonedDateTime(timeZone).toInstant();
  return (
    Temporal.Instant.compare(event.start, to) < 0 && Temporal.Instant.compare(from, event.end) < 0
  );
}
// #endregion overlaps

// #region fake
export interface FakeEventsApiOptions {
  /** How long each request takes, in milliseconds. */
  readonly latency: number;
  /** Asked when a request starts; `true` makes it fail. */
  readonly shouldFail?: () => boolean;
}

/**
 * A server kept in memory, for demos and tests. Requests take `latency` to answer, and every
 * answer is a copy, as if it came over the network.
 */
export function createFakeEventsApi(
  seed: readonly ApiEvent[],
  { latency, shouldFail = () => false }: FakeEventsApiOptions,
): EventsApi {
  const stored = new Map(seed.map((event) => [event.id, event]));

  function request<T>(respond: () => T, signal?: AbortSignal): Promise<T> {
    const failing = shouldFail();
    return new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        if (failing) {
          reject(new Error("The server didn't answer."));
          return;
        }
        try {
          resolve(respond());
        } catch (error) {
          reject(error);
        }
      }, latency);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  function save(event: ApiEvent): ApiEvent {
    const saved = { ...event, version: (stored.get(event.id)?.version ?? 0) + 1 };
    stored.set(saved.id, saved);
    return { ...saved };
  }

  return {
    createEvent: (event) =>
      request(() => {
        if (stored.has(event.id)) throw new Error(`Event ${event.id} already exists.`);
        return save(event);
      }),
    deleteEvent: (id) =>
      request(() => {
        stored.delete(id);
      }),
    listEvents: (dates, signal) =>
      request(
        () =>
          [...stored.values()]
            .filter((event) => overlapsWindow(event, dates))
            .map((event) => ({ ...event })),
        signal,
      ),
    updateEvent: (event) =>
      request(() => {
        if (!stored.has(event.id)) throw new Error(`Event ${event.id} doesn't exist.`);
        return save(event);
      }),
  };
}
// #endregion fake
