// #region validation
import { isEventId, validateCalendarEvent } from "@moltenship/calendar-solid";

console.log(isEventId("meeting-1")); // true

const result = validateCalendarEvent({
  id: "meeting-1",
  title: "Standup",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T07:15:00Z"),
  end: Temporal.Instant.from("2026-10-08T07:00:00Z"),
  data: null,
});

console.log(result.valid); // false
if (!result.valid) console.log(result.issues); // [{ code: "start-not-before-end", kind: "timed" }]
// #endregion validation
