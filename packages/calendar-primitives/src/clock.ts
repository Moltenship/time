import type { CalendarNowSource } from "@moltenship/calendar-core";
import { createSystemClock, type CalendarClock } from "@moltenship/calendar-temporal";

/** The clock a root reads when it has neither `now` nor `clock`. */
export const systemClock: CalendarClock = createSystemClock();

/** How often a root samples its clock for `today`. */
export const TODAY_SAMPLE_INTERVAL_MS = 60_000;

export interface CalendarClockTicker {
  /** The last sample, taken now if there is none yet. */
  readonly getSnapshot: () => Temporal.Instant;
  /**
   * Samples at once and then every interval, calling `onChange` when the instant moved; returns
   * the cleanup that stops the timer.
   */
  readonly subscribe: (onChange: () => void) => () => void;
}

/** Samples `clock` every `intervalMs` while subscribed. */
export function createClockTicker(clock: CalendarClock, intervalMs: number): CalendarClockTicker {
  let current: Temporal.Instant | undefined;

  return Object.freeze({
    getSnapshot: () => (current ??= clock.instant()),
    subscribe: (onChange: () => void) => {
      const sample = () => {
        const next = clock.instant();
        if (current?.equals(next) === true) return;
        current = next;
        onChange();
      };
      // Resample on every (re)subscription so a revealed view does not show a stale instant.
      sample();
      const timer = setInterval(sample, intervalMs);
      return () => clearInterval(timer);
    },
  });
}

/** The clock a source samples: its own, or the system's. */
export function clockOf(source: CalendarNowSource | undefined): CalendarClock {
  return source?.clock ?? systemClock;
}
