// getEventEnd: DTEND, else DTSTART + DURATION, else RFC 5545 §3.6.1's default (the next day for a
// DATE start, the start itself for a DATE-TIME start). Always the same kind as the start.

import { describe, expect, test } from "vite-plus/test";

import type {
  IcsDate,
  IcsFloatingDateTime,
  IcsUnresolvedDateTime,
  IcsUtcDateTime,
  IcsZonedDateTime,
} from "../../src/index";
import { getEventEnd } from "../../src/index";
import { describeDate, plain } from "./helpers";

const date = (value: string): IcsDate => ({ date: Temporal.PlainDate.from(value), kind: "date" });
const utc = (value: string): IcsUtcDateTime => ({
  instant: Temporal.Instant.from(value),
  kind: "utc",
});
const floating = (value: string): IcsFloatingDateTime => ({
  kind: "floating",
  wallTime: Temporal.PlainDateTime.from(value),
});
const unresolved = (value: string, tzid: string): IcsUnresolvedDateTime => ({
  kind: "unresolved",
  tzid,
  wallTime: Temporal.PlainDateTime.from(value),
});
const zoned = (value: string, timeZone: string, tzid = timeZone): IcsZonedDateTime => {
  const wallTime = Temporal.PlainDateTime.from(value);
  return { kind: "zoned", tzid, wallTime, zoned: wallTime.toZonedDateTime(timeZone) };
};
const duration = (value: string) => Temporal.Duration.from(value);

describe("getEventEnd", () => {
  test("returns DTEND when it is there", () => {
    const end = utc("2026-03-01T10:00:00Z");
    expect(plain(getEventEnd({ end, start: utc("2026-03-01T09:00:00Z") }))).toEqual(plain(end));
    expect(plain(getEventEnd({ end: date("2026-03-04"), start: date("2026-03-01") }))).toEqual({
      date: "2026-03-04",
      kind: "date",
    });
  });

  test("prefers DTEND over DURATION", () => {
    const end = getEventEnd({
      duration: duration("PT2H"),
      end: utc("2026-03-01T10:00:00Z"),
      start: utc("2026-03-01T09:00:00Z"),
    });
    expect(describeDate(end)).toBe("utc 2026-03-01T10:00:00Z");
  });

  describe("adds DURATION to the start", () => {
    test("for a date", () => {
      expect(plain(getEventEnd({ duration: duration("P3D"), start: date("2026-02-27") }))).toEqual({
        date: "2026-03-02",
        kind: "date",
      });
      expect(plain(getEventEnd({ duration: duration("P1W"), start: date("2026-12-28") }))).toEqual({
        date: "2027-01-04",
        kind: "date",
      });
    });

    test("for a UTC date-time", () => {
      expect(
        describeDate(
          getEventEnd({ duration: duration("PT90M"), start: utc("2026-03-01T23:00:00Z") }),
        ),
      ).toBe("utc 2026-03-02T00:30:00Z");
    });

    test("for a floating date-time", () => {
      expect(
        plain(getEventEnd({ duration: duration("PT45M"), start: floating("2026-03-01T09:30:00") })),
      ).toEqual({ kind: "floating", wallTime: "2026-03-01T10:15:00" });
    });

    test("for an unresolved date-time, keeping its TZID", () => {
      expect(
        plain(
          getEventEnd({
            duration: duration("PT1H"),
            start: unresolved("2026-03-01T09:00:00", "Mars/Olympus_Mons"),
          }),
        ),
      ).toEqual({ kind: "unresolved", tzid: "Mars/Olympus_Mons", wallTime: "2026-03-01T10:00:00" });
    });

    test("for a zoned date-time: days are nominal, hours exact (RFC 5545 §3.3.6)", () => {
      // Europe/Berlin springs forward on 2026-03-29 at 02:00.
      const start = zoned("2026-03-28T10:00:00", "Europe/Berlin");
      const oneDay = getEventEnd({ duration: duration("P1D"), start });
      expect(describeDate(oneDay)).toBe(
        "zoned 2026-03-29T10:00:00+02:00[Europe/Berlin] tzid=Europe/Berlin",
      );
      const twentyFourHours = getEventEnd({ duration: duration("PT24H"), start });
      expect(describeDate(twentyFourHours)).toBe(
        "zoned 2026-03-29T11:00:00+02:00[Europe/Berlin] tzid=Europe/Berlin",
      );
    });

    test("for a zoned date-time, keeping the TZID as written", () => {
      const start = zoned("2026-03-10T09:00:00", "America/Los_Angeles", "Pacific Standard Time");
      const end = getEventEnd({ duration: duration("PT15M"), start });
      expect(end.kind).toBe("zoned");
      if (end.kind !== "zoned") return;
      expect(end.tzid).toBe("Pacific Standard Time");
      expect(end.zoned.timeZoneId).toBe("America/Los_Angeles");
      expect(end.zoned.toInstant().toString()).toBe("2026-03-10T16:15:00Z");
    });
  });

  describe("without DTEND or DURATION", () => {
    test("a date lasts one day", () => {
      expect(plain(getEventEnd({ start: date("2026-02-28") }))).toEqual({
        date: "2026-03-01",
        kind: "date",
      });
      expect(plain(getEventEnd({ start: date("2026-12-31") }))).toEqual({
        date: "2027-01-01",
        kind: "date",
      });
    });

    test.each([
      ["utc", utc("2026-03-01T09:00:00Z")],
      ["zoned", zoned("2026-03-01T09:00:00", "Europe/Berlin")],
      ["floating", floating("2026-03-01T09:00:00")],
      ["unresolved", unresolved("2026-03-01T09:00:00", "Mars/Olympus_Mons")],
    ] as const)("a %s date-time ends when it starts", (_kind, start) => {
      expect(describeDate(getEventEnd({ start }))).toBe(describeDate(start));
    });
  });

  test("returns the start's kind when DTEND is UTC and DTSTART is zoned", () => {
    // "Always the same kind as the start": the UTC end is expressed in the start's zone.
    const end = getEventEnd({
      end: utc("2026-03-01T09:30:00Z"),
      start: zoned("2026-03-01T10:00:00", "Europe/Berlin"),
    });
    expect(end.kind).toBe("zoned");
    if (end.kind !== "zoned") return;
    expect(end.zoned.timeZoneId).toBe("Europe/Berlin");
    expect(end.zoned.toInstant().toString()).toBe("2026-03-01T09:30:00Z");
  });
});
