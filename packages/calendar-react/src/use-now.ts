import type { CalendarNowSource } from "@moltenship/calendar-core";
import { clockOf, createClockTicker } from "@moltenship/calendar-primitives";
import { useContext, useMemo, useSyncExternalStore } from "react";

import { CalendarNowSourceContext } from "./context";

export interface UseNowOptions {
  /** How often the clock is sampled. Defaults to one minute. */
  readonly intervalMs?: number;
}

const serverSnapshot = () => null;
const subscribeToNothing = () => () => undefined;

/** Samples `source`; `null` while server rendering and hydrating unless `now` is fixed. */
export function useNowFrom(
  source: CalendarNowSource | undefined,
  intervalMs: number,
): Temporal.Instant | null {
  const clock = clockOf(source);
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
  return useNowFrom(useContext(CalendarNowSourceContext), intervalMs);
}
