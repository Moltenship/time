import { describe, expect, test } from "vite-plus/test";

import { decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, lenient, rejected } from "./helpers";

describe("UTC-OFFSET", () => {
  test("reads RFC 5545 §3.3.14's examples as Temporal offset strings", () => {
    expect(decoded(decodeIcsValue("UTC-OFFSET", "-0500"))).toBe("-05:00");
    expect(decoded(decodeIcsValue("UTC-OFFSET", "+0100"))).toBe("+01:00");
  });

  test("keeps seconds when written", () => {
    expect(decoded(decodeIcsValue("UTC-OFFSET", "-045602"))).toBe("-04:56:02");
    expect(decoded(decodeIcsValue("UTC-OFFSET", "+053000"))).toBe("+05:30:00");
    expect(decoded(decodeIcsValue("UTC-OFFSET", "+0000"))).toBe("+00:00");
  });

  test("reads -0000, which RFC 5545 forbids, as +00:00, with a warning", () => {
    expect(lenient(decodeIcsValue("UTC-OFFSET", "-0000"), /-0000/)).toBe("+00:00");
    expect(lenient(decodeIcsValue("UTC-OFFSET", "-000000"), /-0000/)).toBe("+00:00:00");
  });

  test("accepts a missing sign or colons, with warnings", () => {
    expect(lenient(decodeIcsValue("UTC-OFFSET", "0530"), /sign/)).toBe("+05:30");
    expect(lenient(decodeIcsValue("UTC-OFFSET", "+05:30"), /colons/)).toBe("+05:30");
    expect(lenient(decodeIcsValue("UTC-OFFSET", "-04:56:02"), /colons/)).toBe("-04:56:02");
  });

  test("rejects out-of-range parts and other shapes", () => {
    for (const raw of ["+2400", "+0160", "+010060", "+5", "+01000", "", "UTC", "+01:0"]) {
      rejected(decodeIcsValue("UTC-OFFSET", raw));
    }
  });

  test("writes ±HHMM[SS], never -0000", () => {
    expect(encodeIcsValue("UTC-OFFSET", "+05:30")).toBe("+0530");
    expect(encodeIcsValue("UTC-OFFSET", "-04:56:02")).toBe("-045602");
    expect(encodeIcsValue("UTC-OFFSET", "-00:00")).toBe("+0000");
    expect(() => encodeIcsValue("UTC-OFFSET", "0530")).toThrow(RangeError);
  });
});
