import {
  resourceStatusAt,
  type CalendarNowSource,
  type EventId,
  type EventSnapshot,
  type NormalizedCalendarEvent,
  type ResourceId,
  type ResourceStatus,
} from "@moltenship/calendar-core";
import { createSystemClock } from "@moltenship/calendar-temporal";
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

/** A resource's status, with the events in progress as the root's snapshot has them. */
export type CalendarResourceStatus = ResourceStatus<
  NormalizedCalendarEvent<unknown, EventId, ResourceId>
>;

/** The nearest root's events, pending changes included, for hooks that work in any factory. */
export const CalendarEventsContext: Context<AnyEventSnapshot | null> =
  createContext<AnyEventSnapshot | null>(null);

const systemClock = createSystemClock();
/** How often the clock is sampled between changes, in case it jumps. */
const SAMPLE_MS = 60_000;
const serverSnapshot = () => null;
const subscribeToNothing = () => () => undefined;

function sameInstant(left: Temporal.Instant | null, right: Temporal.Instant | null): boolean {
  return left === right || (left !== null && right !== null && left.equals(right));
}

function sameStatus(left: CalendarResourceStatus, right: CalendarResourceStatus): boolean {
  const [a, b] = [left.availability, right.availability];
  const [c, d] = [left.busy, right.busy];
  return (
    sameInstant(left.changesAt, right.changesAt) &&
    (a.available
      ? b.available && sameInstant(a.closesAt, b.closesAt)
      : !b.available &&
        a.reason === b.reason &&
        a.label === b.label &&
        sameInstant(a.opensAt, b.opensAt)) &&
    (c.busy
      ? d.busy &&
        sameInstant(c.freeAt, d.freeAt) &&
        c.events.length === d.events.length &&
        c.events.every((event, index) => event === d.events[index])
      : !d.busy && sameInstant(c.nextEventAt, d.nextEventAt))
  );
}

/**
 * The status on the clock: it samples when the status next changes, and every minute in case the
 * clock jumps, and tells subscribers only when the status differs.
 */
function createStatusClock(
  source: CalendarNowSource | undefined,
  compute: (at: Temporal.Instant) => CalendarResourceStatus,
) {
  const clock = source?.clock ?? systemClock;
  let current: CalendarResourceStatus | undefined;
  return {
    getSnapshot: () => (current ??= compute(clock.instant())),
    subscribe: (onChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const sample = () => {
        const now = clock.instant();
        const next = compute(now);
        if (current === undefined || !sameStatus(current, next)) {
          current = next;
          onChange();
        }
        const until =
          next.changesAt === null ? SAMPLE_MS : now.until(next.changesAt).total("milliseconds");
        timer = setTimeout(sample, Math.max(0, Math.min(SAMPLE_MS, until)));
      };
      // Resample on every (re)subscription so a revealed Activity does not show a stale status.
      sample();
      return () => clearTimeout(timer);
    },
  };
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
  const events = useContext(CalendarEventsContext);
  if (events === null) throw new Error("calendar-hook-outside-root");
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
    () => (onClock ? createStatusClock(source, compute) : null),
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
