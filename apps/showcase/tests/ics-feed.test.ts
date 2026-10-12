import { parseIcs } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import { createPreviewFeed } from "../components/ics-feed-preview/feed";
import { fromFeedJson } from "../content/examples/feed-calendar";
import { feedTimeZone, toFeedEvent, toFeedEvents } from "../content/examples/feed-events";

function calendarOf(lines: readonly string[], header: readonly string[] = []) {
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//Tests//EN",
    ...header,
    "BEGIN:VEVENT",
    "UID:event-1",
    "DTSTAMP:20261012T080000Z",
    "SUMMARY:Planning",
    ...lines,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const { calendars } = parseIcs(text);
  const calendar = calendars[0];
  if (calendar === undefined) throw new Error("No calendar");
  return calendar;
}

function eventOf(lines: readonly string[], timeZone = "Asia/Tokyo") {
  const event = calendarOf(lines).events[0];
  if (event === undefined) throw new Error("No event");
  return toFeedEvent(event, timeZone);
}

describe("toFeedEvent", () => {
  test("a UTC time is its instant", () => {
    expect(eventOf(["DTSTART:20261012T090000Z", "DTEND:20261012T100000Z"])).toEqual({
      id: "event-1",
      title: "Planning",
      color: "blue",
      kind: "timed",
      start: "2026-10-12T09:00:00Z",
      end: "2026-10-12T10:00:00Z",
    });
  });

  test("a zoned time is its instant, whatever the chosen time zone", () => {
    const event = eventOf([
      "DTSTART;TZID=America/New_York:20261012T090000",
      "DTEND;TZID=America/New_York:20261012T093000",
    ]);
    expect(event).toMatchObject({
      kind: "timed",
      start: "2026-10-12T13:00:00Z",
      end: "2026-10-12T13:30:00Z",
    });
  });

  test("an Outlook (Windows) TZID resolves to its IANA zone", () => {
    const event = eventOf([
      "DTSTART;TZID=W. Europe Standard Time:20261012T090000",
      "DTEND;TZID=W. Europe Standard Time:20261012T100000",
    ]);
    expect(event).toMatchObject({ start: "2026-10-12T07:00:00Z", end: "2026-10-12T08:00:00Z" });
  });

  test("a date is an all-day event with an exclusive end", () => {
    const event = eventOf(["DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261014"]);
    expect(event).toMatchObject({ kind: "all-day", start: "2026-10-12", end: "2026-10-14" });
    expect(eventOf(["DTSTART;VALUE=DATE:20261012"])).toMatchObject({ end: "2026-10-13" });
  });

  test("a floating time is its wall time in the chosen time zone", () => {
    const event = eventOf(["DTSTART:20261012T090000", "DTEND:20261012T100000"], "Asia/Tokyo");
    expect(event).toMatchObject({
      kind: "timed",
      start: "2026-10-12T00:00:00Z",
      end: "2026-10-12T01:00:00Z",
    });
  });

  test("a DTEND in UTC keeps its instant after a floating start", () => {
    const event = eventOf(["DTSTART:20261012T090000", "DTEND:20261012T100000Z"], "Asia/Tokyo");
    expect(event).toMatchObject({
      start: "2026-10-12T00:00:00Z",
      end: "2026-10-12T10:00:00Z",
    });
  });

  test("an unresolved TZID is its wall time in the chosen time zone", () => {
    const event = eventOf(
      ["DTSTART;TZID=Our Office:20261012T090000", "DTEND;TZID=Our Office:20261012T100000"],
      "Europe/Lisbon",
    );
    expect(event).toMatchObject({ start: "2026-10-12T08:00:00Z", end: "2026-10-12T09:00:00Z" });
  });

  test("the end comes from DURATION when there's no DTEND", () => {
    const event = eventOf(["DTSTART:20261012T090000Z", "DURATION:PT45M"]);
    expect(event).toMatchObject({ end: "2026-10-12T09:45:00Z" });
  });

  test("events that take no time, or end before they start, get the minimum length", () => {
    expect(eventOf(["DTSTART:20261012T090000Z"])).toMatchObject({
      start: "2026-10-12T09:00:00Z",
      end: "2026-10-12T09:30:00Z",
    });
    expect(eventOf(["DTSTART:20261012T090000Z", "DTEND:20261012T080000Z"])).toMatchObject({
      end: "2026-10-12T09:30:00Z",
    });
    expect(eventOf(["DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261012"])).toMatchObject({
      end: "2026-10-13",
    });
  });

  test("skips cancelled events", () => {
    expect(eventOf(["DTSTART:20261012T090000Z", "STATUS:CANCELLED"])).toBeUndefined();
  });

  test("free and tentative events are gray", () => {
    expect(eventOf(["DTSTART:20261012T090000Z", "TRANSP:TRANSPARENT"])?.color).toBe("gray");
    expect(eventOf(["DTSTART:20261012T090000Z", "STATUS:TENTATIVE"])?.color).toBe("gray");
  });

  test("an override keeps an ID of its own", () => {
    const event = eventOf([
      "RECURRENCE-ID:20261012T090000Z",
      "DTSTART:20261012T110000Z",
      "DTEND:20261012T120000Z",
    ]);
    expect(event?.id).toBe("event-1/2026-10-12T11:00:00Z");
  });

  test("round-trips to Temporal values on the client", () => {
    const timed = fromFeedJson(eventOf(["DTSTART:20261012T090000Z"])!);
    expect(
      timed.kind === "timed" && timed.start.equals(Temporal.Instant.from("2026-10-12T09:00Z")),
    ).toBe(true);
    const allDay = fromFeedJson(eventOf(["DTSTART;VALUE=DATE:20261012"])!);
    expect(
      allDay.kind === "all-day" && allDay.end.equals(Temporal.PlainDate.from("2026-10-13")),
    ).toBe(true);
  });
});

