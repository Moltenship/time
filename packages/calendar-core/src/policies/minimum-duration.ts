import type { EventId, ResourceId } from "../ids";
import {
  positiveDuration,
  wallClockEndpoints,
  withWallClockEndpoints,
  type DurationInput,
} from "../transactions/wall-clock";
import type { CalendarPolicy } from "./types";

/**
 * Lengthens timed and floating changes shorter than `minimum`. A resized start moves earlier;
 * otherwise the end moves later.
 */
export function minimumDurationPolicy<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(minimum: DurationInput): CalendarPolicy<TEvent, TEventId, TResourceId> {
  const duration = positiveDuration(minimum);
  return ({ cause, proposed }, { timeZone }) => {
    if (proposed === null || proposed.kind === "all-day") return { type: "accept" };
    const { end, start } = wallClockEndpoints(proposed, timeZone);
    if (Temporal.ZonedDateTime.compare(start.add(duration), end) <= 0) return { type: "accept" };
    return {
      proposed:
        cause === "resize-start"
          ? withWallClockEndpoints(proposed, end.subtract(duration), end)
          : withWallClockEndpoints(proposed, start, start.add(duration)),
      type: "adjust",
    };
  };
}
