import { describe, expect, test } from "vite-plus/test";

import type { IcsDateValue } from "../../src/index";
import { getEventEnd } from "../../src/index";
import { parseEvent, plain } from "./helpers";

const date = (value: string): IcsDateValue => ({
  date: Temporal.PlainDate.from(value),
  kind: "date",
});
const utc = (value: string): IcsDateValue => ({
  instant: Temporal.Instant.from(value),
  kind: "utc",
});
const floating = (value: string): IcsDateValue => ({
  kind: "floating",
  wallTime: Temporal.PlainDateTime.from(value),
});
const unresolved = (value: string): IcsDateValue => ({
  kind: "unresolved",
  tzid: "Nowhere/Special",
  wallTime: Temporal.PlainDateTime.from(value),
});
const zoned = (value: string, timeZone = "Europe/Berlin", tzid = timeZone): IcsDateValue => {
  const wallTime = Temporal.PlainDateTime.from(value);
  return { kind: "zoned", tzid, wallTime, zoned: wallTime.toZonedDateTime(timeZone) };
};
const duration = (value: string) => Temporal.Duration.from(value);

describe("getEventEnd", () => {
  describe("without DTEND or DURATION", () => {
    test("a date lasts a day", () => {
      expect(plain(getEventEnd({ start: date("2026-02-28") }))).toEqual({
        date: "2026-03-01",
        kind: "date",
      });
    });

    test.each([
      ["utc", utc("2026-03-01T09:00:00Z")],
      ["zoned", zoned("2026-03-01T09:00:00")],
      ["floating", floating("2026-03-01T09:00:00")],
      ["unresolved", unresolved("2026-03-01T09:00:00")],
    ])("a %s date-time ends when it starts", (_, start) => {
      expect(getEventEnd({ start })).toBe(start);
    });
  });

  describe("adds DURATION", () => {
    test("to a date in whole days", () => {
      expect(
        plain(getEventEnd({ duration: duration("P1W2D"), start: date("2026-02-25") })),
      ).toEqual({
        date: "2026-03-06",
        kind: "date",
      });
    });

    test.each([
      ["PT24H", "2026-03-02"],
      ["PT1H", "2026-03-02"],
      ["PT25H", "2026-03-03"],
      ["P1DT1S", "2026-03-03"],
    ])("to a date, rounding a time part %s up to whole days", (value, end) => {
      expect(plain(getEventEnd({ duration: duration(value), start: date("2026-03-01") }))).toEqual({
        date: end,
        kind: "date",
      });
    });

    test("to a UTC time, days included", () => {
      expect(
        plain(getEventEnd({ duration: duration("P1DT2H"), start: utc("2026-03-01T23:00:00Z") })),
      ).toEqual({
        instant: "2026-03-03T01:00:00Z",
        kind: "utc",
      });
    });

    test("to a zoned time: nominal days, exact hours, across a DST change", () => {
      // Europe/Berlin springs forward on 2026-03-29 at 02:00 and falls back on 2026-10-25 at 03:00.
      const spring = zoned("2026-03-28T10:00:00");
      expect(plain(getEventEnd({ duration: duration("P1D"), start: spring }))).toEqual({
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime: "2026-03-29T10:00:00",
        zoned: "2026-03-29T10:00:00+02:00[Europe/Berlin]",
      });
      expect(plain(getEventEnd({ duration: duration("PT24H"), start: spring }))).toMatchObject({
        wallTime: "2026-03-29T11:00:00",
      });
      const autumn = zoned("2026-10-25T01:30:00");
      expect(plain(getEventEnd({ duration: duration("PT1H"), start: autumn }))).toMatchObject({
        wallTime: "2026-10-25T02:30:00",
        zoned: "2026-10-25T02:30:00+02:00[Europe/Berlin]",
      });
      expect(plain(getEventEnd({ duration: duration("PT2H"), start: autumn }))).toMatchObject({
        wallTime: "2026-10-25T02:30:00",
        zoned: "2026-10-25T02:30:00+01:00[Europe/Berlin]",
      });
    });

    test("to floating and unresolved times as wall times", () => {
      expect(
        plain(
          getEventEnd({ duration: duration("P1DT30M"), start: floating("2026-03-28T10:00:00") }),
        ),
      ).toEqual({
        kind: "floating",
        wallTime: "2026-03-29T10:30:00",
      });
      expect(
        plain(
          getEventEnd({ duration: duration("PT90M"), start: unresolved("2026-03-01T23:00:00") }),
        ),
      ).toEqual({
        kind: "unresolved",
        tzid: "Nowhere/Special",
        wallTime: "2026-03-02T00:30:00",
      });
    });
  });

  describe("returns DTEND in the start's kind", () => {
    test("as is when the kinds match, over DURATION", () => {
      const end = zoned("2026-03-01T10:00:00");
      expect(
        getEventEnd({ duration: duration("PT5H"), end, start: zoned("2026-03-01T09:00:00") }),
      ).toBe(end);
    });

    test("a date-time end of a date start becomes its date", () => {
      expect(
        plain(getEventEnd({ end: zoned("2026-03-03T00:00:00"), start: date("2026-03-01") })),
      ).toEqual({
        date: "2026-03-03",
        kind: "date",
      });
    });

    test("a date end of a date-time start becomes midnight in the start's time model", () => {
      expect(
        plain(getEventEnd({ end: date("2026-03-02"), start: utc("2026-03-01T09:00:00Z") })),
      ).toEqual({
        instant: "2026-03-02T00:00:00Z",
        kind: "utc",
      });
      expect(
        plain(getEventEnd({ end: date("2026-03-02"), start: zoned("2026-03-01T09:00:00") })),
      ).toEqual({
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime: "2026-03-02T00:00:00",
        zoned: "2026-03-02T00:00:00+01:00[Europe/Berlin]",
      });
      expect(
        plain(getEventEnd({ end: date("2026-03-02"), start: floating("2026-03-01T09:00:00") })),
      ).toEqual({
        kind: "floating",
        wallTime: "2026-03-02T00:00:00",
      });
    });

    test("an end in another zone is the same instant in the start's zone", () => {
      const end = getEventEnd({
        end: zoned("2026-03-01T12:00:00", "America/New_York"),
        start: zoned("2026-03-01T09:00:00", "Europe/Berlin", "W. Europe Standard Time"),
      });
      expect(plain(end)).toEqual({
        kind: "zoned",
        tzid: "W. Europe Standard Time",
        wallTime: "2026-03-01T18:00:00",
        zoned: "2026-03-01T18:00:00+01:00[Europe/Berlin]",
      });
    });

    test("a zoned end of a UTC start is its instant; a floating end of a zoned start is read there", () => {
      expect(
        plain(
          getEventEnd({ end: zoned("2026-03-01T12:00:00"), start: utc("2026-03-01T09:00:00Z") }),
        ),
      ).toEqual({
        instant: "2026-03-01T11:00:00Z",
        kind: "utc",
      });
      expect(
        plain(
          getEventEnd({
            end: floating("2026-03-01T12:00:00"),
            start: zoned("2026-03-01T09:00:00"),
          }),
        ),
      ).toMatchObject({
        wallTime: "2026-03-01T12:00:00",
        zoned: "2026-03-01T12:00:00+01:00[Europe/Berlin]",
      });
      expect(
        plain(
          getEventEnd({
            end: utc("2026-03-01T12:00:00Z"),
            start: unresolved("2026-03-01T09:00:00"),
          }),
        ),
      ).toEqual({
        kind: "unresolved",
        tzid: "Nowhere/Special",
        wallTime: "2026-03-01T12:00:00",
      });
    });
  });

  test("works on parsed events", () => {
    const { event } = parseEvent("DURATION:PT45M");
    expect(plain(getEventEnd(event))).toEqual({ instant: "2026-03-01T09:45:00Z", kind: "utc" });
  });
});
