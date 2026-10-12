import { describe, expect, test, vi } from "vite-plus/test";

import { parseIcs } from "../../src/index";
import { createTimeZoneResolver } from "../../src/time-zones";
import { displayNameTimeZone } from "../../src/time-zones/windows";
import type { IcsTimeZoneResolver } from "../../src/types";
import { definitionsOf, vtimezone } from "./vtimezone";

describe("rule 1: the custom resolver", () => {
  test("is consulted first, with the TZID as written and its VTIMEZONE", () => {
    const definition = vtimezone("Europe/Berlin", [["STANDARD", "+0100"]]);
    const custom = vi.fn<IcsTimeZoneResolver>(() => "Europe/Paris");
    const resolve = createTimeZoneResolver({ custom, definitions: definitionsOf(definition) });

    expect(resolve("Europe/Berlin")).toBe("Europe/Paris");
    expect(custom).toHaveBeenCalledWith("Europe/Berlin", definition);
  });

  test("gets no definition for a TZID without a VTIMEZONE", () => {
    const custom = vi.fn<IcsTimeZoneResolver>(() => undefined);
    createTimeZoneResolver({ custom })("Europe/Berlin");

    expect(custom).toHaveBeenCalledWith("Europe/Berlin", undefined);
  });

  test("has its result normalized by Temporal", () => {
    const resolve = createTimeZoneResolver({ custom: () => "europe/paris" });

    expect(resolve("Our Office")).toBe("Europe/Paris");
  });

  test("falls through to the built-in rules when it returns undefined", () => {
    const resolve = createTimeZoneResolver({ custom: () => undefined });

    expect(resolve("W. Europe Standard Time")).toBe("Europe/Berlin");
  });

  test("falls through to the built-in rules when it returns an id Temporal doesn't know", () => {
    const resolve = createTimeZoneResolver({ custom: () => "Mars/Olympus_Mons" });

    expect(resolve("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(resolve("Mars Standard Time")).toBeUndefined();
  });

  test("may resolve to a fixed offset", () => {
    const resolve = createTimeZoneResolver({ custom: () => "+0530" });

    expect(resolve("Office")).toBe("+05:30");
  });
});

describe("rule 2: the TZID as a time zone id", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["Europe/Berlin", "Europe/Berlin"],
    ["europe/berlin", "Europe/Berlin"],
    ["  Europe/Berlin\t", "Europe/Berlin"],
    ['"Europe/Berlin"', "Europe/Berlin"],
    [' " Europe/Berlin " ', "Europe/Berlin"],
    ["Asia/Calcutta", "Asia/Calcutta"],
    ["US/Eastern", "US/Eastern"],
    ["UTC", "UTC"],
    ["+05:30", "+05:30"],
    ["-0800", "-08:00"],
  ])("resolves %j to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test("keeps POSIX-style Etc/GMT zones, whose sign is inverted", () => {
    expect(resolve("Etc/GMT+5")).toBe("Etc/GMT+5");
    expect(Temporal.ZonedDateTime.from("2026-01-01T00:00[Etc/GMT+5]").offset).toBe("-05:00");
  });
});

describe("rule 3: vendor path prefixes", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["/mozilla.org/20050126_1/Europe/Berlin", "Europe/Berlin"],
    ["/mozilla.org/20070129_1/America/Argentina/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["/mozilla.org/20071231_1/UTC", "UTC"],
    ["/softwarestudio.org/Olson_20011030_5/America/New_York", "America/New_York"],
    ["/softwarestudio.org/Tzfile/Europe/Berlin", "Europe/Berlin"],
    ["/freeassociation.sourceforge.net/Tzfile/Europe/London", "Europe/London"],
    ["/freeassociation.sourceforge.net/Europe/London", "Europe/London"],
    [
      "/freeassociation.sourceforge.net/Tzfile/America/Indiana/Indianapolis",
      "America/Indiana/Indianapolis",
    ],
    ["/citadel.org/20190914_1/Europe/Paris", "Europe/Paris"],
    ["/example.com/zones/asia/tokyo", "Asia/Tokyo"],
    ["tzone://Microsoft/Utc", "UTC"],
  ])("resolves %s to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test("prefers the longest trailing id", () => {
    // `Indiana/Indianapolis` isn't a zone, `Indianapolis` neither: only all three segments match.
    expect(resolve("/vendor/America/Indiana/Indianapolis")).toBe("America/Indiana/Indianapolis");
    // `America/Argentina/Buenos_Aires` wins over its link `America/Buenos_Aires`.
    expect(resolve("/vendor/America/Argentina/Buenos_Aires")).toBe(
      "America/Argentina/Buenos_Aires",
    );
  });

  test("leaves paths without a known zone, and names with spaces, alone", () => {
    expect(resolve("/example.com/Mars/Olympus_Mons")).toBeUndefined();
    expect(resolve("tzone://Microsoft/Custom")).toBeUndefined();
    // A display name with slashes isn't a path: `Kwajalein` would be UTC+12, this zone is UTC−12.
    expect(resolve("(GMT-12.00) Eniwetok / Kwajalein")).toBeUndefined();
  });
});

