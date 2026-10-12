import { describe, expect, test } from "vite-plus/test";

import { createTimeZoneResolver } from "../../src/time-zones";
import { definitionsOf, vtimezone } from "./vtimezone";

/** A TZID as written, the time zone it resolves to, and that zone's offset on 2026-07-01. */
type ProducerCase = readonly [tzid: string, timeZone: string, summerOffset: string];

function offsetAt(wallTime: string, timeZone: string | undefined): string | undefined {
  return timeZone === undefined
    ? undefined
    : Temporal.PlainDateTime.from(wallTime).toZonedDateTime(timeZone).offset;
}

const producers: readonly (readonly [producer: string, cases: readonly ProducerCase[]])[] = [
  [
    "Google Calendar (IANA)",
    [
      ["Europe/Berlin", "Europe/Berlin", "+02:00"],
      ["America/Los_Angeles", "America/Los_Angeles", "-07:00"],
      ["America/Argentina/Buenos_Aires", "America/Argentina/Buenos_Aires", "-03:00"],
      ["UTC", "UTC", "+00:00"],
    ],
  ],
  [
    "Apple Calendar and iCloud (IANA, older aliases)",
    [
      ["Europe/Berlin", "Europe/Berlin", "+02:00"],
      ["America/New_York", "America/New_York", "-04:00"],
      ["Asia/Calcutta", "Asia/Calcutta", "+05:30"],
      ["Asia/Saigon", "Asia/Saigon", "+07:00"],
    ],
  ],
  [
    "Outlook and Exchange (Windows ids)",
    [
      ["W. Europe Standard Time", "Europe/Berlin", "+02:00"],
      ["Romance Standard Time", "Europe/Paris", "+02:00"],
      ["GMT Standard Time", "Europe/London", "+01:00"],
      ["Eastern Standard Time", "America/New_York", "-04:00"],
      ["Pacific Standard Time", "America/Los_Angeles", "-07:00"],
      ["India Standard Time", "Asia/Kolkata", "+05:30"],
      ["Tokyo Standard Time", "Asia/Tokyo", "+09:00"],
      ["AUS Eastern Standard Time", "Australia/Sydney", "+10:00"],
      ["tzone://Microsoft/Utc", "UTC", "+00:00"],
    ],
  ],
  [
    "Outlook and Exchange (display names)",
    [
      ["(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna", "Europe/Berlin", "+02:00"],
      ["(UTC-05:00) Eastern Time (US & Canada)", "America/New_York", "-04:00"],
      ["(UTC+10:00) Canberra, Melbourne, Sydney", "Australia/Sydney", "+10:00"],
    ],
  ],
  [
    "Outlook 2003 and Exchange 2003 (older display names)",
    [
      [
        "(GMT+01.00) Amsterdam / Berlin / Bern / Rome / Stockholm / Vienna",
        "Europe/Berlin",
        "+02:00",
      ],
      ["(GMT+01.00) Brussels / Copenhagen / Madrid / Paris", "Europe/Paris", "+02:00"],
      ["(GMT-05.00) Eastern Time (US & Canada)", "America/New_York", "-04:00"],
      ["(GMT) Greenwich Mean Time : Dublin, Edinburgh, Lisbon, London", "Europe/London", "+01:00"],
    ],
  ],
  [
    "Thunderbird and Lightning (Mozilla paths)",
    [
      ["/mozilla.org/20050126_1/Europe/Berlin", "Europe/Berlin", "+02:00"],
      ["/mozilla.org/20070129_1/America/New_York", "America/New_York", "-04:00"],
      ["/mozilla.org/20071231_1/Asia/Tokyo", "Asia/Tokyo", "+09:00"],
    ],
  ],
  [
    "Evolution, KOrganizer and other libical producers (paths)",
    [
      ["/freeassociation.sourceforge.net/Tzfile/Europe/London", "Europe/London", "+01:00"],
      ["/freeassociation.sourceforge.net/Europe/Berlin", "Europe/Berlin", "+02:00"],
      ["/softwarestudio.org/Olson_20011030_5/America/New_York", "America/New_York", "-04:00"],
      ["/citadel.org/20190914_1/Europe/Paris", "Europe/Paris", "+02:00"],
    ],
  ],
  [
    "Lotus Notes and Domino (Windows ids without ' Standard Time')",
    [
      ["Eastern", "America/New_York", "-04:00"],
      ["Central", "America/Chicago", "-05:00"],
      ["W. Europe", "Europe/Berlin", "+02:00"],
      ["Romance", "Europe/Paris", "+02:00"],
    ],
  ],
];

// TZIDs as each producer writes them, and the offset a summer wall time gets in the zone they
// resolve to.
describe.each(producers)("%s", (_, cases) => {
  const resolve = createTimeZoneResolver();

  test.each(cases)("%s → %s", (tzid, expected, summerOffset) => {
    const timeZone = resolve(tzid);

    expect(timeZone).toBe(expected);
    expect(offsetAt("2026-07-01T12:00", timeZone)).toBe(summerOffset);
  });
});

describe("Outlook's Customized Time Zone", () => {
  test("resolves when its VTIMEZONE keeps one offset", () => {
    const definition = vtimezone("Customized Time Zone", [
      ["STANDARD", "+0530"],
      ["DAYLIGHT", "+0530"],
    ]);
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("Customized Time Zone")).toBe("+05:30");
  });

  test("stays unresolved when its VTIMEZONE observes DST", () => {
    const definition = vtimezone("Customized Time Zone", [
      ["STANDARD", "-0500"],
      ["DAYLIGHT", "-0400"],
    ]);
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("Customized Time Zone")).toBeUndefined();
  });
});

// RFC 5545 §3.3.5: a wall time that occurs twice means its first occurrence; one that doesn't occur
// is read with the offset from before the gap. That's Temporal's `compatible` disambiguation, the
// default, which the value layer uses for zoned DATE-TIMEs.
describe("RFC 5545 DST gap and fold", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["America/New_York"],
    ["/mozilla.org/20050126_1/America/New_York"],
    ["Eastern Standard Time"],
    ["(UTC-05:00) Eastern Time (US & Canada)"],
  ])("%s", (tzid) => {
    const timeZone = resolve(tzid);
    if (timeZone === undefined) throw new Error(`${tzid} didn't resolve`);

    const fold = Temporal.PlainDateTime.from("2007-11-04T01:30").toZonedDateTime(timeZone, {
      disambiguation: "compatible",
    });
    expect(fold.toString()).toBe("2007-11-04T01:30:00-04:00[America/New_York]");

    const gap = Temporal.PlainDateTime.from("2007-03-11T02:30").toZonedDateTime(timeZone, {
      disambiguation: "compatible",
    });
    expect(gap.toString()).toBe("2007-03-11T03:30:00-04:00[America/New_York]");
    expect(gap.toInstant().toString()).toBe("2007-03-11T07:30:00Z");

    expect(Temporal.PlainDateTime.from("2007-03-11T02:30").toZonedDateTime(timeZone)).toEqual(gap);
  });
});
