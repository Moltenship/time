import type {
  CalendarEventChange,
  CalendarEventPlacement,
  PlainDateInterval,
} from "@moltenship/calendar";
import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { overlapsWindow, type ApiEvent, type EventsApi, type EventsWindow } from "./query-api";

// #region window
/** Whole months from one date's month to another's. */
const monthsBetween = (from: Temporal.PlainDate, to: Temporal.PlainDate) =>
  from.with({ day: 1 }).until(to.with({ day: 1 }), { largestUnit: "months" }).months;

/**
 * The window to load for the calendar's `loadRange`: the month holding its middle day, with whole
 * months either side, at least one and as many as the load range reaches.
 */
export function eventsWindow(loadRange: PlainDateInterval, timeZone: string): EventsWindow {
  const { end, start } = loadRange;
  const middle = start.add({ days: Math.floor(start.until(end).days / 2) }).with({ day: 1 });
  const months = Math.max(
    1,
    monthsBetween(start, middle),
    monthsBetween(middle, end.subtract({ days: 1 })),
  );
  return {
    end: middle.add({ months: months + 1 }).toString(),
    start: middle.subtract({ months }).toString(),
    timeZone,
  };
}

/** The window `months` later, or earlier when negative. */
export function shiftWindow({ end, start, timeZone }: EventsWindow, months: number): EventsWindow {
  return {
    end: Temporal.PlainDate.from(end).add({ months }).toString(),
    start: Temporal.PlainDate.from(start).add({ months }).toString(),
    timeZone,
  };
}
// #endregion window

// #region query
/** The start of every events query's key, so changes can find them all. */
export const eventsKey = ["events"] as const;

export function eventsQuery(api: EventsApi, dates: EventsWindow) {
  return queryOptions({
    queryKey: [...eventsKey, dates],
    queryFn: ({ signal }) => api.listEvents(dates, signal),
    // Going back to dates seen in the last minute shows them without asking again.
    staleTime: 60_000,
  });
}
// #endregion query

// #region cache
/**
 * Puts `event` in every cached window it overlaps, in place of the event with this `id`, and takes
 * that event out of the others. `null` takes it out everywhere.
 */
export function putEvent(queryClient: QueryClient, id: string, event: ApiEvent | null): void {
  const cached = queryClient.getQueriesData<ApiEvent[]>({ queryKey: eventsKey });
  for (const [queryKey, events] of cached) {
    if (events === undefined) continue;
    // Keys come from `eventsQuery`: the window follows `eventsKey`.
    const dates = queryKey[eventsKey.length] as EventsWindow;
    const index = events.findIndex((candidate) => candidate.id === id);
    let next = events;
    if (event !== null && overlapsWindow(event, dates)) {
      next = index === -1 ? [...events, event] : events.with(index, event);
    } else if (index !== -1) {
      next = events.toSpliced(index, 1);
    }
    if (next !== events) queryClient.setQueryData(queryKey, next);
  }
}
// #endregion cache

// #region write
export type ApiEventChange = CalendarEventChange<ApiEvent, string, never>;

/** What a change writes: the event's record before and after it, or `null` where there's none. */
export interface EventWrite {
  readonly id: string;
  readonly before: ApiEvent | null;
  readonly after: ApiEvent | null;
}

/** `event` at the placement the calendar proposes. */
function placed(
  event: Omit<ApiEvent, "allDay" | "end" | "start">,
  placement: CalendarEventPlacement<never>,
): ApiEvent {
  if (placement.kind === "floating") throw new Error("Events need a time zone.");
  return {
    ...event,
    allDay: placement.kind === "all-day",
    end: placement.end.toString(),
    start: placement.start.toString(),
  };
}

export function writeOf(change: ApiEventChange): EventWrite {
  switch (change.cause) {
    case "create": {
      // Picked here, so the event shown while it saves and the saved one share it.
      const id = crypto.randomUUID();
      const event = { color: "blue", id, title: "New event", version: 0 } as const;
      return { after: placed(event, change.proposed), before: null, id };
    }
    case "delete":
      return { after: null, before: change.event, id: change.eventId };
    default:
      return {
        after: placed(change.event, change.proposed),
        before: change.event,
        id: change.eventId,
      };
  }
}
// #endregion write

// #region mutation
/**
 * Reloads the events after the last save. Loads still on their way read before it, so they're
 * cancelled first, and windows off screen that never loaded go, to be prefetched again.
 */
async function reloadEvents(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: eventsKey });
  queryClient.removeQueries({
    queryKey: eventsKey,
    predicate: (query) => query.state.data === undefined,
    type: "inactive",
  });
  await queryClient.invalidateQueries({ queryKey: eventsKey });
}

export function useSaveEvent(api: EventsApi) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: eventsKey,
    // Saves reach the server one at a time, in the order they were made. Each shows at once.
    scope: { id: "events" },
    mutationFn: async ({ after, before, id }: EventWrite) => {
      if (after === null) await api.deleteEvent(id);
      else if (before === null) await api.createEvent(after);
      else await api.updateEvent(after);
    },
    onMutate: async ({ after, id }) => {
      // A reload on its way could bring back what it read before the change. Loads with nothing
      // cached yet carry on, and the reload after the save replaces them.
      await queryClient.cancelQueries({
        queryKey: eventsKey,
        predicate: (query) => query.state.data !== undefined,
      });
      putEvent(queryClient, id, after);
    },
    // Put the event back as it was, in every window. Other changes that are saving stay.
    onError: (_error, { before, id }) => putEvent(queryClient, id, before),
    onSettled: (_data, error) => {
      // Reload once the last save settles, so a reload between two saves can't undo the second.
      if (queryClient.isMutating({ mutationKey: eventsKey }) !== 1) return;
      const reload = reloadEvents(queryClient);
      // A saved change stays pending until the reload shows it; a failed one rolls back now.
      return error === null ? reload : undefined;
    },
  });
}
// #endregion mutation