describe("rule 4: Windows time zone ids", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["W. Europe Standard Time", "Europe/Berlin"],
    ["Eastern Standard Time", "America/New_York"],
    ["Pacific Standard Time", "America/Los_Angeles"],
    ["Pacific Standard Time (Mexico)", "America/Tijuana"],
    ["GMT Standard Time", "Europe/London"],
    ["Greenwich Standard Time", "Atlantic/Reykjavik"],
    ["India Standard Time", "Asia/Kolkata"],
    ["FLE Standard Time", "Europe/Kyiv"],
    ["Russia Time Zone 3", "Europe/Samara"],
    ["UTC-11", "Etc/GMT+11"],
    ["UTC+12", "Etc/GMT-12"],
    ["AUS Eastern Standard Time", "Australia/Sydney"],
  ])("resolves %s to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test("ignores case and extra spaces", () => {
    expect(resolve("w. europe standard time")).toBe("Europe/Berlin");
    expect(resolve("W.  Europe Standard  Time")).toBe("Europe/Berlin");
  });

  test("accepts the id without ' Standard Time', as Lotus Notes writes it", () => {
    expect(resolve("W. Europe")).toBe("Europe/Berlin");
    expect(resolve("Eastern")).toBe("America/New_York");
    expect(resolve("Pacific")).toBe("America/Los_Angeles");
    expect(resolve("India")).toBe("Asia/Kolkata");
  });

  test("accepts ' Daylight Time' instead of ' Standard Time'", () => {
    expect(resolve("Pacific Daylight Time")).toBe("America/Los_Angeles");
    expect(resolve("W. Europe Daylight Time")).toBe("Europe/Berlin");
  });

  test("comes after IANA ids, so GMT stays GMT rather than Windows' GMT Standard Time", () => {
    expect(resolve("GMT")).toBe("GMT");
    expect(resolve("UTC")).toBe("UTC");
  });
});

describe("rule 5: Outlook display names", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna", "Europe/Berlin"],
    ["(UTC-05:00) Eastern Time (US & Canada)", "America/New_York"],
    ["(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi", "Asia/Kolkata"],
    ["(UTC+00:00) Dublin, Edinburgh, Lisbon, London", "Europe/London"],
    ["(UTC) Coordinated Universal Time", "Etc/UTC"],
    ["(UTC-11:00) Coordinated Universal Time-11", "Etc/GMT+11"],
    ["(UTC+12:45) Chatham Islands", "Pacific/Chatham"],
  ])("resolves the current name %s to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test.each([
    ["(GMT+01.00) Amsterdam / Berlin / Bern / Rome / Stockholm / Vienna", "Europe/Berlin"],
    ["(GMT-05.00) Eastern Time (US & Canada)", "America/New_York"],
    ["(GMT+05.30) Chennai / Kolkata / Mumbai / New Delhi", "Asia/Kolkata"],
    ["(GMT-08.00) Pacific Time (US & Canada)/Tijuana", "America/Los_Angeles"],
    ["(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna", "Europe/Berlin"],
    ["(GMT-08:00) Pacific Time (US & Canada); Tijuana", "America/Los_Angeles"],
  ])("resolves the older name %s to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test("goes by the first place, so names whose later places changed still match", () => {
    expect(resolve("(UTC+02:00) Helsinki, Kiev, Riga, Sofia, Tallinn, Vilnius")).toBe(
      "Europe/Kyiv",
    );
    expect(resolve("(UTC+04:00) Moscow, St. Petersburg, Volgograd")).toBe("Europe/Moscow");
  });

  test("accepts an offset other than the table's that the first place's zone had", () => {
    // Moscow was at +04:00 from 2011 to 2014, and has been at +03:00 before and since.
    expect(resolve("(UTC+03:00) Moscow, St. Petersburg")).toBe("Europe/Moscow");
    expect(resolve("(GMT+03:00) Moscow, St. Petersburg, Volgograd")).toBe("Europe/Moscow");
    // Turkey kept +02:00 in winter until 2016; the table has today's +03:00.
    expect(resolve("(UTC+02:00) Istanbul")).toBe("Europe/Istanbul");
    expect(resolve("(UTC+03:00) Istanbul")).toBe("Europe/Istanbul");
  });

  test("leaves a first place whose zone never had the name's offset unresolved", () => {
    expect(resolve("(UTC+09:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna")).toBeUndefined();
  });

  test("leaves Astana at +05:00 unresolved, not on CLDR's Asia/Bishkek at +06:00", () => {
    // Kazakhstan moved to +05:00 in 2024; Bishkek last had +05:00 in 2005, before Windows wrote
    // `(UTC…)` names.
    expect(resolve("(UTC+05:00) Astana")).toBeUndefined();
    expect(resolve("(UTC+06:00) Astana")).toBe("Asia/Bishkek");
    expect(resolve("(GMT+06:00) Astana, Dhaka")).toBe("Asia/Bishkek");
  });

  test("tries later places only for a zone with the same offset", () => {
    expect(resolve("(GMT) Greenwich Mean Time : Dublin, Edinburgh, Lisbon, London")).toBe(
      "Europe/London",
    );
    // Samoa is UTC+13 today; this older zone was UTC−11.
    expect(resolve("(GMT-11:00) Midway Island, Samoa")).toBeUndefined();
  });

  test("leaves unknown places unresolved rather than guessing from the offset", () => {
    expect(resolve("(UTC+01:00) Atlantis")).toBeUndefined();
    expect(resolve("(UTC+01:00)")).toBeUndefined();
  });
});

