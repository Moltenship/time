import type { ClosedTime } from "@moltenship/calendar";

/** A fraction of a column or row as a CSS percentage. */
export const percent = (fraction: number): string => `${fraction * 100}%`;

/**
 * The attributes of one stretch of closed time, for every framework's `UnavailableTime`:
 * `data-reason`, `data-label`, `data-opens-before`, `data-opens-after` and its slot, which CSS
 * styles it by, and `--band-start` and `--band-end`, where it starts and ends as percentages.
 */
export function unavailableBand(band: ClosedTime, slot: string, start: number, end: number) {
  return {
    attributes: {
      "aria-hidden": true,
      "data-label": band.label,
      "data-opens-after": band.opensAfter ? "" : undefined,
      "data-opens-before": band.opensBefore ? "" : undefined,
      "data-reason": band.reason,
      "data-slot": slot,
    },
    variables: { "--band-end": percent(end), "--band-start": percent(start) },
  } as const;
}