describe("feedTimeZone", () => {
  const floating = ["DTSTART:20261012T090000", "DTEND:20261012T100000"];

  test("prefers the feed's X-WR-TIMEZONE", () => {
    const calendar = calendarOf(floating, ["X-WR-TIMEZONE:America/New_York"]);
    expect(feedTimeZone(calendar, "Asia/Tokyo")).toBe("America/New_York");
    expect(toFeedEvents(calendar, "Asia/Tokyo")[0]).toMatchObject({
      start: "2026-10-12T13:00:00Z",
    });
  });

  test("falls back to the viewer's time zone", () => {
    const calendar = calendarOf(floating);
    expect(feedTimeZone(calendar, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(toFeedEvents(calendar, "Asia/Tokyo")[0]).toMatchObject({
      start: "2026-10-12T00:00:00Z",
    });
  });
});

describe("the preview's feed", () => {
  const now = Temporal.ZonedDateTime.from("2026-10-14T15:20[Asia/Tokyo]");

  test("parses without issues", () => {
    const { calendars, issues } = parseIcs(createPreviewFeed(now));
    expect(issues).toEqual([]);
    expect(calendars[0]?.events.map((event) => event.start.kind)).toEqual([
      "zoned",
      "utc",
      "zoned",
      "floating",
      "date",
    ]);
  });

  test("lands each event around the visitor's current hour", () => {
    const { calendars } = parseIcs(createPreviewFeed(now));
    const local = toFeedEvents(calendars[0]!, now.timeZoneId).map((event) =>
      event.kind === "timed"
        ? `${event.title} ${Temporal.Instant.from(event.start).toZonedDateTimeISO(now.timeZoneId).toPlainDateTime().toString()}`
        : `${event.title} ${event.start}`,
    );
    expect(local).toEqual([
      "Standup (New York) 2026-10-14T14:00:00",
      "Deploy window (UTC) 2026-10-14T16:00:00",
      "Design review (Outlook: W. Europe) 2026-10-15T15:00:00",
      "Focus time (floating) 2026-10-15T17:00:00",
      "Team offsite (all day) 2026-10-16",
    ]);
  });

  test.each([
    ["on a Sunday morning", "2026-10-18T09:00[America/Los_Angeles]"],
    ["just after midnight on Monday", "2026-10-12T00:30[Europe/Berlin]"],
    ["late on Sunday", "2026-10-18T23:00[Asia/Tokyo]"],
  ])("keeps every event in the visitor's week, %s", (_, at) => {
    const now = Temporal.ZonedDateTime.from(at);
    const { calendars, issues } = parseIcs(createPreviewFeed(now));
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const local = (instant: string) =>
      Temporal.Instant.from(instant).toZonedDateTimeISO(now.timeZoneId).toPlainDate().toString();
    for (const event of toFeedEvents(calendars[0]!, now.timeZoneId)) {
      const [first, last] =
        event.kind === "timed"
          ? [
              local(event.start),
              local(Temporal.Instant.from(event.end).subtract({ nanoseconds: 1 }).toString()),
            ]
          : [event.start, Temporal.PlainDate.from(event.end).subtract({ days: 1 }).toString()];
      expect(first >= "2026-10-12" && last <= "2026-10-18").toBe(true);
      expect(first).toBe(last);
    }
  });
});
