import type {
  CalendarNowSource,
  EventId,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceStatus,
} from "@moltenship/calendar-core";

import { clockOf } from "./clock";
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
 * the clock jumps, and subscribers hear only when the status differs. It samples again on every
 * subscription, so a view revealed after a while shows no stale status. It doesn't run on the
 * server: a framework reads `null` there unless the root fixes `now`, and then computes at it.
 */
export function createResourceStatusClock(
  source: CalendarNowSource | undefined,
  compute: (at: Temporal.Instant) => CalendarResourceStatus,
): CalendarStateSource<CalendarResourceStatus> {
  const clock = clockOf(source);
  let current: CalendarResourceStatus | undefined;
  return Object.freeze({
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
      sample();
      return () => clearTimeout(timer);
    },
  });
}
