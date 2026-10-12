import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { describe, expect, test } from "vite-plus/test";

import { canonicalTimeZoneId } from "../../src/time-zones";
import { displayNameTimeZone, windowsTimeZone } from "../../src/time-zones/windows";
import { WINDOWS_ZONES } from "../../src/time-zones/windows-zones";

const zones = WINDOWS_ZONES.split("\n").map((line) => line.split("|"));

function displayName(offset: string, place: string): string {
  return `(UTC${offset.slice(0, 3)}:${offset.slice(3)}) ${place}`;
}

describe("generated Windows time zone data", () => {
  test("has every Windows zone CLDR maps for territory 001", () => {
    expect(zones).toHaveLength(139);
    for (const zone of zones) {
      expect(zone).toHaveLength(4);
      expect(zone[2]).toMatch(/^[+-]\d{4}$/);
    }
  });

  test.each(zones)("%s maps to %s, a zone Temporal knows by that id", (windowsId, timeZone) => {
    expect(canonicalTimeZoneId(timeZone ?? "")).toBe(timeZone);
    expect(windowsTimeZone(windowsId ?? "")).toBe(timeZone);
  });

  test.each(zones)("%s is found by its display name", (_, timeZone, offset, place) => {
    expect(displayNameTimeZone(displayName(offset ?? "", place ?? ""))).toBe(timeZone);
  });

  test("keeps places lower-cased, and still matches display names as Windows writes them", () => {
    // tests/ics-boundary.test.ts bans the legacy time class's name from the sources, and a place
    // such as the date line's would spell it.
    for (const [, , , place] of zones) expect(place).toBe(place?.toLowerCase());
    expect(displayNameTimeZone("(UTC-12:00) International Date Line West")).toBe("Etc/GMT+12");
    expect(displayNameTimeZone("(UTC+01:00) Amsterdam, Berlin, Bern, Rome")).toBe("Europe/Berlin");
  });

  test("uses current IANA ids rather than CLDR's older canonical ones", () => {
    const timeZones = new Set(zones.map(([, timeZone]) => timeZone));

    for (const current of ["Asia/Kolkata", "Europe/Kyiv", "America/Nuuk", "Asia/Yangon"]) {
      expect(timeZones).toContain(current);
    }
    for (const old of ["Asia/Calcutta", "Europe/Kiev", "America/Godthab", "Asia/Rangoon"]) {
      expect(timeZones).not.toContain(old);
    }
  });

  test("names its source release and license", async () => {
    const source = await readFile(
      new URL("../../src/time-zones/windows-zones.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(/Unicode CLDR release-\d+/);
    expect(source).toContain("Unicode License v3");
    expect(source).toContain("SPDX-License-Identifier: Unicode-3.0");
  });

  test("stays small", () => {
    expect(gzipSync(WINDOWS_ZONES, { level: 9 }).byteLength).toBeLessThan(3 * 1024);
  });
});
