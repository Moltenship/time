import type {
  CalendarNowSource,
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceStatus,
} from "@moltenship/calendar-core";

import { clockOf } from "./clock";
import { createListeners } from "./listeners";
import type { CalendarStateSource } from "./types";

/** A resource's status, with the events in progress as the root's snapshot has them. */
export type CalendarResourceStatus = ResourceStatus<
  NormalizedCalendarEvent<unknown, EventId, ResourceId>
>;

/** How often the clock is sampled between changes, in case it jumps. */
const SAMPLE_MS = 60_000;

function sameMoment(left: Temporal.Instant | null, right: Temporal.Instant | null): boolean {
  return left === right || (left !== null && right !== null && left.equals(right));
}

function sameStatus(left: CalendarResourceStatus, right: CalendarResourceStatus): boolean {
  const [a, b] = [left.availability, right.availability];
  const [c, d] = [left.busy, right.busy];
  return (
    sameMoment(left.changesAt, right.changesAt) &&
    (a.available
      ? b.available && sameMoment(a.closesAt, b.closesAt)
      : !b.available &&
        a.reason === b.reason &&
        a.label === b.label &&
        sameMoment(a.opensAt, b.opensAt)) &&
    (c.busy
      ? d.busy &&
        sameMoment(c.freeAt, d.freeAt) &&
        c.events.length === d.events.length &&
        c.events.every((event, index) => event === d.events[index])
      : !d.busy && sameMoment(c.nextEventAt, d.nextEventAt))
  );
}

/**
 * A resource's status on a root's clock, as a store: `compute` (usually `resourceStatusAt` with
 * the root's availability and events) runs when the status next changes, and every minute in case
 * the clock jumps, and subscribers hear only when the status differs. One timer serves every
 * subscriber: it starts with the first and stops with the last. Each new subscription samples
 * again, so a view revealed after a while shows no stale status, and every subscriber hears it
 * when that sample differs. Only `source`'s clock is read: a root that fixes `source.now` computes
 * at it without this store. The server snapshot is `null`, as the server reads no clock.
 */
export function createResourceStatusClock(
  source: CalendarNowSource | undefined,
  compute: (at: Temporal.Instant) => CalendarResourceStatus,
): CalendarStateSource<CalendarResourceStatus | null> {
  const clock = clockOf(source);
  const listeners = createListeners();
  let current: CalendarResourceStatus | undefined;
  let subscriptions = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Samples now and schedules the next sample; whether a status someone read has changed. */
  function sample(): boolean {
    const now = clock.instant();
    const next = compute(now);
    const changed = current !== undefined && !sameStatus(current, next);
    if (current === undefined || changed) current = next;
    const until =
      next.changesAt === null ? SAMPLE_MS : now.until(next.changesAt).total("milliseconds");
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(0, Math.min(SAMPLE_MS, until)));
    return changed;
  }

  function tick() {
    if (sample()) listeners.notify();
  }

  return Object.freeze({
    getServerSnapshot: () => null,
    getSnapshot: () => (current ??= compute(clock.instant())),
    subscribe: (listener: () => void) => {
      const unsubscribe = listeners.subscribe(listener);
      subscriptions += 1;
      tick();
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        unsubscribe();
        subscriptions -= 1;
        if (subscriptions === 0) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
  });
}
