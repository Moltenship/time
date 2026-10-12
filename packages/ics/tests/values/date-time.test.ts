import { describe, expect, test } from "vite-plus/test";

import type { IcsDateTime } from "../../src/types";
import { decodeIcsDateValue, decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, lenient, plain, rejected, warningsOf } from "./helpers";

const NEW_YORK = { tzid: "America/New_York" };

function zoned(result: ReturnType<typeof decodeIcsValue<"DATE-TIME">>) {
  const value = decoded(result);
  if (value.kind !== "zoned") {
    throw new Error(`expected a zoned DATE-TIME, got ${value.kind}`);
  }
  return value;
}

describe("DATE", () => {
  test("reads RFC 5545 §3.3.4's example", () => {
    const value = decoded(decodeIcsValue("DATE", "19970714"));
    expect(value.kind).toBe("date");
    expect(value.date.equals(Temporal.PlainDate.from("1997-07-14"))).toBe(true);
  });

  test("rejects impossible dates and other shapes", () => {
    for (const raw of [
      "20260230",
      "20261301",
      "20260001",
      "2026011",
      "1997-07-14",
      "",
      "19970714T000000",
    ]) {
      rejected(decodeIcsValue("DATE", raw));
    }
  });

  test("writes four-digit years", () => {
    expect(
      encodeIcsValue("DATE", { date: Temporal.PlainDate.from("0001-02-03"), kind: "date" }),
    ).toBe("00010203");
    expect(() =>
      encodeIcsValue("DATE", { date: Temporal.PlainDate.from("+010000-01-01"), kind: "date" }),
    ).toThrow(RangeError);
  });
});

