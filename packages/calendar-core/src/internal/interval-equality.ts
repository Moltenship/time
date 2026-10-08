import type { CalendarEventInterval } from "../events";

export function intervalEndpointsEqual(
  left: CalendarEventInterval,
  right: CalendarEventInterval,
): boolean {
  switch (left.kind) {
    case "timed":
      return right.kind === "timed" && left.start.equals(right.start) && left.end.equals(right.end);
    case "all-day":
      return (
        right.kind === "all-day" && left.start.equals(right.start) && left.end.equals(right.end)
      );
    case "floating":
      return (
        right.kind === "floating" && left.start.equals(right.start) && left.end.equals(right.end)
      );
  }
}
