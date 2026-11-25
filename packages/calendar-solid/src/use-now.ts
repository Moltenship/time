import type { CalendarNowSource } from "@moltenship/calendar-core";
import {
  clockOf,
  createClockTicker,
  type CalendarStateSource,
} from "@moltenship/calendar-primitives";
import { createMemo, useContext, type Accessor } from "solid-js";

import { access, sharedContext, type MaybeAccessor } from "./shared";
import { createStateSelector } from "./state-selector";

export interface UseNowOptions {
  /** How often the clock is sampled. Defaults to one minute. */
  readonly intervalMs?: number;
}

const same = <T>(value: T) => value;
const noop = () => undefined;
/** What a fixed `now` subscribes to: nothing. */
const noClock: CalendarStateSource<Temporal.Instant | null> = Object.freeze({
  getSnapshot: () => null,
  subscribe: () => noop,
});

/**
 * Samples `source` every `intervalMs`: `null` on the server and while hydrating, as the server's
 * time isn't the reader's, unless `source.now` fixes it. The timer runs while something reads it.
 */
export function createNowSampler(
  source: Accessor<CalendarNowSource | undefined>,
  intervalMs: Accessor<number>,
): Accessor<Temporal.Instant | null> {
  // By the clock alone, so a new source object with the same clock keeps its ticker.
  const clock = createMemo(() => clockOf(source()));
  const ticker = createMemo(() => createClockTicker(clock(), intervalMs()));
  const sampled = createStateSelector<Temporal.Instant | null, Temporal.Instant | null>(() => {
    if (source()?.now !== undefined) return noClock;
    const { getSnapshot, subscribe } = ticker();
    return { getServerSnapshot: () => null, getSnapshot, subscribe };
  }, same);
  return () => source()?.now ?? sampled();
}

const outsideRoot = () => undefined;

/**
 * The current instant from the nearest calendar's `now` or `clock`, as an accessor; outside a
 * calendar, the system clock's. It is `null` during server rendering and hydration unless the
 * calendar fixes `now`.
 */
export function useNow(
  options: MaybeAccessor<UseNowOptions> = {},
): Accessor<Temporal.Instant | null> {
  const environment = useContext(sharedContext.context)?.environment ?? outsideRoot;
  return createNowSampler(environment, () => access(options).intervalMs ?? 60_000);
}