describe("DATE-TIME", () => {
  test("reads RFC 5545 §3.3.5's three forms", () => {
    expect(plain(decoded(decodeIcsValue("DATE-TIME", "19980118T230000")))).toEqual({
      kind: "floating",
      wallTime: "Temporal.PlainDateTime 1998-01-18T23:00:00",
    });
    expect(plain(decoded(decodeIcsValue("DATE-TIME", "19980119T070000Z")))).toEqual({
      instant: "Temporal.Instant 1998-01-19T07:00:00Z",
      kind: "utc",
    });
    expect(plain(decoded(decodeIcsValue("DATE-TIME", "19980119T020000", NEW_YORK)))).toEqual({
      kind: "zoned",
      tzid: "America/New_York",
      wallTime: "Temporal.PlainDateTime 1998-01-19T02:00:00",
      zoned: "Temporal.ZonedDateTime 1998-01-19T02:00:00-05:00[America/New_York]",
    });
    expect(zoned(decodeIcsValue("DATE-TIME", "19970714T133000", NEW_YORK)).zoned.offset).toBe(
      "-04:00",
    );
  });

  test("rejects RFC 5545 §3.3.5's invalid UTC offset form", () => {
    rejected(decodeIcsValue("DATE-TIME", "19980119T230000-0800"));
  });

  test("rejects impossible times and other shapes", () => {
    for (const raw of [
      "20260101T240000",
      "20260101T126000",
      "20260230T120000",
      "20260101T",
      "20260101T12",
      "20260101T1200000",
      "20260101 120000",
      "20260101",
      "",
    ]) {
      rejected(decodeIcsValue("DATE-TIME", raw));
    }
  });

  test("resolves a time in a DST fold to the earlier offset (RFC 5545 §3.3.5)", () => {
    const value = zoned(decodeIcsValue("DATE-TIME", "20071104T013000", NEW_YORK));
    expect(value.zoned.offset).toBe("-04:00");
    expect(value.zoned.toPlainDateTime().toString()).toBe("2007-11-04T01:30:00");
  });

  test("moves a time in a DST gap forward by the gap, keeping the wall time as written", () => {
    const value = zoned(decodeIcsValue("DATE-TIME", "20070311T023000", NEW_YORK));
    expect(value.zoned.toString()).toBe("2007-03-11T03:30:00-04:00[America/New_York]");
    expect(value.wallTime.toString()).toBe("2007-03-11T02:30:00");
    expect(encodeIcsValue("DATE-TIME", value)).toBe("20070311T023000");
  });

  test("keeps a TZID that resolves to no time zone as unresolved", () => {
    expect(
      plain(decoded(decodeIcsValue("DATE-TIME", "20260105T090000", { tzid: "Custom Zone" }))),
    ).toEqual({
      kind: "unresolved",
      tzid: "Custom Zone",
      wallTime: "Temporal.PlainDateTime 2026-01-05T09:00:00",
    });
  });

  test("resolves TZIDs through the context's resolver", () => {
    const resolveTimeZone = (tzid: string) =>
      tzid === "Eastern Standard Time" ? "America/New_York" : undefined;
    const value = zoned(
      decodeIcsValue("DATE-TIME", "20260105T090000", {
        resolveTimeZone,
        tzid: "Eastern Standard Time",
      }),
    );
    expect(value.tzid).toBe("Eastern Standard Time");
    expect(value.zoned.timeZoneId).toBe("America/New_York");

    // The resolver's answer is final, and an id Temporal doesn't know doesn't resolve.
    for (const tzid of ["Europe/Berlin", "Mars/Olympus_Mons"]) {
      const resolved = decoded(
        decodeIcsValue("DATE-TIME", "20260105T090000", {
          resolveTimeZone: (id) => (id === "Mars/Olympus_Mons" ? id : undefined),
          tzid,
        }),
      );
      expect(resolved.kind).toBe("unresolved");
    }
  });

  test("resolves a TZID Temporal knows without a resolver, in any case", () => {
    const value = zoned(decodeIcsValue("DATE-TIME", "20260105T090000", { tzid: "europe/berlin" }));
    expect(value.tzid).toBe("europe/berlin");
    expect(value.zoned.toString()).toBe("2026-01-05T09:00:00+01:00[Europe/Berlin]");
  });

  test("lets Z win over a TZID, with a warning", () => {
    const value = lenient(decodeIcsValue("DATE-TIME", "20260105T090000Z", NEW_YORK), /Z wins/);
    expect(plain(value)).toEqual({ instant: "Temporal.Instant 2026-01-05T09:00:00Z", kind: "utc" });
  });

  test("accepts a lowercase t or z, with a warning", () => {
    expect(plain(lenient(decodeIcsValue("DATE-TIME", "20260105t090000z"), /lowercase/))).toEqual({
      instant: "Temporal.Instant 2026-01-05T09:00:00Z",
      kind: "utc",
    });
    expect(lenient(decodeIcsValue("DATE-TIME", "20260105t090000"), /lowercase/).kind).toBe(
      "floating",
    );
  });

  test("accepts missing seconds, with a warning", () => {
    expect(plain(lenient(decodeIcsValue("DATE-TIME", "20260105T0930"), /seconds/))).toEqual({
      kind: "floating",
      wallTime: "Temporal.PlainDateTime 2026-01-05T09:30:00",
    });
  });

  test("reads a leap second as second 59, with a warning", () => {
    expect(plain(lenient(decodeIcsValue("DATE-TIME", "19970630T235960Z"), /leap second/))).toEqual({
      instant: "Temporal.Instant 1997-06-30T23:59:59Z",
      kind: "utc",
    });
  });

  test("lists several warnings one by one, each an invalid-value", () => {
    const result = decodeIcsValue("DATE-TIME", "19970630t2359z", NEW_YORK);
    expect(warningsOf(result)).toEqual([
      expect.stringMatching(/lowercase/),
      expect.stringMatching(/seconds/),
      expect.stringMatching(/Z wins/),
    ]);
    expect(result).toMatchObject({
      warnings: Array.from({ length: 3 }, () => ({ code: "invalid-value" })),
    });
  });

  test("codes a warning by what it is, not by the words in it", () => {
    lenient(
      decodeIcsValue("DATE-TIME", "20260101T000000Z", { tzid: "unsupported" }),
      /Z wins/,
      "invalid-value",
    );
  });

  test("reads an empty TZID as no TZID, with a warning", () => {
    const floating = lenient(
      decodeIcsValue("DATE-TIME", "20260101T090000", { tzid: "" }),
      /empty TZID/,
    );
    expect(plain(floating)).toEqual({
      kind: "floating",
      wallTime: "Temporal.PlainDateTime 2026-01-01T09:00:00",
    });

    // The Z doesn't win over a TZID that isn't there.
    const utc = decodeIcsValue("DATE-TIME", "20260101T090000Z", { tzid: "" });
    expect(warningsOf(utc)).toEqual([expect.stringMatching(/empty TZID/)]);
    expect(plain(lenient(utc, /empty TZID/))).toEqual({
      instant: "Temporal.Instant 2026-01-01T09:00:00Z",
      kind: "utc",
    });
  });

  test("writes every kind, zoned and unresolved ones as their wall time", () => {
    const wallTime = Temporal.PlainDateTime.from("2026-01-05T09:30:15.250");
    const values: [IcsDateTime, string][] = [
      [{ kind: "floating", wallTime }, "20260105T093015"],
      [{ kind: "unresolved", tzid: "Custom", wallTime }, "20260105T093015"],
      [
        {
          kind: "zoned",
          tzid: "Asia/Tokyo",
          wallTime,
          zoned: wallTime.toZonedDateTime("Asia/Tokyo"),
        },
        "20260105T093015",
      ],
      [
        { instant: Temporal.Instant.from("2026-01-05T09:30:15.999Z"), kind: "utc" },
        "20260105T093015Z",
      ],
    ];
    for (const [value, raw] of values) {
      expect(encodeIcsValue("DATE-TIME", value)).toBe(raw);
    }
  });
});

