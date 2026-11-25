import { resourceStatusAt, type ResourceId } from "@moltenship/calendar-core";
import {
  createResourceStatusClock,
  type CalendarResourceStatus,
  type CalendarStateSource,
} from "@moltenship/calendar-primitives";
import { createMemo, type Accessor } from "solid-js";

import { access, useShared, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";

export type { CalendarResourceStatus };

const same = <T>(value: T) => value;
const noop = () => undefined;
/** What a resource off the clock reads: nothing, the same shape as a clock's store. */
const offClock: CalendarStateSource<CalendarResourceStatus | null> = Object.freeze({
  getServerSnapshot: () => null,
  getSnapshot: () => null,
  subscribe: () => noop,
});

/**
 * Whether a resource is within its working hours and whether its events occupy it, `at` an
 * instant or now on the calendar's clock, as an accessor; see `resourceStatusAt`. Without
 * `resourceId` it is the calendar's hours and every event. All-day and floating events count on
 * the display time zone, as the views show them. On the clock it updates only when the status
 * changes, and is `null` while server rendering and hydrating unless the calendar fixes `now`. A
 * `null` resource turns it off, such as for the Unassigned column, with nothing computed or
 * scheduled.
 */
export function useResourceStatus(
  resourceId?: MaybeAccessor<ResourceId | null | undefined>,
  at?: MaybeAccessor<Temporal.Instant | undefined>,
): Accessor<CalendarResourceStatus | null> {
  const { availability, environment, events } = useShared();
  const resource = () => access(resourceId);
  const fixed = () => access(at) ?? environment().now;
  const off = () => resource() === null;
  const compute = createMemo(() => {
    const schedule = availability();
    const snapshot = events();
    const options = { resourceId: resource() ?? undefined, timeZone: schedule.timeZone };
    return (instant: Temporal.Instant) => resourceStatusAt(schedule, snapshot, instant, options);
  });
  const onClock = createMemo(() => fixed() === undefined && !off());
  const store = createMemo(() =>
    onClock() ? createResourceStatusClock(environment(), compute()) : offClock,
  );
  const sampled = createStateSelector(store, same);
  // By value, so an `at` made anew on each read computes once.
  const pinnedAt = createMemo(() => (off() ? undefined : fixed()?.epochNanoseconds));
  const pinned = createMemo(() => {
    const nanoseconds = pinnedAt();
    return nanoseconds === undefined
      ? null
      : compute()(Temporal.Instant.fromEpochNanoseconds(nanoseconds));
  });
  return () => pinned() ?? sampled();
}
