import type { EventId, ResourceId } from "../ids";
import {
  wallClockEndpoints,
  withWallClockEndpoints,
  type DurationInput,
} from "../transactions/wall-clock";
import type { CalendarPolicy } from "./types";

/**
 * Rounds timed and floating changes to a wall-clock grid in the display time zone, such as
 * `{ minutes: 15 }`. Moves keep their duration and resizes snap only the dragged edge. A change
 * that snapping would empty is left as proposed.
 */
export function snapPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  increment: DurationInput,
): CalendarPolicy<TEvent, TEventId, TResourceId> {
  const minutes = Temporal.Duration.from(increment).total({ unit: "minutes" });
  const rounding =
    minutes % 60 === 0
      ? ({ roundingIncrement: minutes / 60, smallestUnit: "hour" } as const)
      : ({ roundingIncrement: minutes, smallestUnit: "minute" } as const);
  // Fail fast: Temporal requires the increment to divide an hour or a day evenly.
  Temporal.PlainTime.from("00:00").round(rounding);

  return ({ cause, proposed }, { timeZone }) => {
    if (proposed === null || proposed.kind === "all-day") return { type: "accept" };
    const current = wallClockEndpoints(proposed, timeZone);
    const start = cause === "resize-end" ? current.start : current.start.round(rounding);
    const end =
      cause === "resize-start"
        ? current.end
        : cause === "move"
          ? current.end.add(current.start.until(start))
          : current.end.round(rounding);

    if (
      Temporal.ZonedDateTime.compare(start, end) >= 0 ||
      (start.equals(current.start) && end.equals(current.end))
    ) {
      return { type: "accept" };
    }
    return { proposed: withWallClockEndpoints(proposed, start, end), type: "adjust" };
  };
}
