/** `2026-10-12T09:30` as ICS writes it: `20261012T093000`. */
function icsDateTime(dateTime: Temporal.PlainDateTime): string {
  return dateTime.toString({ smallestUnit: "second" }).replaceAll(/[-:]/g, "");
}

function icsDate(date: Temporal.PlainDate): string {
  return date.toString().replaceAll("-", "");
}

function icsUtc(instant: Temporal.Instant): string {
  return `${icsDateTime(instant.toZonedDateTimeISO("UTC").toPlainDateTime())}Z`;
}

/** DTSTART and DTEND in a time zone, as `TZID=…` wall times. */
function inZone(tzid: string, timeZone: string, start: Temporal.Instant, end: Temporal.Instant) {
  const wallTime = (instant: Temporal.Instant) =>
    icsDateTime(instant.toZonedDateTimeISO(timeZone).toPlainDateTime());
  return [`DTSTART;TZID=${tzid}:${wallTime(start)}`, `DTEND;TZID=${tzid}:${wallTime(end)}`];
}

// Outlook names its zones the Windows way and defines each one in the file.
const outlookBerlin = [
  "BEGIN:VTIMEZONE",
  "TZID:W. Europe Standard Time",
  "BEGIN:STANDARD",
  "DTSTART:16010101T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010101T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

/**
 * A team feed for the visitor's week, with times written five ways: in New York (an IANA TZID), in
 * Outlook's `W. Europe Standard Time`, in UTC, as a date, and floating. The timed events sit around
 * the visitor's current hour, on today and a neighbouring day of the same week, so the time grid,
 * which opens on the current time, opens on them.
 */
export function createPreviewFeed(now: Temporal.ZonedDateTime): string {
  const current = now.round({ roundingMode: "floor", smallestUnit: "hour" });
  // Kept between 02:00 and 19:00, so no event crosses midnight into another day or week.
  const hour = current.with({ hour: Math.min(Math.max(current.hour, 2), 19) });
  const today = now.toPlainDate();
  // Tomorrow and the day after, stepping back instead at the end of the week.
  const next = today.dayOfWeek < 7 ? 1 : -1;
  const later = today.dayOfWeek < 6 ? 2 : -2;
  // Added one after the other: a Temporal duration can't mix signs.
  const at = (days: number, minutes: number) => hour.add({ days }).add({ minutes }).toInstant();
  const stamp = icsUtc(now.toInstant().round({ roundingMode: "floor", smallestUnit: "second" }));

  const event = (uid: string, summary: string, ...lines: string[]) => [
    "BEGIN:VEVENT",
    `UID:${uid}@team.example.com`,
    `DTSTAMP:${stamp}`,
    ...lines,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ];

  const floatingStart = hour.toPlainDateTime().add({ days: next }).add({ hours: 2 });
  const offsite = today.add({ days: later });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//Time docs//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Team",
    ...outlookBerlin,
    ...event(
      "standup",
      "Standup (New York)",
      ...inZone("America/New_York", "America/New_York", at(0, -60), at(0, -30)),
    ),
    ...event(
      "deploy",
      "Deploy window (UTC)",
      `DTSTART:${icsUtc(at(0, 60))}`,
      `DTEND:${icsUtc(at(0, 150))}`,
    ),
    ...event(
      "design-review",
      "Design review (Outlook: W. Europe)",
      ...inZone("W. Europe Standard Time", "Europe/Berlin", at(next, 0), at(next, 60)),
    ),
    ...event(
      "focus",
      "Focus time (floating)",
      `DTSTART:${icsDateTime(floatingStart)}`,
      `DTEND:${icsDateTime(floatingStart.add({ hours: 2 }))}`,
    ),
    ...event(
      "offsite",
      "Team offsite (all day)",
      `DTSTART;VALUE=DATE:${icsDate(offsite)}`,
      `DTEND;VALUE=DATE:${icsDate(offsite.add({ days: 1 }))}`,
      "TRANSP:TRANSPARENT",
    ),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

let today: { readonly date: string; readonly feed: string } | undefined;

/** Today's feed, built from the visitor's clock and shared by the calendar and the source. */
export function currentPreviewFeed(): string {
  const now = Temporal.Now.zonedDateTimeISO();
  const date = now.toPlainDate().toString();
  if (today?.date !== date) today = { date, feed: createPreviewFeed(now) };
  return today.feed;
}
