import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, icsExtension, parseIcs } from "../../src/index";
import {
  enumSchema,
  errorsOf,
  eventByUid,
  instantOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  propertyNames,
  readFixture,
  rsvpOf,
  withoutRsvp,
} from "./helpers";

const text = readFixture("icloud.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));

const uid = {
  dinner: "6B1F3E2A-4C5D-4E6F-8A9B-0C1D2E3F4A5B",
  run: "1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F",
  stretching: "2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F6A",
  vacation: "3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6A7B",
};

describe("icloud.ics", () => {
  test("parses without errors", () => {
    expect(errorsOf(result().issues)).toEqual([]);
  });

  test("reads the calendar; X-APPLE-CALENDAR-COLOR is not COLOR", () => {
    expect(calendar()).toMatchObject({
      calendarScale: "GREGORIAN",
      name: "Home",
      productId: "-//Apple Inc.//macOS 15.3//EN",
      timeZone: "America/New_York",
    });
    // COLOR (RFC 7986) has no X- fallback in the contract.
    expect(calendar().color).toBeUndefined();
    expect(propertyNamed(calendar().otherProperties, "X-APPLE-CALENDAR-COLOR")?.value).toBe(
      "#1BADF8",
    );
    expect(calendar().events).toHaveLength(4);
    expect(calendar().timeZones.map((zone) => zone.timeZone)).toEqual(["America/New_York"]);
  });

  describe("the dinner", () => {
    const dinner = once(() => eventByUid(calendar().events, uid.dinner));

    test("starts in America/New_York", () => {
      expect(plain(dinner().start)).toEqual({
        kind: "zoned",
        tzid: "America/New_York",
        wallTime: "2026-02-14T19:00:00",
        zoned: "2026-02-14T19:00:00-05:00[America/New_York]",
      });
      expect(instantOf(dinner().start)).toBe("2026-02-15T00:00:00Z");
      expect(instantOf(dinner().end)).toBe("2026-02-15T02:00:00Z");
    });

    test("reads the multi-line LOCATION", () => {
      expect(dinner().location).toBe(
        "Example Bistro\n123 Main St\nSpringfield IL 62701\nUnited States",
      );
      expect(dinner().summary).toBe("Dinner");
      expect(dinner().sequence).toBe(1);
    });

    test("takes e-mail addresses from the EMAIL parameter of urn:uuid addresses", () => {
      expect(dinner().organizer).toEqual({
        address: "urn:uuid:9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
        email: "hana@example.com",
        name: "Hana Example",
        otherParameters: {},
      });
      expect(withoutRsvp(dinner().attendees)).toEqual([
        {
          address: "urn:uuid:9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
          calendarUserType: "INDIVIDUAL",
          delegatedFrom: [],
          delegatedTo: [],
          email: "hana@example.com",
          memberOf: [],
          name: "Hana Example",
          otherParameters: {},
          participationStatus: "ACCEPTED",
          role: "CHAIR",
        },
        {
          address: "mailto:omar@example.com",
          calendarUserType: "INDIVIDUAL",
          delegatedFrom: [],
          delegatedTo: [],
          email: "omar@example.com",
          memberOf: [],
          name: "Omar Example",
          otherParameters: { "SCHEDULE-STATUS": ["1.2"] },
          participationStatus: "NEEDS-ACTION",
          role: "REQ-PARTICIPANT",
        },
      ]);
      expect(rsvpOf(dinner().attendees)).toEqual([false, true]);
    });

    test("keeps X-APPLE-STRUCTURED-LOCATION with its parameters as written", () => {
      expect(propertyNames(dinner().otherProperties)).toEqual([
        "X-APPLE-STRUCTURED-LOCATION",
        "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR",
      ]);
      const location = propertyNamed(dinner().otherProperties, "X-APPLE-STRUCTURED-LOCATION");
      expect(location?.parameters).toEqual({
        // Quoted, so its commas don't split it; parameter values aren't TEXT-unescaped.
        "X-ADDRESS": ["123 Main St\\\\nSpringfield, IL 62701\\\\nUnited States"],
        "X-APPLE-MAPKIT-HANDLE": ["CAESBg=="],
        "X-APPLE-RADIUS": ["70.58"],
        "X-APPLE-REFERENCEFRAME": ["1"],
        "X-TITLE": ["Example Bistro"],
        VALUE: ["URI"],
      });
      expect(location?.value).toBe("geo:39.781721,-89.650148");
      expect(
        propertyNamed(dinner().otherProperties, "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR")?.value,
      ).toBe("AUTOMATIC");
    });

    test("reads both alarms, keeping X-WR-ALARMUID and ACKNOWLEDGED", () => {
      const [reminder, none] = dinner().alarms;
      expect(dinner().alarms).toHaveLength(2);
      expect(plain(reminder)).toMatchObject({
        action: "DISPLAY",
        description: "Reminder",
        trigger: { kind: "relative", offset: "-PT30M", relatedTo: "START" },
        uid: "8E1A6C3B-2D4F-4A5B-9C8D-7E6F5A4B3C2D",
      });
      expect(reminder?.otherProperties.map(({ name, value }) => ({ name, value }))).toEqual([
        { name: "ACKNOWLEDGED", value: "20260214T183000Z" },
        { name: "X-WR-ALARMUID", value: "8E1A6C3B-2D4F-4A5B-9C8D-7E6F5A4B3C2D" },
      ]);
      // Apple's placeholder alarm: ACTION:NONE with an absolute trigger in 1976.
      expect(plain(none)).toMatchObject({
        action: "NONE",
        trigger: { instant: "1976-04-01T00:55:45Z", kind: "absolute" },
        uid: "0D9C8B7A-6F5E-4D3C-2B1A-0F9E8D7C6B5A",
      });
      expect(propertyNames(none?.otherProperties ?? [])).toEqual([
        "X-APPLE-DEFAULT-ALARM",
        "X-WR-ALARMUID",
      ]);
    });
  });

  test("reads floating events", () => {
    const run = eventByUid(calendar().events, uid.run);
    expect(plain(run.start)).toEqual({ kind: "floating", wallTime: "2026-03-01T09:00:00" });
    expect(plain(run.end)).toEqual({ kind: "floating", wallTime: "2026-03-01T10:00:00" });
    expect(plain(getEventEnd(run))).toEqual({ kind: "floating", wallTime: "2026-03-01T10:00:00" });

    const stretching = eventByUid(calendar().events, uid.stretching);
    expect(plain(stretching.start)).toEqual({ kind: "floating", wallTime: "2026-03-02T07:00:00" });
    expect(plain(stretching.recurrenceRule)).toEqual({
      count: 10,
      frequency: "DAILY",
      interval: 2,
    });
  });

  test("reads the all-day vacation", () => {
    const vacation = eventByUid(calendar().events, uid.vacation);
    expect(plain(vacation.start)).toEqual({ date: "2026-07-01", kind: "date" });
    expect(plain(vacation.end)).toEqual({ date: "2026-07-11", kind: "date" });
  });

  test("calendar and event extensions read the Apple properties", () => {
    const parsed = parseIcs(text, {
      extensions: {
        calendar: { appleColor: icsExtension("X-APPLE-CALENDAR-COLOR") },
        event: {
          structuredLocation: icsExtension("X-APPLE-STRUCTURED-LOCATION", { type: "URI" }),
          travelAdvisory: icsExtension("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR", {
            schema: enumSchema(["AUTOMATIC", "DISABLED"]),
          }),
        },
      },
    });
    const extended = onlyCalendar(parsed);
    expect(extended.extensions.appleColor).toBe("#1BADF8");
    expect(propertyNamed(extended.otherProperties, "X-APPLE-CALENDAR-COLOR")).toBeUndefined();

    const dinner = eventByUid(extended.events, uid.dinner);
    // A URI value is not a list: the comma in the geo: URI stays.
    expect(dinner.extensions.structuredLocation).toBe("geo:39.781721,-89.650148");
    expect(dinner.extensions.travelAdvisory).toBe("AUTOMATIC");
    expect(dinner.otherProperties).toEqual([]);

    const vacation = eventByUid(extended.events, uid.vacation);
    expect(vacation.extensions.structuredLocation).toBeUndefined();
    expect(vacation.extensions.travelAdvisory).toBe("DISABLED");
    expect(errorsOf(parsed.issues)).toEqual([]);
  });
});
