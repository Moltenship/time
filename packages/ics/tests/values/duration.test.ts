import { describe, expect, test } from "vite-plus/test";

import { decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, lenient, rejected } from "./helpers";

function duration(raw: string): string {
  return decoded(decodeIcsValue("DURATION", raw)).toString();
}

describe("DURATION", () => {
  test("reads RFC 5545 §3.3.6's examples, keeping the units as written", () => {
    const value = decoded(decodeIcsValue("DURATION", "P15DT5H0M20S"));
    expect([value.days, value.hours, value.minutes, value.seconds]).toEqual([15, 5, 0, 20]);
    expect(duration("P7W")).toBe("P7W");
  });

  test("keeps a day a day and 24 hours 24 hours, which differ across DST", () => {
    expect(duration("P1D")).toBe("P1D");
    expect(duration("PT24H")).toBe("PT24H");
    expect(duration("PT90M")).toBe("PT90M");
  });

  test("reads signs and every unit combination RFC 5545 allows", () => {
    expect(duration("-PT15M")).toBe("-PT15M");
    expect(duration("+P1D")).toBe("P1D");
    expect(duration("-P2W")).toBe("-P2W");
    expect(duration("P1DT12H")).toBe("P1DT12H");
    expect(duration("PT1H30M")).toBe("PT1H30M");
    expect(duration("PT45S")).toBe("PT45S");
    expect(duration("PT0S")).toBe("PT0S");
  });

  test("accepts weeks with other units, which is common, with a warning", () => {
    expect(lenient(decodeIcsValue("DURATION", "P1W2D"), /weeks/).toString()).toBe("P1W2D");
    expect(lenient(decodeIcsValue("DURATION", "P1WT2H"), /weeks/).toString()).toBe("P1WT2H");
  });

  test("accepts hours and seconds without minutes, and lowercase, with warnings", () => {
    expect(lenient(decodeIcsValue("DURATION", "PT1H30S"), /minutes/).toString()).toBe("PT1H30S");
    expect(lenient(decodeIcsValue("DURATION", "-pt15m"), /lowercase/).toString()).toBe("-PT15M");
  });

  test("rejects other shapes", () => {
    for (const raw of [
      "",
      "P",
      "PT",
      "P1DT",
      "1D",
      "P1Y",
      "P1M",
      "PT1.5S",
      "PT1M1H",
      "P1D1W",
      "P-1D",
      "P1D ",
      "--P1D",
      "P99999999999999999999W",
    ]) {
      rejected(decodeIcsValue("DURATION", raw));
    }
  });

  test("writes RFC 5545 durations, filling skipped middle units", () => {
    const cases: [Temporal.DurationLike, string][] = [
      [{ days: 15, hours: 5, seconds: 20 }, "P15DT5H0M20S"],
      [{ weeks: 7 }, "P7W"],
      [{ hours: 24 }, "PT24H"],
      [{ days: 1 }, "P1D"],
      [{ minutes: 30, seconds: 0 }, "PT30M"],
      [{ minutes: -15 }, "-PT15M"],
      [{ days: -1, hours: -2 }, "-P1DT2H"],
      [{ weeks: 1, days: 2 }, "P1W2D"],
      [{ seconds: 0 }, "PT0S"],
      [{ seconds: 1, milliseconds: 500 }, "PT1S"],
    ];
    for (const [like, raw] of cases) {
      expect(encodeIcsValue("DURATION", Temporal.Duration.from(like))).toBe(raw);
    }
  });

  test("refuses to write years and months, which iCalendar has no unit for", () => {
    expect(() => encodeIcsValue("DURATION", Temporal.Duration.from({ months: 1 }))).toThrow(
      RangeError,
    );
    expect(() => encodeIcsValue("DURATION", Temporal.Duration.from({ years: -1 }))).toThrow(
      RangeError,
    );
  });
});
