// RFC 7986 properties; the IMAGE and CONFERENCE lines are the RFC's own examples (the last
// CONFERENCE example without its stray ";" before the colon).

import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, icsExtension, parseIcs } from "../../src/index";
import { eventByUid, once, onlyCalendar, plain, propertyNamed, readFixture } from "./helpers";

const text = readFixture("rfc7986.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));

describe("rfc7986.ics", () => {
  test("parses without issues", () => {
    expect(result().issues).toEqual([]);
  });

  test("reads the RFC 7986 calendar properties, which win over the X-WR-* ones", () => {
    expect(calendar()).toMatchObject({
      color: "turquoise",
      description: "Days the office is closed, and nobody answers the phone.",
      name: "Company Vacation Days",
      source: "https://example.com/holidays.ics",
      uid: "5FC53010-1267-4F8E-BC28-1D7AE55A7C99",
      url: "https://example.com/calendars/vacation",
    });
    expect(calendar().refreshInterval?.toString()).toBe("P1W");
    expect(calendar().lastModified?.toString()).toBe("2026-01-02T03:04:05Z");
  });

  test("keeps IMAGE and CATEGORIES of the calendar in otherProperties", () => {
    expect(propertyNamed(calendar().otherProperties, "IMAGE")).toMatchObject({
      parameters: { DISPLAY: ["BADGE"], FMTTYPE: ["image/png"], VALUE: ["URI"] },
      // Folded between "h" and "ttp".
      value: "http://example.com/images/party.png",
    });
    expect(propertyNamed(calendar().otherProperties, "CATEGORIES")?.value).toBe("Holidays,Company");
  });

  test("reads an event's COLOR and keeps its IMAGE", () => {
    const winterBreak = eventByUid(calendar().events, "winter-break-2026@example.com");
    expect(winterBreak.color).toBe("darkred");
    expect(propertyNamed(winterBreak.otherProperties, "IMAGE")).toMatchObject({
      parameters: { DISPLAY: ["BADGE", "THUMBNAIL"], FMTTYPE: ["image/png"], VALUE: ["URI"] },
      value: "https://example.com/images/weather-cloudy.png",
    });
    expect(plain(getEventEnd(winterBreak))).toEqual({ date: "2026-12-27", kind: "date" });
  });

  describe("the all-hands call", () => {
    const call = once(() => eventByUid(calendar().events, "all-hands-2026-11@example.com"));

    test("ends DURATION after its UTC start", () => {
      expect(plain(call().start)).toEqual({ instant: "2026-11-05T16:00:00Z", kind: "utc" });
      expect(call().duration?.toString()).toBe("PT1H");
      expect(plain(getEventEnd(call()))).toEqual({ instant: "2026-11-05T17:00:00Z", kind: "utc" });
    });

    test("reads every CONFERENCE, with FEATURE lists and quoted LABELs", () => {
      expect(call().conferences).toEqual([
        {
          features: ["PHONE", "MODERATOR"],
          label: "Moderator dial-in",
          // A URI value: its commas don't separate values.
          uri: "tel:+1-412-555-0123,,,654321",
        },
        { features: ["PHONE"], label: "Attendee dial-in", uri: "tel:+1-412-555-0123,,,555123" },
        { features: ["PHONE"], label: "Attendee dial-in", uri: "tel:+1-888-555-0456,,,555123" },
        { features: ["CHAT"], label: "Chat room", uri: "xmpp:chat-123@conference.example.com" },
        {
          features: ["AUDIO", "VIDEO"],
          label: "Attendee dial-in",
          uri: "https://chat.example.com/audio?id=123456",
        },
        {
          features: ["VIDEO"],
          label: "Web video chat, access code=76543",
          uri: "https://video-chat.example.com/;group-id=1234",
        },
      ]);
    });

    test("prefers the EMAIL parameter over an opaque address", () => {
      expect(call().attendees).toMatchObject([
        {
          address: "mailto:opaque-token-1234@example.com",
          email: "pat@example.com",
          name: "Pat Example",
        },
      ]);
    });

    test("collects every occurrence and value of a multiple extension", () => {
      const parsed = parseIcs(text, {
        extensions: { event: { rooms: icsExtension("X-EXAMPLE-ROOM", { multiple: true }) } },
      });
      const events = onlyCalendar(parsed).events;
      expect(eventByUid(events, "all-hands-2026-11@example.com").extensions.rooms).toEqual([
        "Room 1",
        "Room 2",
        "Room 3, east wing",
      ]);
      expect(eventByUid(events, "winter-break-2026@example.com").extensions.rooms).toEqual([]);
      expect(
        propertyNamed(
          eventByUid(events, "all-hands-2026-11@example.com").otherProperties,
          "X-EXAMPLE-ROOM",
        ),
      ).toBeUndefined();
      expect(parsed.issues).toEqual([]);
    });
  });
});
