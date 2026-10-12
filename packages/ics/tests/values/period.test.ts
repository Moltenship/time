import { describe, expect, test } from "vite-plus/test";

import { decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, lenient, plain, rejected, warningsOf } from "./helpers";

describe("PERIOD", () => {
  test("reads RFC 5545 §3.3.9's explicit form", () => {
    expect(plain(decoded(decodeIcsValue("PERIOD", "19970101T180000Z/19970102T070000Z")))).toEqual({
      end: { instant: "Temporal.Instant 1997-01-02T07:00:00Z", kind: "utc" },
      start: { instant: "Temporal.Instant 1997-01-01T18:00:00Z", kind: "utc" },
    });
  });

  test("reads RFC 5545 §3.3.9's start-and-duration form", () => {
    expect(plain(decoded(decodeIcsValue("PERIOD", "19970101T180000Z/PT5H30M")))).toEqual({
      duration: "Temporal.Duration PT5H30M",
      start: { instant: "Temporal.Instant 1997-01-01T18:00:00Z", kind: "utc" },
    });
  });

  test("decodes both ends in the property's context", () => {
    const value = decoded(
      decodeIcsValue("PERIOD", "20260105T090000/20260105T100000", { tzid: "Europe/Paris" }),
    );
    expect("end" in value && [value.start.kind, value.end.kind]).toEqual(["zoned", "zoned"]);
  });

  test("passes the ends' warnings on", () => {
    expect(warningsOf(decodeIcsValue("PERIOD", "20260105T0900Z/20260105t100000Z"))).toEqual([
      expect.stringMatching(/^PERIOD start: .*seconds/),
      expect.stringMatching(/^PERIOD end: .*lowercase/),
    ]);
    lenient(decodeIcsValue("PERIOD", "20260105T090000Z/P1W1D"), /duration.*weeks/);
  });

  test("accepts a negative duration, with a warning", () => {
    expect(
      plain(lenient(decodeIcsValue("PERIOD", "20260105T090000Z/-PT1H"), /negative/)),
    ).toMatchObject({ duration: "Temporal.Duration -PT1H" });
  });

  test("rejects a period without a slash, or with a bad end", () => {
    for (const raw of [
      "19970101T180000Z",
      "19970101/19970102",
      "19970101T180000Z/",
      "19970101T180000Z/PT",
      "19970101T180000Z/tomorrow",
      "/19970102T070000Z",
    ]) {
      rejected(decodeIcsValue("PERIOD", raw));
    }
  });

  test("writes both forms", () => {
    const start = { instant: Temporal.Instant.from("1997-01-01T18:00:00Z"), kind: "utc" } as const;
    expect(
      encodeIcsValue("PERIOD", {
        end: { kind: "floating", wallTime: Temporal.PlainDateTime.from("1997-01-02T07:00") },
        start,
      }),
    ).toBe("19970101T180000Z/19970102T070000");
    expect(encodeIcsValue("PERIOD", { duration: Temporal.Duration.from("PT5H30M"), start })).toBe(
      "19970101T180000Z/PT5H30M",
    );
  });
});
