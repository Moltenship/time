import {
  resourceStatusAt,
  type EventId,
  type EventSnapshot,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  createResourceStatusClock,
  type CalendarResourceStatus,
} from "@moltenship/calendar-primitives";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type Context,
} from "react";

import { useCalendarAvailability } from "./availability";
import { CalendarNowSourceContext } from "./context";

type AnyEventSnapshot = EventSnapshot<unknown, EventId, ResourceId>;

export type { CalendarResourceStatus };

/** The nearest root's events, pending changes included, for hooks that work in any factory. */
export const CalendarEventsContext: Context<AnyEventSnapshot | null> =
  createContext<AnyEventSnapshot | null>(null);

const serverSnapshot = () => null;
const subscribeToNothing = () => () => undefined;

/** The root's events, pending changes included, for hooks that work in any factory. */
export function useCalendarEvents(): AnyEventSnapshot {
  const events = useContext(CalendarEventsContext);
  if (events === null) throw new Error("calendar-hook-outside-root");
  return events;
}

/**
 * Whether a resource is within its working hours and whether its events occupy it, `at` an
 * instant or now on the calendar's clock; see `resourceStatusAt`. Without `resourceId` it is the
 * calendar's hours and every event. All-day and floating events count on the display time zone,
 * as the views show them. On the clock it re-renders only when the status changes, and is `null`
 * while server rendering unless the calendar fixes `now`. A `null` resource turns it off, such as
 * for the Unassigned column, with nothing computed or scheduled.
 */
export function useResourceStatus(
  resourceId?: ResourceId | null,
  at?: Temporal.Instant,
): CalendarResourceStatus | null {
  const availability = useCalendarAvailability();
  const events = useCalendarEvents();
  const source = useContext(CalendarNowSourceContext);
  const fixed = at ?? source?.now;
  const { timeZone } = availability;
  const compute = useCallback(
    (instant: Temporal.Instant) =>
      resourceStatusAt(availability, events, instant, {
        resourceId: resourceId ?? undefined,
        timeZone,
      }),
    [availability, events, resourceId, timeZone],
  );
  const off = resourceId === null;
  const onClock = fixed === undefined && !off;
  const store = useMemo(
    () => (onClock ? createResourceStatusClock(source, compute) : null),
    [compute, onClock, source],
  );
  const sampled = useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );
  // By value, so an `at` made inline on each render computes once.
  const pinnedAt = off ? undefined : fixed?.epochNanoseconds;
  const pinned = useMemo(
    () =>
      pinnedAt === undefined ? null : compute(Temporal.Instant.fromEpochNanoseconds(pinnedAt)),
    [compute, pinnedAt],
  );
  return pinned ?? sampled;
}
