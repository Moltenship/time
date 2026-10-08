import type { CalendarEventInterval } from "../events";

export function intervalsEqual(left: CalendarEventInterval, right: CalendarEventInterval): boolean {
  switch (left.kind) {
    case "timed":
      return (
        right.kind === "timed" &&
        left.start.equals(right.start) &&
        left.end.equals(right.end) &&
        left.sourceTimeZone === right.sourceTimeZone
      );
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