describe("rule 6: the calendar's VTIMEZONE", () => {
  test("uses the IANA zone X-LIC-LOCATION names", () => {
    const definition = vtimezone(
      "Customized Time Zone",
      [
        ["STANDARD", "+0100"],
        ["DAYLIGHT", "+0200"],
      ],
      "Europe/Berlin",
    );
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("Customized Time Zone")).toBe("Europe/Berlin");
  });

  test.each([
    [[["STANDARD", "+0530"]], "+05:30"],
    [[["STANDARD", "-0300"]], "-03:00"],
    [[["STANDARD", "+0000"]], "+00:00"],
    [[["STANDARD", "-0000"]], "+00:00"],
    [[["STANDARD", "+053000"]], "+05:30"],
    [
      [
        ["STANDARD", "+0800"],
        ["STANDARD", "+0800"],
      ],
      "+08:00",
    ],
    [
      [
        ["STANDARD", "+0530"],
        ["DAYLIGHT", "+0530"],
      ],
      "+05:30",
    ],
  ] as const)("resolves the fixed offset of %j to %s", (observances, expected) => {
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(vtimezone("Office", observances)),
    });

    expect(resolve("Office")).toBe(expected);
  });

  test.each([
    [
      "observes DST",
      [
        ["STANDARD", "+0100"],
        ["DAYLIGHT", "+0200"],
      ],
    ],
    [
      "changed its standard offset",
      [
        ["STANDARD", "+0553"],
        ["STANDARD", "+0530"],
      ],
    ],
    ["has an offset with seconds, which Temporal can't name", [["STANDARD", "+005328"]]],
    ["has an invalid offset", [["STANDARD", "+1"]]],
    ["has no observances", []],
  ] as const)("leaves a definition that %s unresolved", (_, observances) => {
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(vtimezone("Office", observances)),
    });

    expect(resolve("Office")).toBeUndefined();
  });

  test("falls back to the offset when X-LIC-LOCATION isn't a known zone", () => {
    const definition = vtimezone("Office", [["STANDARD", "+0900"]], "Asia/Atlantis");
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("Office")).toBe("+09:00");
  });

  test("finds the definition whether the TZID parameter was quoted or not", () => {
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(vtimezone("Office", [["STANDARD", "+0400"]])),
    });

    expect(resolve('"Office"')).toBe("+04:00");
  });

  test("finds a definition whose TZID escapes the commas the parameter holds as is", () => {
    const definition = vtimezone("(UTC+01:00) Atlantis\\, Lemuria", [["STANDARD", "+0100"]]);
    const custom = vi.fn<IcsTimeZoneResolver>(() => undefined);
    const resolve = createTimeZoneResolver({ custom, definitions: definitionsOf(definition) });

    expect(resolve("(UTC+01:00) Atlantis, Lemuria")).toBe("+01:00");
    expect(custom).toHaveBeenCalledWith("(UTC+01:00) Atlantis, Lemuria", definition);
  });

  test("applies only to the TZID it defines", () => {
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(vtimezone("Office", [["STANDARD", "+0400"]])),
    });

    expect(resolve("Branch Office")).toBeUndefined();
  });
});

