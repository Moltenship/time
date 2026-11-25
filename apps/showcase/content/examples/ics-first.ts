// #region first
import { getEventEnd, parseIcs, type IcsDateValue } from "@moltenship/ics";

export const text = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example//Team//EN
BEGIN:VEVENT
UID:planning@example.com
DTSTAMP:20261001T080000Z
DTSTART;TZID=Europe/Berlin:20261012T090000
DURATION:PT45M
SUMMARY:Planning
END:VEVENT
BEGIN:VEVENT
UID:offsite@example.com
DTSTAMP:20261001T080000Z
DTSTART;VALUE=DATE:20261015
DTEND;VALUE=DATE:20261017
SUMMARY:Offsite
END:VEVENT
END:VCALENDAR`;

// A date or a time, as the file wrote it.
function show(value: IcsDateValue): string {
  switch (value.kind) {
    case "date":
      return value.date.toString();
    case "utc":
      return value.instant.toString();
    case "zoned":
      return value.zoned.toString();
    case "floating":
    case "unresolved":
      return value.wallTime.toString();
  }
}

export function describeEvents(ics: string): string[] {
  const { calendars } = parseIcs(ics);
  const events = calendars[0]?.events ?? [];
  // getEventEnd reads DTEND, or adds DURATION to the start.
  return events.map(
    (event) => `${event.summary}: ${show(event.start)} to ${show(getEventEnd(event))}`,
  );
}
// #endregion first
