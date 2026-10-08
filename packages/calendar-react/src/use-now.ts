import type { CalendarNowSource } from "@moltenship/calendar-core";
import { createSystemClock, type CalendarClock } from "@moltenship/calendar-temporal";
import { useContext, useMemo, useSyncExternalStore } from "react";

import { CalendarMetaContext } from "./context";

export interface UseNowOptions {
  /** How often the clock is sampled. Defaults to one minute. */
  readonly intervalMs?: number;
}

const systemClock = createSystemClock();
const serverSnapshot = () => null;
const subscribeToNothing = () => () => undefined;

function createClockTicker(clock: CalendarClock, intervalMs: number) {
  let current: Temporal.Instant | undefined;

  return {
    getSnapshot: () => (current ??= clock.instant()),
    subscribe: (onChange: () => void) => {
      const timer = setInterval(() => {
        current = clock.instant();
        onChange();
      }, intervalMs);
      return () => clearInterval(timer);
    },
  };
}

/** Samples `source`; `null` while server rendering and hydrating unless `now` is fixed. */
export function useNowFrom(
  source: CalendarNowSource | undefined,
  intervalMs: number,
): Temporal.Instant | null {
  const clock = source?.clock ?? systemClock;
  const ticker = useMemo(() => createClockTicker(clock, intervalMs), [clock, intervalMs]);
  const fixed = source?.now;
  const sampled = useSyncExternalStore(
    fixed === undefined ? ticker.subscribe : subscribeToNothing,
    ticker.getSnapshot,
    serverSnapshot,
  );
  return fixed ?? sampled;
}

/**
 * The current instant from the nearest calendar's `now` or `clock`, falling back to the system
 * clock. It is `null` during server rendering and hydration unless the calendar fixes `now`.
 */
export function useNow({ intervalMs = 60_000 }: UseNowOptions = {}): Temporal.Instant | null {
  return useNowFrom(useContext(CalendarMetaContext)?.environment, intervalMs);
}