describe("rule 7: offset names", () => {
  const resolve = createTimeZoneResolver();

  test.each([
    ["Z", "UTC"],
    ["z", "UTC"],
    ["GMT+0100", "+01:00"],
    ["UTC+01:00", "+01:00"],
    ["GMT-05:00", "-05:00"],
    ["UTC-5", "-05:00"],
    ["UTC+5:30", "+05:30"],
    ["GMT+01.00", "+01:00"],
    ["UTC +09:00", "+09:00"],
    ["utc+14", "+14:00"],
    ["UTC−03:00", "-03:00"],
    ["GMT+0000", "+00:00"],
    ["+1", "+01:00"],
  ])("resolves %s to %s", (tzid, expected) => {
    expect(resolve(tzid)).toBe(expected);
  });

  test.each([["UTC+24:00"], ["GMT+01:60"], ["UTC+01:00:30"], ["UTC+"], ["GMT 1"]])(
    "leaves %s unresolved",
    (tzid) => {
      expect(resolve(tzid)).toBeUndefined();
    },
  );
});

describe("rule 8: unresolved", () => {
  test("gives undefined for a TZID no rule knows", () => {
    const resolve = createTimeZoneResolver();

    expect(resolve("Customized Time Zone")).toBeUndefined();
    expect(resolve("Mars Standard Time")).toBeUndefined();
    expect(resolve("")).toBeUndefined();
    expect(resolve('""')).toBeUndefined();
  });
});

describe("a VTIMEZONE that changes offset", () => {
  const dst = [
    ["STANDARD", "-0500"],
    ["DAYLIGHT", "-0400"],
  ] as const;

  test.each([
    ["EST", "an id Temporal knows as a fixed offset"],
    ["-05:00", "an offset id"],
    ["/vendor.example/EST", "a vendor path"],
    ["UTC-11", "a Windows id of a fixed zone"],
    ["(UTC-11:00) Coordinated Universal Time-11", "a display name of a fixed zone"],
    ["GMT-0500", "an offset name"],
  ])("rejects %s, %s that never changes offset", (tzid) => {
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(vtimezone(tzid, dst)) });

    expect(resolve(tzid)).toBeUndefined();
  });

  test("falls through to X-LIC-LOCATION", () => {
    const definition = vtimezone("EST", dst, "America/New_York");
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("EST")).toBe("America/New_York");
  });

  test("keeps a fixed zone for a VTIMEZONE with a single offset", () => {
    const definition = vtimezone("EST", [["STANDARD", "-0500"]]);
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("EST")).toBe("EST");
  });

  test("keeps zones that change offset", () => {
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(
        vtimezone("Eastern Standard Time", dst),
        vtimezone("America/New_York", dst),
      ),
    });

    expect(resolve("Eastern Standard Time")).toBe("America/New_York");
    expect(resolve("America/New_York")).toBe("America/New_York");
  });

  test("keeps a zone fixed since 1970 when the VTIMEZONE lists its earlier offsets", () => {
    // Written with the zone's whole history: LMT, IST, and the wartime +06:30.
    const definition = vtimezone("Asia/Kolkata", [
      ["STANDARD", "+055328"],
      ["STANDARD", "+0530"],
      ["DAYLIGHT", "+0630"],
      ["STANDARD", "+0530"],
    ]);
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  test("doesn't second-guess the custom resolver", () => {
    const resolve = createTimeZoneResolver({
      custom: () => "EST",
      definitions: definitionsOf(vtimezone("Eastern", dst)),
    });

    expect(resolve("Eastern")).toBe("EST");
  });

  test("leaves events in such a TZID unresolved rather than an hour off", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VTIMEZONE",
      "TZID:EST",
      "BEGIN:STANDARD",
      "DTSTART:19701101T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      "TZOFFSETFROM:-0400",
      "TZOFFSETTO:-0500",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700308T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0400",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:1",
      "DTSTAMP:20260101T000000Z",
      "DTSTART;TZID=EST:20260715T090000",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    expect(parseIcs(text).calendars[0]?.events[0]?.start).toMatchObject({
      kind: "unresolved",
      tzid: "EST",
    });
  });
});

