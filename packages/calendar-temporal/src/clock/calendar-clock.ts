export interface CalendarClock {
  instant(): Temporal.Instant;
}

export function createFixedClock(instant: Temporal.Instant): CalendarClock {
  return Object.freeze({ instant: () => instant });
}

export function createSystemClock(): CalendarClock {
  return Object.freeze({
    instant: () => globalThis.Temporal.Now.instant(),
  });
}