describe("decodeIcsDateValue", () => {
  test("decodes the declared shape without a warning", () => {
    expect(decoded(decodeIcsDateValue("20260105", "DATE")).kind).toBe("date");
    expect(decoded(decodeIcsDateValue("20260105T090000Z", "DATE-TIME")).kind).toBe("utc");
  });

  test("decodes a DATE without VALUE=DATE as a date, with a warning", () => {
    expect(
      plain(lenient(decodeIcsDateValue("20260105", "DATE-TIME", NEW_YORK), /DATE where DATE-TIME/)),
    ).toEqual({ date: "Temporal.PlainDate 2026-01-05", kind: "date" });
  });

  test("decodes a DATE-TIME under VALUE=DATE as a date-time, with a warning", () => {
    const value = lenient(
      decodeIcsDateValue("20260105T090000", "DATE", NEW_YORK),
      /DATE-TIME where DATE/,
    );
    expect(value.kind).toBe("zoned");
  });

  test("keeps the date-time's own warnings", () => {
    expect(warningsOf(decodeIcsDateValue("20260105t0900", "DATE"))).toEqual([
      expect.stringMatching(/DATE-TIME where DATE/),
      expect.stringMatching(/lowercase/),
      expect.stringMatching(/seconds/),
    ]);
  });

  test("fails on neither shape", () => {
    expect(rejected(decodeIcsDateValue("tomorrow", "DATE"))).toMatch(/DATE \(/);
    expect(rejected(decodeIcsDateValue("tomorrow", "DATE-TIME"))).toMatch(/DATE-TIME/);
    rejected(decodeIcsDateValue("20260230", "DATE-TIME"));
  });
});

describe("TIME", () => {
  test("reads RFC 5545 §3.3.12's examples", () => {
    expect(plain(decoded(decodeIcsValue("TIME", "230000")))).toEqual({
      time: "Temporal.PlainTime 23:00:00",
      utc: false,
    });
    expect(plain(decoded(decodeIcsValue("TIME", "070000Z")))).toEqual({
      time: "Temporal.PlainTime 07:00:00",
      utc: true,
    });
    expect(plain(decoded(decodeIcsValue("TIME", "083000")))).toEqual({
      time: "Temporal.PlainTime 08:30:00",
      utc: false,
    });
    expect(decoded(decodeIcsValue("TIME", "133000", NEW_YORK)).time.hour).toBe(13);
  });

  test("rejects RFC 5545 §3.3.12's invalid offset form and impossible times", () => {
    for (const raw of ["230000-0800", "240000", "126000", "12", "", "T120000"]) {
      rejected(decodeIcsValue("TIME", raw));
    }
  });

  test("accepts a lowercase z, missing seconds and a leap second, with warnings", () => {
    expect(lenient(decodeIcsValue("TIME", "070000z"), /lowercase/).utc).toBe(true);
    expect(lenient(decodeIcsValue("TIME", "0930"), /seconds/).time.toString()).toBe("09:30:00");
    expect(lenient(decodeIcsValue("TIME", "235960"), /leap second/).time.second).toBe(59);
  });

  test("writes the time, with Z for UTC", () => {
    const time = Temporal.PlainTime.from("07:05:09.5");
    expect(encodeIcsValue("TIME", { time, utc: false })).toBe("070509");
    expect(encodeIcsValue("TIME", { time, utc: true })).toBe("070509Z");
  });
});