describe("long TZIDs", () => {
  // Each of these took quadratic time before: at this length, long enough to time the test out.
  const spaces = " ".repeat(100_000);

  test.each([
    ["an unclosed display name", `(UTC${spaces}x`],
    ["a display name with a line break after spaces", `(UTC)${spaces}\n`],
    ["a display name with spaces before a separator", `(UTC+01:00) Atlantis${spaces}x`],
    ["an offset name", `UTC${spaces}+${spaces}x`],
  ])("leaves %s unresolved, quickly", (_, tzid) => {
    expect(createTimeZoneResolver()(tzid)).toBeUndefined();
    expect(displayNameTimeZone(tzid)).toBeUndefined();
  });

  test("match display names with whitespace collapsed, in linear time", () => {
    expect(displayNameTimeZone(`(${spaces}UTC${spaces}+01:00${spaces})${spaces}Amsterdam`)).toBe(
      "Europe/Berlin",
    );
    expect(displayNameTimeZone(`(GMT)\t\r\n Greenwich Mean Time${spaces}:${spaces}Dublin`)).toBe(
      "Europe/London",
    );
  });

  test("over 256 characters are left to the custom resolver", () => {
    const tzid = `(UTC+01:00) Amsterdam,${" ".repeat(300)}Berlin`;

    expect(displayNameTimeZone(tzid)).toBe("Europe/Berlin");
    expect(createTimeZoneResolver()(tzid)).toBeUndefined();
    expect(createTimeZoneResolver({ custom: () => "Europe/Berlin" })(tzid)).toBe("Europe/Berlin");
  });

  test("over 256 characters still resolve through their VTIMEZONE", () => {
    const tzid = `Office${" ".repeat(300)}Berlin`;
    const definitions = definitionsOf(
      vtimezone(
        tzid,
        [
          ["STANDARD", "+0100"],
          ["DAYLIGHT", "+0200"],
        ],
        "Europe/Berlin",
      ),
    );

    expect(createTimeZoneResolver({ definitions })(tzid)).toBe("Europe/Berlin");
  });
});

describe("precedence", () => {
  test("the custom resolver wins over a valid IANA TZID", () => {
    const resolve = createTimeZoneResolver({ custom: () => "Asia/Tokyo" });

    expect(resolve("Europe/Berlin")).toBe("Asia/Tokyo");
  });

  test("a Windows id wins over the VTIMEZONE", () => {
    const definition = vtimezone(
      "W. Europe Standard Time",
      [["STANDARD", "+0100"]],
      "Europe/Paris",
    );
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("W. Europe Standard Time")).toBe("Europe/Berlin");
  });

  test("a display name wins over the VTIMEZONE", () => {
    const tzid = "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi";
    const resolve = createTimeZoneResolver({
      definitions: definitionsOf(vtimezone(tzid, [["STANDARD", "+0530"]])),
    });

    expect(resolve(tzid)).toBe("Asia/Kolkata");
  });

  test("the VTIMEZONE wins over an offset name", () => {
    const definition = vtimezone("UTC+05:30", [["STANDARD", "+0530"]], "Asia/Colombo");
    const resolve = createTimeZoneResolver({ definitions: definitionsOf(definition) });

    expect(resolve("UTC+05:30")).toBe("Asia/Colombo");
  });

  test("a Windows id wins over an offset name", () => {
    // Both name UTC−11; the Windows table has the IANA zone for it.
    expect(createTimeZoneResolver()("UTC-11")).toBe("Etc/GMT+11");
  });
});

describe("caching", () => {
  test("resolves each TZID once per resolver, including unresolved ones", () => {
    const custom = vi.fn<IcsTimeZoneResolver>(() => undefined);
    const resolve = createTimeZoneResolver({ custom });

    expect(resolve("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(resolve("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(resolve("Customized Time Zone")).toBeUndefined();
    expect(resolve("Customized Time Zone")).toBeUndefined();
    expect(custom).toHaveBeenCalledTimes(2);
  });

  test("keeps a cache per resolver", () => {
    const custom = vi.fn<IcsTimeZoneResolver>(() => undefined);

    createTimeZoneResolver({ custom })("Europe/Berlin");
    createTimeZoneResolver({ custom })("Europe/Berlin");

    expect(custom).toHaveBeenCalledTimes(2);
  });

  test("keys the cache by the TZID as written", () => {
    const custom = vi.fn<IcsTimeZoneResolver>((tzid) =>
      tzid === '"A"' ? "Asia/Tokyo" : undefined,
    );
    const resolve = createTimeZoneResolver({ custom });

    expect(resolve('"A"')).toBe("Asia/Tokyo");
    expect(resolve("A")).toBeUndefined();
  });
});
