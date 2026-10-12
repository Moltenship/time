import { describe, expect, test, vi } from "vite-plus/test";

import { canonicalTimeZoneId } from "../../src/time-zones";

// What native Temporal (Node 26) does with time zone ids; the resolver's rules build on it.
describe("canonicalTimeZoneId", () => {
  test.each([
    ["Europe/Berlin", "Europe/Berlin"],
    ["America/Argentina/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["UTC", "UTC"],
    ["Etc/UTC", "Etc/UTC"],
    ["GMT", "GMT"],
    ["EST5EDT", "EST5EDT"],
  ])("keeps the IANA id %s", (id, expected) => {
    expect(canonicalTimeZoneId(id)).toBe(expected);
  });

  test.each([
    ["europe/berlin", "Europe/Berlin"],
    ["EUROPE/BERLIN", "Europe/Berlin"],
    ["america/argentina/buenos_aires", "America/Argentina/Buenos_Aires"],
    ["utc", "UTC"],
    ["etc/gmt-14", "Etc/GMT-14"],
  ])("normalizes the case of %s to %s", (id, expected) => {
    expect(canonicalTimeZoneId(id)).toBe(expected);
  });

  test("keeps the alias it was given rather than switching to the primary id", () => {
    expect(canonicalTimeZoneId("Asia/Calcutta")).toBe("Asia/Calcutta");
    expect(canonicalTimeZoneId("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(canonicalTimeZoneId("US/Eastern")).toBe("US/Eastern");
    expect(canonicalTimeZoneId("Europe/Kiev")).toBe("Europe/Kiev");

    const calcutta = Temporal.ZonedDateTime.from("2026-01-01T00:00[Asia/Calcutta]");
    const kolkata = Temporal.ZonedDateTime.from("2026-01-01T00:00[Asia/Kolkata]");
    expect(calcutta.equals(kolkata)).toBe(true);
  });

  test.each([
    ["+01:00", "+01:00"],
    ["+0100", "+01:00"],
    ["+01", "+01:00"],
    ["-05:00", "-05:00"],
    ["+0530", "+05:30"],
    ["-00:00", "+00:00"],
    ["+00", "+00:00"],
    ["+23:59", "+23:59"],
  ])("writes the offset %s as %s", (id, expected) => {
    expect(canonicalTimeZoneId(id)).toBe(expected);
  });

  test.each([
    ["Z"],
    ["z"],
    ["+1"],
    ["+24:00"],
    ["+05:30:00"],
    ["+01:00:00.5"],
    ["−05:00"],
    ["UTC+01:00"],
    ["GMT+1"],
    [" Europe/Berlin"],
    ["Europe/Berlin "],
    ['"Europe/Berlin"'],
    ["Europe/Berlin[u-ca=iso8601]"],
    ["Europe/Atlantis"],
    ["Etc/GMT+13"],
    ["W. Europe Standard Time"],
    [""],
  ])("rejects %j", (id) => {
    expect(canonicalTimeZoneId(id)).toBeUndefined();
  });

  test("takes identifiers only, not ISO date-times that carry a time zone", () => {
    expect(canonicalTimeZoneId("2026-01-01T00:00Z")).toBeUndefined();
    expect(canonicalTimeZoneId("2026-01-01T00:00+01:00")).toBeUndefined();
    expect(canonicalTimeZoneId("2026-01-01T00:00[Europe/Berlin]")).toBeUndefined();
  });

  test("asks Temporal once per id", () => {
    const constructor = vi.spyOn(Temporal, "ZonedDateTime");
    try {
      expect(canonicalTimeZoneId("Antarctica/Troll")).toBe("Antarctica/Troll");
      expect(canonicalTimeZoneId("Antarctica/Troll")).toBe("Antarctica/Troll");
      expect(canonicalTimeZoneId("Antarctica/Nowhere")).toBeUndefined();
      expect(canonicalTimeZoneId("Antarctica/Nowhere")).toBeUndefined();
      expect(constructor).toHaveBeenCalledTimes(2);
    } finally {
      constructor.mockRestore();
    }
  });
});
