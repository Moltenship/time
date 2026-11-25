import type { CalendarNowSource } from "@moltenship/calendar-core";
import { createSystemClock, type CalendarClock } from "@moltenship/calendar-temporal";

import { createListeners } from "./listeners";

/** The clock a root reads when it has neither `now` nor `clock`. */
export const systemClock: CalendarClock = createSystemClock();

/** How often a root samples its clock for `today`. */
export const TODAY_SAMPLE_INTERVAL_MS = 60_000;

export interface CalendarClockTicker {
  /** The last sample, taken now if there is none yet. */
  readonly getSnapshot: () => Temporal.Instant;
  /**
   * Samples at once, and then every interval while anyone is subscribed, calling every
   * subscriber when the instant moved; returns the cleanup that ends this subscription.
   */
  readonly subscribe: (onChange: () => void) => () => void;
}

/**
 * Samples `clock` every `intervalMs` while subscribed: one timer for every subscriber, started by
 * the first and stopped by the last.
 */
export function createClockTicker(clock: CalendarClock, intervalMs: number): CalendarClockTicker {
  const listeners = createListeners();
  let current: Temporal.Instant | undefined;
  let subscriptions = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const sample = () => {
    const next = clock.instant();
    if (current?.equals(next) === true) return;
    current = next;
    listeners.notify();
  };

  return Object.freeze({
    getSnapshot: () => (current ??= clock.instant()),
    subscribe: (onChange: () => void) => {
      const unsubscribe = listeners.subscribe(onChange);
      subscriptions += 1;
      // Resample on every (re)subscription so a revealed view does not show a stale instant.
      sample();
      timer ??= setInterval(sample, intervalMs);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        unsubscribe();
        subscriptions -= 1;
        if (subscriptions === 0) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
  });
}

/** The clock a source samples: its own, or the system's. */
export function clockOf(source: CalendarNowSource | undefined): CalendarClock {
  return source?.clock ?? systemClock;
}
