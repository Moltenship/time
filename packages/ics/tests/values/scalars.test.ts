import { describe, expect, test } from "vite-plus/test";

import { decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, rejected } from "./helpers";

describe("BINARY", () => {
  test("keeps RFC 5545 §3.3.1's base64 as written", () => {
    const raw =
      "AAABAAEAEBAQAAEABAAoAQAAFgAAACgAAAAQAAAAIAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAgIAAAICAgADAwMAA////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMwAAAAAAABNEMQAAAAAAAkQgAAAAAAJEREQgAAACECQ0QgEgAAQxQzM0E0AABERCRCREQAADRDJEJEQwAAAhA0QwEQAAAAAEREAAAAAAAAREQAAAAAAAAkQgAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(decoded(decodeIcsValue("BINARY", raw))).toBe(raw);
    expect(decoded(decodeIcsValue("BINARY", "SGk="))).toBe("SGk=");
    expect(encodeIcsValue("BINARY", "SGk=")).toBe("SGk=");
  });

  test("rejects characters outside the base64 alphabet", () => {
    for (const raw of ["SGk$", "SG k=", "S=Gk", "SGk==="]) {
      rejected(decodeIcsValue("BINARY", raw));
    }
  });
});

describe("BOOLEAN", () => {
  test("reads TRUE and FALSE in any case", () => {
    expect(decoded(decodeIcsValue("BOOLEAN", "TRUE"))).toBe(true);
    expect(decoded(decodeIcsValue("BOOLEAN", "false"))).toBe(false);
    expect(decoded(decodeIcsValue("BOOLEAN", "True"))).toBe(true);
    expect(encodeIcsValue("BOOLEAN", true)).toBe("TRUE");
    expect(encodeIcsValue("BOOLEAN", false)).toBe("FALSE");
  });

  test("rejects anything else", () => {
    for (const raw of ["yes", "1", "", "TRUE "]) {
      rejected(decodeIcsValue("BOOLEAN", raw));
    }
  });
});

describe("CAL-ADDRESS and URI", () => {
  test("keep RFC 5545's examples as written", () => {
    expect(decoded(decodeIcsValue("CAL-ADDRESS", "mailto:jane_doe@example.com"))).toBe(
      "mailto:jane_doe@example.com",
    );
    expect(decoded(decodeIcsValue("URI", "http://example.com/my-report.txt"))).toBe(
      "http://example.com/my-report.txt",
    );
    expect(encodeIcsValue("URI", "https://example.com/a,b;c")).toBe("https://example.com/a,b;c");
    expect(encodeIcsValue("CAL-ADDRESS", "mailto:a@example.com")).toBe("mailto:a@example.com");
  });
});

describe("FLOAT", () => {
  test("reads RFC 5545 §3.3.7's examples", () => {
    expect(decoded(decodeIcsValue("FLOAT", "1000000.0000001"))).toBe(1000000.0000001);
    expect(decoded(decodeIcsValue("FLOAT", "1.333"))).toBe(1.333);
    expect(decoded(decodeIcsValue("FLOAT", "-3.14"))).toBe(-3.14);
    expect(decoded(decodeIcsValue("FLOAT", "+12"))).toBe(12);
  });

  test("rejects exponents, bare points and other text", () => {
    for (const raw of [
      "1e5",
      ".5",
      "5.",
      "",
      "abc",
      "1,5",
      "37.386013;-122.082932",
      `1${"0".repeat(400)}`,
    ]) {
      rejected(decodeIcsValue("FLOAT", raw));
    }
  });

  test("writes without an exponent", () => {
    expect(encodeIcsValue("FLOAT", 1.333)).toBe("1.333");
    expect(encodeIcsValue("FLOAT", 1e-7)).toBe("0.0000001");
    expect(encodeIcsValue("FLOAT", -1.5e-10)).toBe("-0.00000000015");
    expect(encodeIcsValue("FLOAT", 1e21)).toBe("1000000000000000000000");
    expect(encodeIcsValue("FLOAT", 1.2345e22)).toBe("12345000000000000000000");
    expect(encodeIcsValue("FLOAT", -0)).toBe("-0");
    expect(() => encodeIcsValue("FLOAT", Number.NaN)).toThrow(RangeError);
    expect(() => encodeIcsValue("FLOAT", Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("INTEGER", () => {
  test("reads RFC 5545 §3.3.8's examples", () => {
    expect(decoded(decodeIcsValue("INTEGER", "1234567890"))).toBe(1234567890);
    expect(decoded(decodeIcsValue("INTEGER", "-1234567890"))).toBe(-1234567890);
    expect(decoded(decodeIcsValue("INTEGER", "+1234567890"))).toBe(1234567890);
    expect(decoded(decodeIcsValue("INTEGER", "432109876"))).toBe(432109876);
  });

  test("rejects fractions, unsafe integers and other text", () => {
    for (const raw of ["1.5", "", "12a", "- 1", "99999999999999999999", "0x10"]) {
      rejected(decodeIcsValue("INTEGER", raw));
    }
  });

  test("writes integers and refuses anything else", () => {
    expect(encodeIcsValue("INTEGER", -42)).toBe("-42");
    expect(() => encodeIcsValue("INTEGER", 1.5)).toThrow(RangeError);
  });
});

describe("unknown value types", () => {
  test("fail to decode and throw on encode", () => {
    const type = "X-NOPE" as "TEXT";
    rejected(decodeIcsValue(type, "a"));
    expect(() => encodeIcsValue(type, "a")).toThrow(TypeError);
  });
});
