import { describe, expect, test } from "vite-plus/test";

import type { IcsParameters, IcsProperty, IcsValueType } from "../../src/types";
import { icsValueTypeOf } from "../../src/values";

function property(name: string, parameters: IcsParameters = {}): IcsProperty {
  return { name, parameters, value: "" };
}

describe("icsValueTypeOf", () => {
  test.each<[string, IcsValueType]>([
    // RFC 5545 §3.7
    ["CALSCALE", "TEXT"],
    ["METHOD", "TEXT"],
    ["PRODID", "TEXT"],
    ["VERSION", "TEXT"],
    // §3.8.1
    ["ATTACH", "URI"],
    ["CATEGORIES", "TEXT"],
    ["CLASS", "TEXT"],
    ["COMMENT", "TEXT"],
    ["DESCRIPTION", "TEXT"],
    ["GEO", "FLOAT"],
    ["LOCATION", "TEXT"],
    ["PERCENT-COMPLETE", "INTEGER"],
    ["PRIORITY", "INTEGER"],
    ["RESOURCES", "TEXT"],
    ["STATUS", "TEXT"],
    ["SUMMARY", "TEXT"],
    // §3.8.2
    ["COMPLETED", "DATE-TIME"],
    ["DTEND", "DATE-TIME"],
    ["DUE", "DATE-TIME"],
    ["DTSTART", "DATE-TIME"],
    ["DURATION", "DURATION"],
    ["FREEBUSY", "PERIOD"],
    ["TRANSP", "TEXT"],
    // §3.8.3
    ["TZID", "TEXT"],
    ["TZNAME", "TEXT"],
    ["TZOFFSETFROM", "UTC-OFFSET"],
    ["TZOFFSETTO", "UTC-OFFSET"],
    ["TZURL", "URI"],
    // §3.8.4
    ["ATTENDEE", "CAL-ADDRESS"],
    ["CONTACT", "TEXT"],
    ["ORGANIZER", "CAL-ADDRESS"],
    ["RECURRENCE-ID", "DATE-TIME"],
    ["RELATED-TO", "TEXT"],
    ["URL", "URI"],
    ["UID", "TEXT"],
    // §3.8.5
    ["EXDATE", "DATE-TIME"],
    ["RDATE", "DATE-TIME"],
    ["RRULE", "RECUR"],
    // §3.8.6
    ["ACTION", "TEXT"],
    ["REPEAT", "INTEGER"],
    ["TRIGGER", "DURATION"],
    // §3.8.7
    ["CREATED", "DATE-TIME"],
    ["DTSTAMP", "DATE-TIME"],
    ["LAST-MODIFIED", "DATE-TIME"],
    ["SEQUENCE", "INTEGER"],
    // §3.8.8
    ["REQUEST-STATUS", "TEXT"],
    // RFC 7986
    ["NAME", "TEXT"],
    ["COLOR", "TEXT"],
    ["REFRESH-INTERVAL", "DURATION"],
    ["SOURCE", "URI"],
    ["IMAGE", "URI"],
    ["CONFERENCE", "URI"],
    // RFC 9074
    ["ACKNOWLEDGED", "DATE-TIME"],
    // Common extensions
    ["X-WR-CALNAME", "TEXT"],
    ["X-WR-CALDESC", "TEXT"],
    ["X-WR-TIMEZONE", "TEXT"],
    ["X-LIC-LOCATION", "TEXT"],
    ["X-PUBLISHED-TTL", "DURATION"],
    // RFC 2445's EXRULE, and properties nobody registered
    ["EXRULE", "RECUR"],
    ["X-RESOURCE-ID", "TEXT"],
    ["IANA-TOKEN", "TEXT"],
    ["CONSTRUCTOR", "TEXT"],
  ])("%s defaults to %s", (name, type) => {
    expect(icsValueTypeOf(property(name))).toBe(type);
  });

  test("reads the name case-insensitively", () => {
    expect(icsValueTypeOf(property("dtStart"))).toBe("DATE-TIME");
  });

  test("lets a VALUE parameter override the default, case-insensitively", () => {
    expect(icsValueTypeOf(property("DTSTART", { VALUE: ["DATE"] }))).toBe("DATE");
    expect(icsValueTypeOf(property("DTSTART", { VALUE: ["date"] }))).toBe("DATE");
    expect(icsValueTypeOf(property("ATTACH", { VALUE: ["BINARY"] }))).toBe("BINARY");
    expect(icsValueTypeOf(property("RDATE", { VALUE: ["Period"] }))).toBe("PERIOD");
    expect(icsValueTypeOf(property("X-WEIGHT", { VALUE: ["FLOAT"] }))).toBe("FLOAT");
  });

  test("reads an unknown VALUE as TEXT", () => {
    expect(icsValueTypeOf(property("DTSTART", { VALUE: ["X-STARDATE"] }))).toBe("TEXT");
    expect(icsValueTypeOf(property("DTSTART", { VALUE: [""] }))).toBe("TEXT");
  });
});
